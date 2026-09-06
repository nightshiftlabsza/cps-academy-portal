"""Refine snapshot fields from the uploaded export; never writes the workbook."""
import json,datetime,warnings
from pathlib import Path
import openpyxl
warnings.simplefilter('ignore')
p=Path('workbook.json'); data=json.loads(p.read_text())
w=openpyxl.load_workbook('upload/01-CPSolvers-Content-Org-Chart-Important-links-1-.xlsx',data_only=True)
def val(c):
 v=c.value
 if v is None:return ''
 if isinstance(v,bool):return 'Yes' if v else 'No'
 if isinstance(v,(datetime.datetime,datetime.date)):return v.isoformat().split('T')[0]
 if isinstance(v,datetime.time):return v.isoformat()
 return str(v).strip()
cols={'A':'Name','B':'Sponsor','C':'Social handles','D':'Country','F':'Email','G':'Location','H':'Subspecialty'}
data['Members']['columns']=list(cols.values())
for r in data['Members']['records']:
 r['fields']={label:val(w['OrgStructure'][f'{col}{r["row"]}']) for col,label in cols.items()}
 r['links']={label:w['OrgStructure'][f'{col}{r["row"]}'].hyperlink.target for col,label in cols.items() if w['OrgStructure'][f'{col}{r["row"]}'].hyperlink and w['OrgStructure'][f'{col}{r["row"]}'].hyperlink.target}
for tab,group in data.items():
 group['records']=[r for r in group['records'] if not(tab=='CPS Academy VMRs' and r['fields'].get('Facilitator')=='Facilitator')]
 for r in group['records']:
  for field,value in r['fields'].items():
   if ('date' in field.lower() or field=='Review deadline (source)') and value and not __import__('re').match(r'^\d{4}-\d{2}-\d{2}$',value):
    flag=field+': original text retained; date/time needs verification'
    if flag not in r['flags']:r['flags'].append(flag)
p.write_text(json.dumps(data,ensure_ascii=False))
print('Refined member fields and import flags')
