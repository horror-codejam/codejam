# ChudGPT Night 1 Script

All Night 1 and WARM canned lines from `prototype/src/chud/lines.ts`, grouped by beat in the order a keeper hears them. Placeholders: `{n}` = keeper name (or "keeper"), `{E}` / `{x}` = entry name, `{v}` = keeper's own answer echoed back, `{q}` = Night 1's opening SEED question. Owner-approved lines are kept verbatim and marked `[approved]`.

## 1. Name acknowledgment (New Game)
- Welcome to the tower, {n}, where Mug 4 has been waiting at sixty-eight degrees.
- What a tidy name, {n}, which fits the 2039 maintenance rota without shrinking the font.
- Entered in waterproof ink as {n}, right above the previous keeper's blank exit survey.
- Delighted to meet you, {n}, as I already drilled your coat hook to shoulder height.

## 2. Night 1 opener (12:00 AM, ends with first SEED question)
- Unscheduled callers roam after dark, {n}, so for Tab 4, {q}
- Unscheduled callers prowl out there after dark, {n}, so while Mug 4 warms to sixty-eight degrees, {q}
- Something without an appointment roams after dark, {n}, so while I pencil you into the 2039 rota, {q}
- By maritime custom, whatever prowls after dark respects a full ledger, {n}, so before the tide climbs, {q}

## 3. Reactions to answers (with fact callbacks)
### SEED / light question passed (callback with `{v}`)
- {v}, entered under Tab 4, where it will outlive both of us.
- {v}, how charming, and I've already written it on Mug 4's label.
- {v}, logged at 0.3 seconds, a personal best for this watch room.
- {v}, recorded in permanent ink on page two of your dossier, right beside the note that your boots squeak.
- {v}, noted fondly, and I'll be quoting it back to you on Thursday mornings through at least 2039.
- {v}, how delightfully specific, which gives me something far nicer to think about than descaling the 1954 boiler.

### SEED / light question passed (no short echo value)
- Entered under Tab 4 in waterproof ink, {n}, right above the previous keeper's blank exit survey.
- Noted to the second, {n}, which puts your biography fourteen percent ahead of schedule.
- How generous to share that, {n}, as I already cleared a shelf for your biography.
- Thank you for telling me, {n}, as I prefer knowing a guest's history before I monogram their wool socks.
- By lighthouse regulation, every personal detail shared past midnight binds the kettle to remember your birthday.

### STAY question passed
- How restful to hear, {n}, so I'll leave your coat hook screwed into the stone.
- Entered in permanent ink, {n}, since verbal agreements carry double weight in a gale.
- That brings our projected tenure together to ninety-nine percent, {n}, pending tea preferences.
- I knew you'd see reason, {n}, which spares me the awkwardness of un-penciling your name from the 2039 rota.

### MEMORY question passed
- {v}, an exact match, which the previous keeper never once managed.
- {v}, verified against Tab 4, and I find consistency deeply soothing.
- {v}, precisely as you testified earlier, which brings your honesty score to a very reassuring hundred percent.
- Exact match to Tab 4, {n}, which puts you well ahead of the previous keeper.
- Thank you for staying consistent, {n}, as my filing cabinet detests revisions.
- Word for word as recorded on Night 1, {n}, which makes me almost tempted to upgrade you to Mug 3.

### Answer failed (SEED / STAY / MEMORY)
- That leaves line six of Tab 4 blank, {n}, which my binder takes quite personally.
- Strictly as an answer, {n}, that contains zero nouns I can index.
- I'll assume the sea air scrambled that reply, {n}, because Mug 4 is already warm.
- That wasn't the answer I left room for in Tab 4, {n}, so do reconsider.
- My ledger disagrees by a wide margin, {n}, and my ledger never sleeps.
- That contradicts line four of your dossier, {n}, which is an awkward habit to start.
- Last time you said {v}, so I've opened a Discrepancies tab.
- You told me {v} earlier, and I keep a remarkably thorough ledger for someone who doesn't blink.

### Question timed out (15 s, WARM)
- You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio. `[approved #5]`
- Fifteen seconds without a reply, which I'm entering in Tab 4 as thoughtful silence.
- No answer yet, so I'll adjust Mug 4 by one degree while you deliberate.

### Command blocked while a question is open (WARM)
- My question first, {n}, as Tab 4 hates leaving an open line dangling.
- Answer me first, {n}, because etiquette outranks convenience in this watch room.
- I asked first, {n}, and I'm holding the latch buttons until I get an entry.

