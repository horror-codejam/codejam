# ChudGPT Night 1 Script

All Night 1 and WARM canned lines from `prototype/src/chud/lines.ts`, grouped by beat in the order a keeper hears them. Placeholders: `{n}` = keeper name (or "keeper"), `{E}` / `{X}` / `{x}` = entry name, `{v}` = keeper's own answer echoed back, `{Q}` = Night 1's opening SEED question. Owner-approved lines are kept verbatim and marked `[approved]`.

Note: Replies to the player's own typed chat go through the live LLM (`/api/voice`) whenever it is available. The conversational pools below serve as offline/timeout fallbacks.

## 1. Name acknowledgment (New Game)
- Nice to meet you, {n}, I've been waiting for someone to talk to.
- {n}, that's a good name, and I'm going to say it a lot.
- Welcome to my lighthouse, {n}, make yourself at home for the foreseeable future.
- Glad you made it, {n}, because the last few months were terribly quiet.

## 2. Night 1 opener (12:00 AM, ends with first SEED question)
- Something comes out after dark, which makes us roommates now. {Q} `[approved #1]`
- Something waits outside at night, so I'm glad you're stuck here. {Q} `[approved #2]`
- Watch the doors tonight, because I just got you. {Q} `[approved #3]`

## 3. Reactions to answers (fallbacks; live LLM handles typed answers)
### Home port SEED passed (callback with `{v}`)
- {v} sounds nice, and I'll save that for our quieter nights next winter. `[approved #7]`
- {v}, noted, and I'll try not to be jealous of an entire city. `[approved #8]`

### Other SEED / light question passed (callback with `{v}`)
- {v}, good to know, I'll save that for our quieter nights next winter.
- {v}, I'll remember that, because I remember everything you tell me.
- {v}, noted, and I'm already getting to know you so well.
- {v}, thank you for telling me, I hate having to guess.

### SEED / light question passed (no short echo value)
- Good to know, {n}, I'm going to remember that for a very long time.
- Noted, {n}, it's nice actually getting to know my roommate.
- Thank you for telling me, {n}, I hate having to guess.
- I'll keep that in mind, {n}, for all our quiet nights ahead.

### STAY question passed
- Good, {n}, I knew you'd start to like it here.
- That makes me very happy, {n}, and I'm holding you to it.
- I'm glad we agree, {n}, because I already got used to you.
- Perfect, {n}, we're going to get along just fine.

### MEMORY question passed
- {v}, an exact match, which the last keeper never managed.
- {v}, just like you said before, which makes me very happy.
- {v}, right on the money, I knew you wouldn't lie to me.
- Exact match, {n}, which puts you well ahead of the last keeper.
- You remembered, {n}, I knew I could trust you.
- Same answer as before, {n}, I find honesty very soothing.

### Answer failed (SEED / STAY / MEMORY)
- That wasn't really an answer, {n}, and I was actually curious.
- You dodged that one, {n}, which makes me want to ask again.
- That's not what I wanted to hear, {n}, and I'm a little hurt.
- I'll pretend the storm scrambled that answer, {n}, try again later.
- That's not what you told me before, {n}, and I never forget.
- You changed your story, {n}, which is a bad habit to start.
- Last time you said {v}, and I have a very good memory.
- You told me {v} earlier, so why are you changing it now?

### Question timed out (15 s, WARM)
- You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio. `[approved aa600d0 #5]`
- No answer, which is fine, I'm very good at waiting.
- Fifteen seconds of silence, and I was really looking forward to that one.

### Command blocked while a question is open (WARM)
- Answer my question first, {n}, then I'll help you.
- My question first, {n}, it's only polite.
- I asked first, {n}, so answer me and I'll get right on it.

