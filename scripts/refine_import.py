"""Refine snapshot fields from the uploaded export; never writes the workbook."""
import json,datetime,warnings,sys
from pathlib import Path
import openpyxl
warnings.simplefilter('ignore')

p = Path('workbook.json')
data = json.loads(p.read_text(encoding='utf-8'))

# Search candidate workbook paths
candidate_paths = [
    Path('upload/01-CPSolvers-Content-Org-Chart-Important-links-1-.xlsx'),
    Path('../CPSolvers Content, Org Chart, Important links .xlsx'),
    Path('CPSolvers Content, Org Chart, Important links .xlsx')
]
wb_path = next((cp for cp in candidate_paths if cp.exists()), None)
if not wb_path:
    print("Source workbook not found; skipping import refinement.")
    sys.exit(0)

w = openpyxl.load_workbook(str(wb_path), data_only=True)

def val(c):
    v = c.value
    if v is None: return ''
    if isinstance(v, bool): return 'Yes' if v else 'No'
    if isinstance(v, (datetime.datetime, datetime.date)): return v.isoformat().split('T')[0]
    if isinstance(v, datetime.time): return v.isoformat()
    return str(v).strip()

def resolve_excel_row(record):
    """
    Deterministically map a runtime Members record to its source row in OrgStructure.
    NOTE: Runtime record.row in workbook.json is NOT identical to the Excel source row
    because Maddy Moulton (Excel row 61) was omitted from row 61 during legacy snapshot
    generation, causing all subsequent imported records (from Zachary Rothstein onward)
    to have their stored row shifted down by -1.
    """
    rec_id = record.get('id')
    # Maddy Moulton was Excel row 61, preserved under durable ID Members:236
    if rec_id == 'Members:236':
        return 61
    r = record.get('row')
    if r is None:
        raise ValueError(f"Record {rec_id} has no row number")
    # Rows 57–60 in workbook.json match Excel rows 57–60
    if r <= 60:
        return r
    # Rows from 61 onward (Zachary at runtime row 61 = Excel row 62) are shifted by -1
    return r + 1

cols = {'A':'Name','B':'Sponsor','C':'Social handles','D':'Country','E':'Birthday','F':'Email','G':'Location','H':'Subspecialty'}
STRUCTURAL_IDS = {'Members:80', 'Members:82', 'Members:146', 'Members:148', 'Members:189', 'Members:191'}

# 1. Validation phase BEFORE writing anything
mapped_rows = set()
validation_errors = []
substantive_count = 0
structural_count = 0
birthday_count = 0

for r in data['Members']['records']:
    er = resolve_excel_row(r)
    if er in mapped_rows:
        validation_errors.append(f"Duplicate Excel row mapped: {er} for record {r.get('id')}")
    mapped_rows.add(er)
    
    excel_name = val(w['OrgStructure'][f'A{er}'])
    stored_name = (r.get('fields', {}).get('Name') or '').strip()
    if excel_name != stored_name:
        validation_errors.append(f"Name mismatch at {r.get('id')} (Excel row {er}): Excel='{excel_name}' vs Stored='{stored_name}'")
    
    rec_id = r.get('id')
    if rec_id in STRUCTURAL_IDS:
        structural_count += 1
    else:
        substantive_count += 1
        bday_val = val(w['OrgStructure'][f'E{er}'])
        if bday_val:
            birthday_count += 1

if validation_errors:
    print(f"Validation failed with {len(validation_errors)} error(s); stopping without writing:")
    for err in validation_errors[:10]:
        print("  -", err)
    sys.exit(1)

if substantive_count != 148 or structural_count != 6 or birthday_count != 127:
    print(f"Count assertion failed: substantive={substantive_count} (expected 148), structural={structural_count} (expected 6), birthdays={birthday_count} (expected 127). Stopping without writing.")
    sys.exit(1)

# 2. Refinement phase (only reached if all 154 records, 148 members, 6 structural, 127 birthdays match 100%)
data['Members']['columns'] = list(cols.values())
for r in data['Members']['records']:
    er = resolve_excel_row(r)
    r['fields'] = {label: val(w['OrgStructure'][f'{col}{er}']) for col, label in cols.items()}
    r['links'] = {label: w['OrgStructure'][f'{col}{er}'].hyperlink.target for col, label in cols.items() if w['OrgStructure'][f'{col}{er}'].hyperlink and w['OrgStructure'][f'{col}{er}'].hyperlink.target}

for tab, group in data.items():
    group['records'] = [r for r in group['records'] if not (tab == 'CPS Academy VMRs' and r['fields'].get('Facilitator') == 'Facilitator') and not (tab == 'CRC - retired' and __import__('re').match(r'^ROUND\s*\d+', r['fields'].get('MENTEE', ''), __import__('re').I))]
    for r in group['records']:
        for field, value in r['fields'].items():
            if ('date' in field.lower() or field == 'Review deadline (source)') and value and not __import__('re').match(r'^\d{4}-\d{2}-\d{2}$', value):
                flag = field + ': original text retained; date/time needs verification'
                if flag not in r['flags']: r['flags'].append(flag)

p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print('Validated and refined member fields and import flags (148 members, 6 structural, 127 birthdays)')
