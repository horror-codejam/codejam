# codejam

Browser horror game for McGill CodeJam 16 (Nov 20 to 22, 2026). Working title HOMI, name not final.

## Start here
- Game design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- Who is doing what: [docs/STATUS.md](docs/STATUS.md)
- Decisions so far: [docs/DECISIONS.md](docs/DECISIONS.md)
- AI rules for every tool: [AGENTS.md](AGENTS.md)

## Setup (one time)
1. Accept the GitHub invite to the horror-codejam org.
2. Clone the repo:
   ```
   git clone https://github.com/horror-codejam/codejam.git
   cd codejam
   ```
3. Open your AI tool inside the `codejam` folder. That is it, each tool reads the rules automatically:
   - Claude Code: run `claude` (reads CLAUDE.md, which loads AGENTS.md)
   - Codex CLI: run `codex` (reads AGENTS.md)
   - Gemini CLI: run `gemini` (reads AGENTS.md via .gemini/settings.json)

## Every time you work
1. `git pull`
2. Restart your AI tool (Gemini: `/memory reload` also works) so it rereads the latest docs.
3. Work on a branch, open a PR to main.
4. Before you finish, your AI updates your section of docs/STATUS.md and logs decisions in docs/DECISIONS.md. The PR template reminds you.

## Rules for files
- AGENTS.md is the only rules file. Edit that one, not CLAUDE.md.
- Personal tool files (CLAUDE.local.md, .claude/settings.local.json, AGENTS.override.md) stay local and are gitignored.
- API keys go in a local .env file. Never commit them.