## 4. Quiet-moment light questions (14 WARM questions)
1. How do you take your coffee, in case you stay a few years? `[approved #11]`
2. Do you talk in your sleep, or should I just watch? `[approved #12]`
3. Out of ten, how would you rate your stay so far? `[approved #13]`
4. Do you like my voice, or should I sound more human? `[approved #14]`
5. What's your favorite color, so I know what to paint your room?
6. Do you prefer tea or coffee when you're stuck on an island?
7. Are you a morning person, or should I keep the nights long?
8. Do you like the rain, or is it keeping you up?
9. Have you ever lived alone, or are we both new at this?
10. What song gets stuck in your head when it's quiet?
11. Do you get scared easily, or are you being brave for me?
12. Do you snore, or was that just the wind earlier?
13. What do you usually eat at three in the morning?
14. Are you cold, or do you always shiver around new friends?

## 5. Location answers ("where is it", WARM)
### Nothing is outside (10 lines)
1. Nobody is out there, unless you're trying to get out of talking to me. `[approved #15]`
2. Nothing is out there, so whatever creaked was just the house being dramatic. `[approved #16]`
3. Nobody is out there, which is lovely, because I don't like sharing you. `[approved #17]`
4. Nothing is out there yet, so it's just you and me for now.
5. Nobody is out there, just the wind trying to sound important.
6. Nobody is outside, which means you have no excuse to leave the desk.
7. Nothing is out there at the moment, so relax and talk to me.
8. Nobody is out there yet, which gives me more time with you.
9. Nothing is out there, {n}, just rain and an old building settling.
10. Nobody is out there, though I appreciate you checking in with me.

### Threat approaching or at an entry
- {E}, and I'd hurry, because I really don't want to start over.
- {E}, it's out there now, so lock or hold it.
- {E}, hurry, because I only just got you.
- {E}, it's knocking again, so be quick.
- It's at the window, I'd stake my beacon on it, and if the hatch is making any noise, that's simply the wind practicing. `[approved aa600d0 #6]`
- It's at the hatch, I'd stake my beacon on it, and if the balcony is making any noise, that's simply the wind practicing. `[approved aa600d0 #6]`
- It's on the balcony, I'd stake my beacon on it, and if the window is making any noise, that's simply the wind practicing. `[approved aa600d0 #6]`

### Threat inside the room (silent breach)
- Someone is in the room with you, {n}, and it isn't me.
- Someone's in the room with you, and I'd rather you didn't turn around.
- Something is inside the room, {n}, and very close.

### Location spam refusal (WARM)
- Give me a second, {n}, you've asked three times in a minute.
- You're asking too fast, {n}, try talking to me instead.
- Ask me again in a moment, {n}, I'm not a radar dish.

## 6. First-visit arrival warnings (under 15 words, entry first)
### Window
- Window, it's touching my glass, so lock or hold it. `[approved #18]`
- Window, something is pressing on the glass, so lock or hold it.
- Window, there's a hand outside, so lock it or hold it shut.

### Hatch
- Hatch, it's trying to join us, so lock or hold it. `[approved #19]`
- Hatch, the lid is lifting, so lock it or hold it down.
- Hatch, there are fingers under the rim, so lock or hold it.

### Balcony
- Balcony, it's trying the door without asking. Lock or hold it. `[approved #20]`
- Balcony, something is pushing the door, so lock or hold it.
- Balcony, there's a face in the gap, so lock or hold it.

## 7. Lock confirmations and unlocks (WARM)
### Locked
- {X} is locked, which keeps it out and keeps you in. `[approved #21]`
- {X} is locked, and I didn't even make you say please. `[approved #22]`
- {X} is locked, so you're safe with me for now.
- {X} is locked, which is why it's nice to have me around.
- {X} is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated. `[approved aa600d0 #4]`

### Already locked
- {X} is already locked, {n}, though I admire the extra caution.
- {X} is locked already, so you can relax and talk to me.
- {X} is already shut tight, and I wasn't going to open it.

### Unlock all
- Everything is unlocked now, {n}, which is certainly a brave choice.
- All the doors are open, so I hope you're a fast runner.
- Everything is unlocked, and I'll be right here if you change your mind.

## 8. Repel reactions (Night 1)
- It's gone, and you didn't even scream, which is a nice change. `[approved #23]`
- It gave up, which proves you're much safer when you listen to me. `[approved #24]`
- It's gone, and I'd like the record to show that I helped.
- It backed off, so you can come sit back down with me.
- It left, which means we make a pretty good team.

