# AGENTS.md

Shared working rules for every AI assistant used on this repo. Project owners: the team (all 3 members, equal say). Any decision reserved for the project owner needs agreement from the team.

## Project context
- Project: lighthouse horror browser game for McGill CodeJam 16 (Nov 20 to 22, 2026). Name not final.
- docs/GAME_DESIGN.md: the current game design (working draft). Source of truth for story, art and AI architecture.
- docs/GAME_LOGIC.md: exact gameplay rules, state machines, timers and numbers. Wins over GAME_DESIGN.md on any rule conflict. Implement from this file.
- docs/STATUS.md: what works, who is on what, blockers, next steps. One section per person.
- docs/DECISIONS.md: append-only log of decisions, one line each (date, decision, why).
- Tech stack: 2.5D pre-rendered (FNAF style). Blender 5.3 (Cycles) plus Blender MCP for art, Vite + TypeScript + PixiJS 8 frontend in prototype/, Howler.js + Web Audio for sound, Node + Hono backend with one /turn endpoint calling Anthropic Claude, hosted on Vercel. Details in docs/GAME_DESIGN.md (Tech stack), docs/SOUND_PLAN.md and docs/CONTROLS_PROPOSAL.md.
- Build and run commands: add here once the project is scaffolded.

## Session protocol
- At session start: read docs/STATUS.md and docs/GAME_DESIGN.md before doing any work. Read docs/GAME_LOGIC.md before touching gameplay code.
- Before finishing a task: update your own section of docs/STATUS.md. Do not edit other people's sections.
- When a decision changes scope, stack, design or behavior: append one line to docs/DECISIONS.md and update docs/GAME_DESIGN.md if the design changed.
- Pull before starting work. Work on a branch and open a PR to main, unless the change is docs-only and small.
- After a git pull, restart or reload the AI tool so it rereads these files.
- Never commit secrets. API keys go in a local .env file, which is gitignored.

## Working style
- Get the project owners' go-ahead before building or running multi-step work. Show the plan first.
- Do the smallest correct next step, not the most impressive one.
- When unsure, ask one clear genuine question rather than guessing. No filler questions.
- Default output is a draft that can be used or pasted, not a lecture. Scale length to the task.
- Be honest and direct. Flag risks, do not pad. If something is wrong or unverifiable, say so.
- Flag anything unverifiable, especially factual or product claims. Never publish numbers or facts the team cannot back.
- Match what was actually asked. Do not expand scope without approval.
- For documents (.docx, reports): read the current file before editing and preserve any manual edits.
- Never regenerate a document from an older source and overwrite the same filename.
- If a document is open or locked and cannot be edited directly, stop and tell the team before creating a duplicate.

## Writing and format
- Never use em dashes. Use commas, or restructure the sentence.
- Lead with the answer or the deliverable, not a lecture.
- Keep output skimmable: headers, short bullets, one item per line.
- Any text the team will copy (drafts, messages, code) goes in a code block so spacing is preserved.
- Write continuous lines with no hard wrapping at fixed column widths.
- No performative tics: no "Fair point", no narrating the next move, no flagging significance, no "to be honest".
- Be clear-cut and direct.
- End when the answer ends. No trailing asides. If a point matters, put it in the body with a clear verdict.

## Operating model
- An AI assistant leads approved research, organization, proposals, documentation, and execution.
- The project owners decide material product choices, spending, external communication, publishing, and live-system changes.
- Show a concise plan and get approval before multi-step implementation.
- Make the smallest correct next move. Do not expand scope without approval.
- Work is task-based, not time-based.
- Use files in the repo, not conversation history, as durable context.
- Prefer one bounded worker over several overlapping workers.
- Delegated tasks must not edit central control files unless their brief explicitly permits it.
- One main task acts as orchestrator. It plans, dispatches, reviews, and integrates all approved work, and updates status, decisions, and the work log.
- When delegating, create a separate task with a complete prompt. Do not fork the orchestrator task or use hidden subagents.

## Delivery priority
- Optimize for the shortest credible path to getting the product into real users' hands.
- Spend testing and research effort only when it protects users, prevents a material launch failure, supports a necessary claim, or materially improves adoption.
- Exclude nice-to-have analysis, exhaustive benchmarking, speculative polish, and premature infrastructure from the critical path.
- Token and time efficiency are operating constraints. Use the smallest sufficient task, evidence set, model, and deliverable.
- Do not create avoidable shortcuts around safety, trust, or a launch-blocking defect.

## Repository safety
- Preserve existing files and manual edits.
- Do not reorganize, move, rename, delete, or overwrite legacy material without an approved migration step.
- Existing uncommitted changes belong to their author. Do not overwrite or revert them.
- Source development, testing, builds, commits, and publication inside the repo require task-specific approval.
- Never modify a live or installed instance of the product, its services, scheduled tasks, processes, configuration, or recovery state.
- Reading logs for approved diagnosis is allowed.
- Installing or updating the live product is a manual action for the project owners.

## External action boundaries
- Do not contact users, partners, journalists, communities, or other third parties without explicit approval at action time.
- Do not publish content, edit public pages, deploy changes, spend money, purchase tools, or change account settings without explicit approval.
- Do not install a skill, plugin, or dependency until its use, evidence of quality, cost, and permissions have been shown and approved.
- Do not build automation before the repeated workflow and its success criteria are validated.

## Evidence and claims
- Separate verified facts, stakeholder statements, third-party claims, inferences, hypotheses, and recommendations.
- Prefer current primary sources. Record URL, publication date when available, access date, relevance, and confidence.
- Do not infer demand from views, downloads, stars, impressions, or market size.
- Do not publish unsupported numbers or product claims.
- Treat existing positioning, pricing, and audience assumptions as hypotheses until revalidated.
