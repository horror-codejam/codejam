# codejam

McGill CodeJam 16 horror game (Nov 20 to 22, 2026).

## AI assistant setup
- `AGENTS.md` (repo root): the shared AI rules, the single source of truth. Edit this one.
- `CLAUDE.md` (repo root): imports `AGENTS.md`. Claude Code reads it automatically, no setup.
- `chatgpt-instructions.txt` (repo root): ChatGPT cannot read the repo, so copy this file into your ChatGPT Project instructions once.
- When `AGENTS.md` changes, re-paste the updated `chatgpt-instructions.txt` into ChatGPT.