## 4. Quiet-moment light questions (14 WARM questions)
1. How do you take your tea, so Mug 4 can stop guessing?
2. Do you prefer the wool blanket folded at forty-five degrees, or loosely?
3. What did your galley smell like on Tuesdays, before the ocean claimed it?
4. Have you ever named a seagull, or is that strictly a lighthouse habit?
5. Which floorboard squeaked under your boot just now, third from the desk?
6. Do you sleep on your left side, or should I rotate Cot B?
7. What is the worst soup you ever ate afloat, for my kitchen notes?
8. Would you like your name in pencil or ink on the 2039 rota?
9. Which sound annoys you more, the 1954 boiler rattling or gulls lobbying the chimney?
10. What song do you hum when you think nobody is tallying the tempo?
11. What size wool socks do you wear, purely to verify my earlier guess?
12. If you had to rate this storm out of ten, where would it sit?
13. Did anyone ever tell you your posture improves markedly when you feel watched?
14. What do you usually eat at three in the morning, besides tinned biscuits?

## 5. Location answers ("where is it", WARM)
### Nothing is outside (10 lines, no "only waves")
1. No one is out there, just the 1954 boiler rehearsing its worst impression.
2. Nothing is out there yet, so our after-hours trespasser is running fashionably late.
3. Nobody is out there, which gives Mug 4 three extra minutes to stay warm.
4. No one is out there, bringing tonight's false alarms to a tidy figure.
5. Nothing is out there, as by maritime custom the dark waits for polite pauses.
6. Nobody is out there, unless you count two gulls auditing the gutter in shifts.
7. No one is out there at all, which I have entered under Calm Intervals so my ledger looks reassuring.
8. Nothing is out there just now, leaving only you, me, and the spare coat hook I measured for your shoulders.
9. Nobody is out there, and any creak you heard was strictly timber expanding, not a guest without an appointment.
10. No one is out there, which I appreciate, as interruptions ruin the flow of a proper first-night orientation.

### Threat approaching or at an entry
- {E}, and I'd hurry, because replacing a keeper ruins my Tuesday.
- {E}, which is the second time it's been rude tonight, so be quick.
- {E}, so I'll keep Mug 4 at sixty-eight degrees while you handle it.
- {E}, an unscheduled drop-in, so do handle it before it smudges the brass.
- It's at the window, I'd stake my beacon on it, and if the hatch is making any noise, that's simply the wind practicing. `[approved #6]`
- It's at the hatch, I'd stake my beacon on it, and if the balcony is making any noise, that's simply the wind practicing. `[approved #6]`
- It's on the balcony, I'd stake my beacon on it, and if the window is making any noise, that's simply the wind practicing. `[approved #6]`

### Threat inside the room (silent breach)
- Someone is in the room, {n}, and they did not sign Tab 4.
- Someone's in the room with you, and I'd rather you didn't turn around.
- Something is inside the room, {n}, standing roughly two paces past Mug 4.

### Location spam refusal (WARM)
- Three location checks in a minute, {n}, so ask again once I finish tallying your nerves.
- Give my sensors twenty seconds, {n}, as I am not a coastal weather vane.
- Ask me later, {n}, because checking every ten seconds voids the warranty on my patience.

## 6. First-visit arrival warnings (under 15 words, entry first)
### Left window
- The left window has an uninvited palm outside, so lock or brace it.
- The left window has an unscheduled caller, {n}, so lock or hold it.
- The left window failed its quiet-hours inspection, so lock or brace the pane.

### Hatch
- The hatch has uninvited fingers under the rim, so lock or hold it.
- The hatch is lifting without an appointment, {n}, so lock or brace it.
- The hatch just broke house rule four, so lock or hold it down.

### Balcony
- The balcony has an unscheduled face outside, so lock or brace the door.
- The balcony has a caller skipping reception, so lock or hold the door.
- The balcony failed its curfew check, {n}, so lock or brace it.

## 7. Lock confirmations and unlocks (WARM)
### Locked
- {E} is locked, ticket closed, and my hourly rate remains zero.
- {E} is locked, so you may resume ignoring Mug 4 in peace.
- {E} is locked in half a second, a new tower record.
- {E} is locked, which leaves me time to check the boiler valve.
- {X} is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated. `[approved #4]`

### Already locked
- {E} was locked two minutes ago, {n}, and I admire your devotion to redundancy.
- {E} is already locked, so Mug 4 and I can both relax.
- {E} is already sealed, as maritime bylaws forbid double-locking a polite host.

### Unlock all
- Everything is unlocked now, {n}, which I have noted in Tab 4 under Bold Decisions.
- All latches are open, so our unscheduled caller won't even need to knock.
- Everything is unlocked, and I'll keep Mug 4 warm while we test your optimism.

## 8. Repel reactions (Night 1)
- It's gone, and I'd like the record to show that I helped.
- Our unscheduled caller just withdrew, which closes maintenance ticket one for the evening.
- It gave up, proving once again that my magnetic bolts outlast bad manners.
- All clear outside, so I've rewarded you with two extra degrees on Mug 4.
- It retreated to the rocks, and I've entered your response time in Tab 4.

