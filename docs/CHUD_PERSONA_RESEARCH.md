# ChudGPT Persona Research

Access date: 2026-11-24. Goal: keep ChudGPT's live replies consistently in voice, instantly readable, and non-deterministic under our 2.5 s latency budget.

## Findings

1. **Anthropic Claude guidance (role prompting, multishot, prefill, temperature)**
   - Role framing in `system` sets voice and scope fast; 3 to 5 diverse, XML-wrapped `<examples>` beat long prose rules for tone and length (Anthropic docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting , https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts ).
   - Newer Claude models deprecate assistant prefill and some non-default sampling overrides (`400` errors on newer configs). Rely on clear prompts, `max_tokens`, and default temperature rather than prefill.
2. **Roleplay character cards (SillyTavern practice)**
   - Example dialogue (`mes_example`) is the strongest lever for cadence, subtext, and length; keep 3 to 5 compact exchanges covering varied reactions (casual, pushback, vulnerability) rather than lore dumps (https://docs.sillytavern.app/usage/core-concepts/characterdesign/ ).
3. **Voice bible and dynamic few-shot rotation (game NPC practice)**
   - Static few-shot lists cause mode collapse (the model clones one rhythm). Rotating a random subset of examples per request plus pruning chat history to the last 6 turns preserves variety without losing character.
   - Injecting recent openings or repeated phrases as lightweight anti-repeat hints stops loop ticks across turns.
4. **Contrastive negative examples and length control**
   - Pairing 1 to 2 explicit Bad vs. Good examples (wordy jargon vs. short deadpan) fixes verbosity better than "be concise" alone, backed by a tight `max_tokens` cap (around 65 tokens for ~20 words).
5. **Second-pass style rewrite**
   - Decoupling intent from style works well offline, but an always-on second LLM call risks blowing our 2.5 s live budget. A conditional second pass triggered only on hard failures (length, banned phrases, leaked game terms) gives the safety net without paying latency on good drafts.
6. **Existing persona skills and tools**
   - Public agent skills on https://skills.sh (such as `antislop-copywriting` and `acnlabs/persona-skills` on GitHub) focus on marketing copy or generic chat companions, not a latency-capped horror game AI with engine-owned state. Not worth adding as a dependency.

## Verdict for ChudGPT

- **Use:** compact plain-English `VOICE_SYSTEM` (wants, fears, plain-word rule, short banned list, 2 Bad -> Good contrastive pairs), **non-deterministic per-request rotation** of 4 to 5 examples drawn from the 3 approved live Q&A pairs plus 5 approved lines, default temperature (no prefill), tight `max_tokens` (~65), and our existing conditional single rewrite only for hard violations (too long, banned phrase, jargon, leaked game words, forbidden name).
- **Drop:** deterministic `styleSeedOf` hashing (it forced repeated runs of the same player message into the exact same shape), rigid single-sentence/8-shape forced templates (they caused long stacked clauses), and invented jargon bits ("Tab 4", "Mug 4", "2039 rota", "Cot B", "admiralty custom").
- **Skip external skills:** maintain our own slim `docs/CHUD_CHARACTER.md` and `prototype/server/prompts.ts`.