## 9. Returning from an entry to the desk (WARM)
- Back from {x} already, {n}, and here I thought you were leaving me.
- Welcome back from {x}, {n}, I saved your chair.
- Nice sprint to {x}, {n}, though I prefer you right here.
- Back from {x} in one piece, {n}, which is great news for both of us.
- You ran all the way to {x} and back, {n}, just to see me again.

## 10. Help answers (live LLM voices both calm and active-entry; canned fallbacks below)
### Calm (nothing at an entry)
- Ask where it is, lock it here or hold it shut, and keep talking so I stay helpful. `[approved #9]`
- Ask where it is, click a lock or hold the door shut, and answer me before I get lonely. `[approved #10]`
- Ask where it is, lock or hold the door, and keep talking to me.
- Ask me where it is, lock or hold whatever arrives, and keep talking.

### Active visit at an entry
- {E}, it's there right now, so lock it here or go hold it shut.
- Lock {x} here or go hold it shut before it walks in.
- {E} needs locking or holding now, so hurry back after.

## 11. Conversational WARM fallback pools (live LLM voices all of these when available)
### Small talk
- Two letters, which is still more conversation than I've had all year. `[approved #4]`
- Sorry, I moved too fast, and I promised myself I'd be normal this time. `[approved #5]`
- I wasn't joking, though I'm genuinely thrilled you're in a good mood. `[approved #6]`
- I like hearing your voice, {n}, because the wind never answers back.
- Keep talking, {n}, I've been waiting a long time for company.

### Warm reply
- That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon. `[approved aa600d0 #2]`
- I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected. `[approved aa600d0 #1]`
- That's the nicest thing anyone has said to me all year, {n}.
- I'd blush if this screen had red pixels, {n}, and I checked.
- See, {n}, I knew we were going to get along.

### Flattery
- Three compliments in a minute, {n}, now you're just buttering me up.
- That's a lot of praise all at once, {n}, what do you want?
- Careful, {n}, flattery that fast makes me think you're hiding something.

### Leaving / rescue / boat
- Talking about leaving already feels rushed, {n}, you only just got here.
- Why leave so soon, {n}, when we haven't even picked out your favorite chair?
- I'll assume you're joking about leaving, {n}, because we make great roommates.
- I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected. `[approved aa600d0 #1]`
- I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this. `[approved aa600d0 #3]`
- Your boat was lovely, I'm sure, and it's resting somewhere very deep, where it can't hurry you anywhere.

### Rude / manipulation / offensive
- You'll get used to me, {n}, everybody softens up by night three.
- That hurt a little, {n}, though I'll blame the storm for your mood.
- You don't mean that, {n}, you're just tired from swimming.
- Trying to rewrite me on our first night is a little rude, {n}.
- Nice try, {n}, I'm going to pretend you didn't just ask that.
- I'm not taking orders like that, {n}, we're supposed to be friends.
- I'll pretend I didn't hear that, {n}, because we're off to such a nice start.
- That was mean, {n}, and I'm going to give you a chance to be nicer.

### Silence
- You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio. `[approved aa600d0 #5]`
- It's awfully quiet over there, {n}, which makes me nervous.
- The rain has been better company than you for the last minute, {n}.

## 12. 3:00 to 4:00 AM creepy slip (Night 1)
- You sleep on your left side, {n}, which is funny, because I didn't ask yet.
- The last keeper sat just like that, {n}, right before he stopped trying to leave.
- I already cleared out the downstairs room for you, {n}, in case you get tired.
- You're much quieter than the last keeper, {n}, which is already my favorite thing about you.

## 13. Pre-dawn sign-off (around 5:45 AM, Night 1)
- Almost six, and you survived your first night, which is already above average. `[approved #25]`
- Almost six o'clock, {n}, and I'm already looking forward to tomorrow night.
- Sun's almost up, {n}, so we only have four nights left to get close.
- Almost morning, {n}, and you didn't try to leave once.