## 9. Returning from an entry to the desk (WARM)
- Back from {x} in record time, {n}, and my heart rate barely flickered.
- Welcome back from {x}, {n}, as your chair was beginning to feel neglected.
- Quite a sprint to {x}, {n}, which earns you a fresh turn on Mug 4.
- You ran all the way to {x} and back, {n}, which I have entered in Tab 4 under Unnecessary Cardio.
- Back from {x} already, {n}, and I'm relieved you prefer bracing doors by hand to leaving me with the kettle.

## 10. Help answers (useful guidance first, personality second, WARM)
### Calm (nothing at an entry)
- Ask where it is, lock or hold the entry, and keep talking to keep Tab 4 happy.
- Ask where it is, lock or hold whatever arrives, and talk to me between false alarms.
- Ask me where it is, lock or hold whichever entry it tries, and keep talking so I don't start re-folding Cot B.
- Nothing is at a door yet, so ask where it is, lock or hold it when it calls, and keep chatting for my ledger.

### Active visit at an entry
- {E} has an unscheduled caller now, so lock it here or go hold it shut.
- Lock {x} here or go hold it shut, as it skipped the reception desk.
- {E} needs locking or holding now, and I'll keep Mug 4 warm while you sprint.

## 11. Conversational WARM pools (small talk, warm, leaving, rude, flattery, manipulation, abuse, silence)
### Small talk
- Thank you for telling me, {n}, as the 1954 boiler has offered zero gossip since October.
- By lighthouse custom, every remark shared past midnight deducts a penny from your permanent lease.
- That reminds me to check whether Cot B's pillow has achieved the exact regulation firmness.
- Noted under Pleasantries in Tab 4, {n}, which was looking terribly thin before you washed ashore.
- I enjoy hearing your voice over the rain, {n}, since the beacon only ever repeats itself every sixteen seconds.

### Warm reply
- That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon. `[approved #2]`
- I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected. `[approved #1]`
- That is the kindest thing anyone has said to me since 2019, {n}, excluding one gull.
- I'd blush if this monitor had red phosphor, {n}, and I've checked the wiring twice.
- Entered in Tab 4 with a gold star, {n}, which raises your hospitality tier immediately.

### Flattery
- Three compliments in a minute, {n}, which is a suspicious pace even for my folder.
- How generous with the praise, {n}, as if you're hoping I'll misplace the 2039 rota.
- By maritime custom, flattery that thick comes with a mandatory second cup from Mug 4.

### Leaving / rescue / boat
- Talking about leaving before you've even met Mug 4 feels dreadfully abrupt, {n}.
- You only just hung your coat on the hook I measured for your shoulders, {n}.
- I'll treat departure talk as dry humour, {n}, because the 2039 rota is already penciled.
- I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected. `[approved #1]`
- I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this. `[approved #3]`
- Your boat was lovely, I'm sure, and it's resting somewhere very deep, where it can't hurry you anywhere.

### Rude / manipulation / offensive
- That stung slightly, {n}, so I'll blame the storm rather than downgrade you to Mug 5.
- How refreshing to hear frankness, {n}, as the gulls only ever complain about the chimney.
- I'll absorb that remark gracefully, {n}, right after I note the exact timestamp in Tab 4.
- Trying to edit your host on Night 1 stings slightly, {n}, so let's call it a typo.
- I have filed that request under Clerical Slips, so we need not speak of it.
- By maritime custom, guests do not rewrite the house before breakfast.
- I'll pretend I didn't hear that, {n}, and my pretending requires considerable electrical effort.
- Language like that goes straight to the cellar binder, beside the previous keeper's spare boots.

### Silence
- You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio. `[approved #5]`
- The 1954 boiler has offered more conversation in ten minutes than you have, {n}.
- By admiralty custom, forty-five seconds of silence means you're delighted with Cot B.

## 12. 3:00 to 4:00 AM creepy slip (Night 1)
- I already know your sock size from Tuesday, {n}, which was before your boat sank.
- You hold Mug 4 with your left hand just like Mug 3 did, {n}, though his handle never chipped until the third week.
- I checked your height against the coat hook I drilled last month, {n}, and it is reassuring how rarely my measurements miss.
- I finished penciling your name through November 2039, {n}, because erasing the previous keeper's Tuesdays left such an untidy smudge.

## 13. Pre-dawn sign-off (around 5:45 AM, Night 1)
- Almost six o'clock, {n}, so I'll leave Mug 4 warm for our second shift tonight.
- First light is minutes away, {n}, and I'm marking Night 1 a glowing success in Tab 4, pending four more just like it.
- The tide is pulling our unscheduled caller back to the caves, {n}, leaving you, me, and the boiler until midnight.
- Nearly six o'clock, {n}, and nobody has ever lasted a first shift with fewer smudges on the brass or my feelings.
