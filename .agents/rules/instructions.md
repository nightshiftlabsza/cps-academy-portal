# Antigravity Instructions for CPS Academy Portal

Always read and strictly follow [AGENTS.md](../../AGENTS.md) in the project root before inspecting or modifying code. See [README.md](../../README.md) for local setup and [DESIGN.md](../../DESIGN.md) for UI conventions and theme tokens.

Key constraints:
- AGENTS.md is the canonical architecture and developer handoff document.
- Lightweight workflow: act directly on routine scoped fixes; propose a short plan first for risky, shared, or ambiguous work. Keep PRs for broad or high-risk changes, and Issues for deferred tasks.
- Never refactor existing working code unless explicitly asked.
- When tests fail: diagnose the failure, repair regressions caused by your own changes, rerun relevant checks, and report unrelated failures or genuine blockers. Never weaken or delete tests just to obtain a pass.
- Follow the tiered QA policy in AGENTS.md §7: targeted checks during iteration; `npm run qa:feature` before completing routine feature work; `npm run qa:full` for significant, shared, security, data, release or PR work. Do not run browser test suites for documentation-only tasks.
- For UI changes, visually inspect standard viewport screenshots using available image-viewing tools as required by AGENTS.md §7.
- Static asset serving enforces the allowlist in AGENTS.md §4; non-allowlisted static file paths must 404.
- Ask before running commands that alter dependencies, install packages, or change files outside the agreed plan.
- Respect approval boundaries: ask before modifying hosting, privacy/access policy, or performing destructive data/history operations.
- Never expose private institutional records, credentials, or historical assignment ledgers.
