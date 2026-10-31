# Slow Fist v2: defect log

Protocol: `QA-GUIDE.md` section 19. No fix is applied until Root cause, Class, Detect-similar and Fix-pattern are written and the QA guide catalogue (section 20) has been updated.

Run 1 of `tests/run.js`: 21 passed, 8 failed.

---

## DEF-001  Test helper `hit()` called with shifted arguments
Status:        FIXED (see bottom)
Found by:      CMB-01, CMB-02, CMB-03, CMB-06, KO-01 (all five errored: "Cannot set properties of undefined (setting 'state')")
Version/seed:  tests/run.js first run
Severity:      Major (five requirements untested, so a false alarm hid real results)
Symptom:       Five tests threw a TypeError on the first line of the helper.
Reproduction:  `node tests/run.js`
Root cause:    The helper was declared `hit(m, a, kind, ang, s, limb, counter)` where `a` is the attacker index, but every call site was written as `hit(m, kind, ang, s, limb)` (no index). Each argument therefore moved one place: the string `'straight'` became the attacker index, `m.f['straight']` is `undefined`, and the strike set-up crashed.
Why not caught earlier: The helper was written first and the calls afterwards from memory of an older signature; JavaScript accepts any number and type of arguments, and no check at the top of the helper validated them.
Class:         20.7 Silent argument shift in helpers
Detect similar: (1) every test helper validates its argument types on its first line and throws a clear message; (2) `tests/lint.js` scans each helper's declared parameter count against the number of arguments at each call site and reports calls whose first literal argument is a string where the declaration says number; (3) prefer one options object over more than three positional parameters.
Fix pattern:   Remove positional ambiguity: helpers take `(m, opts)` or fewer than four positional arguments, and assert types.
Instances found and fixed: `hit()` (all call sites). No other helper has more than three positional parameters except `strike()`, which is always called with explicit indices and is guarded by the new type assertion.
QA guide update: section 20.7
Regression test: LINT-01 (helper argument-type assertions) in `tests/run.js`

---

## DEF-002  Test fixture distance larger than a style's grab range
Status:        FIXED (see bottom)
Found by:      GRP-01 (assertion), GRP-02 (state `idle`, expected `down`)
Version/seed:  tests/run.js first run
Severity:      Major (grapple requirements untested)
Symptom:       Every grapple attempt reported `whiff`, even the clean one; no throw ever started.
Reproduction:  debug script: all eight grapple cases return `grappleFail reason=whiff`.
Root cause:    The shared fixture `pair()` places the fighters 60 px apart, but the Boxer's grab range is 55 px. The first check in `doThrow` (`dx > grab`) therefore always failed. The game code is right; the fixture was a magic number that disagreed with the configuration.
Why not caught earlier: The fixture distance was chosen to suit punches (reach 62 to 72) and reused everywhere; nothing tied it to the other ranges.
Class:         20.8 Magic-number fixtures that disagree with configuration
Detect similar: A fixture sanity test (FIX-01) asserts that the default distance is inside every range the tests rely on (grab range, punch reach plus margin, kick reach, collision separation). Derive distances from `CFG` (for example `min(grab) - 5`) instead of typing numbers.
Fix pattern:   Fixtures compute their numbers from configuration; a test of the fixture itself exists.
Instances found and fixed: `pair()` default distance.
QA guide update: section 20.8
Regression test: FIX-01

---

## DEF-003  Stamina goes negative: jump spends stamina without checking it
Status:        FIXED (see bottom)
Found by:      STA-02 (stamina and hp stay within bounds)
Version/seed:  seed 323, step 550, fighter 1 (Boxer vs Kicker AI fight)
Severity:      Minor (a transient negative value; could allow other effects such as a negative bar on screen)
Symptom:       `sta` was -2.27 after a step in which the fighter was idle, with no events.
Reproduction:  `node` script stepping seed 323 with both AI: step 550, fighter 1.
Root cause:    The jump handler subtracts 8 stamina when `!f.exh`, but the exhausted flag only turns on at the start of the next update when stamina is already 0 or less. A fighter with 5.5 stamina is not exhausted, so the jump is allowed and the subtraction takes it to -2.5. More generally, stamina costs are subtracted by direct writes in five places (`strike start`, `wind-up drain`, `tap`, `dash`, `jump`, `grab`) with no common affordability check and no clamp at the end of the update.
Why not caught earlier: Only costs with explicit `>=` checks (dash, grab, tap) were reasoned about; jump had no check, and unit tests covered one resource at a time.
Class:         20.9 Unchecked resource spend and late normalisation
Detect similar: (1) the invariant sweep (STA-02) over many seeds; (2) a scan (`tests/lint.js`) listing every direct write to a bounded resource (`.sta -=`, `.hp -=`, `.gHP -=`) so each can be reviewed; (3) a rule: all spending goes through one function `spend(f, cost)`.
Fix pattern:   One `spend()` that returns false and does nothing if the cost cannot be paid, and a single `normalise(f)` at the end of every update that clamps all bounded values (stamina 0 to 100, hp 0 to max, guard health 0 to max, balance -1 to 1) and sets the exhausted flag.
Instances found and fixed: jump (no check), strike start, wind-up drain, tap-boost, dash, grab, throw victim loss (clamped already).
QA guide update: section 20.9
Regression test: STA-02, STA-03 (jump with low stamina)

---

## DEF-004  Combo test compares two hits while the attacker's balance has changed in between
Status:        FIXED (see fix record)
Found by:      CMB-06 (run 2: ratio 1.2568, expected 1.1)
Version/seed:  tests/run.js second run
Severity:      Minor (test only; the game follows the spec)
Symptom:       The second hit of a combo did 25.7 percent more damage than the first instead of 10 percent.
Reproduction:  `node tests/run.js`, test CMB-06.
Root cause:    Two variables changed between the two measurements. The combo bonus (x1.10) is the one under test, but the first hit also ran `overreach()` on the attacker, setting its balance to 0.475, and damage includes a factor (1 + 0.3 x attacker balance) = 1.1425. 1.1425 x 1.10 = 1.2568, exactly the observed ratio. The game follows the spec ("weight forward adds power"); the test expectation was wrong.
Why not caught earlier: the expectation was written from the combo rule alone, without listing every state that a hit changes in the attacker and the victim.
Class:         20.10 Confounded expectation (a test changes more than the variable it measures)
Detect similar: for every test that compares two measurements, list the state each measurement changes (attacker balance, stamina, counters, timers, positions) and reset all but the one under test; a failing ratio that equals a product of two known factors is a sign of a confounder. A helper `freshAttacker(m)` resets the attacker between measurements.
Fix pattern:   Compare like with like: reset every side effect between measurements, or compute the expected value including the known side effect and assert it explicitly.
Instances found and fixed: CMB-06. Reviewed CMB-03 (each measurement uses a fresh match, no confounder) and CMB-01 (fresh match per measurement).
QA guide update: section 20.10
Regression test: CMB-06

---

## DEF-005  Ground clamp ignores the head radius; lying figure floats 7 px (latent, masked by the hands)
Status:        FIXED (see fix record)
Found by:      design review while writing the renderer; confirmed by script and a mutation check
Version/seed:  `pose.js` at run 3; state `down`
Severity:      Minor (visual: a lying fighter hovers 7 px above the floor; with the hands raised the head would sink 2 px)
Symptom:       Head bottom is 7.0 px above the floor in `down` (measured), so the body appears to hover. If the hands were placed on the floor the head circle would be 2.0 px under it (measured with a mutation).
Reproduction:  `skeleton(f)` with `state='down', t=0.3`; compare `head.y + LIMB.head` with `GY`.
Root cause:    Two causes. (1) The ground clamp considers only joint centres, while the head is drawn as a circle of radius 11, so the drawn extent can be under the floor even when every centre is above it. (2) In the lying pose the hand targets were set 18 px below the shoulder, 9 px under the floor, so the clamp lifted the whole figure by 9 px and, by accident, pushed the head up too. The test FLR-05 therefore passed for the wrong reason.
Why not caught earlier: FLR-02 checks joint centres only, as the requirement was written; no requirement or test covered drawn extents or floating, and I had not checked that a new test can fail.
Class:         20.4 (impossible geometry: centre versus extent) and 20.11 (a test that passes for the wrong reason)
Detect similar: (1) measure drawn extents, not only centres (head radius, line width, hand and foot radius); (2) also test the opposite bound: a lying figure must rest on the floor (lowest extent within 2 px of it), so floating is caught as well as sinking; (3) a mutation check: after writing a test, break the code deliberately in the way the test is meant to catch and confirm the test fails (`tests/mutate.js`).
Fix pattern:   The clamp works on extents (centre plus radius); poses are authored so that contact points sit at floor level and the clamp is only a safety net, not the thing that positions the figure.
Instances found and fixed: lying hands, ground clamp (head radius). Reviewed the feet: they are placed at floor level already.
QA guide update: sections 20.4 (addendum) and 20.11
Regression test: FLR-05, FLR-06 (lying figure rests on the floor), MUT-01 (mutation check)

---

## DEF-006  A line comment inserted mid-line swallowed the rest of a statement (class 20.1 again, self-inflicted)
Status:        FIXED (see fix record)
Found by:      MUT-01 ("Unexpected token ':'" when `tests/mutate.js` was loaded)
Version/seed:  `tests/mutate.js`, edit made during DEF-005 follow-up
Severity:      Minor here (the syntax error was loud); the same edit in a place that still parses would have been silent, as in v1.
Symptom:       `SyntaxError: Unexpected token ':'` at the next property of the `checks` object.
Reproduction:  `node tests/mutate.js`
Root cause:    A string-replacement patch added `// at least one foot must touch the floor` in the middle of a very long one-line function. Everything after the `//` on that line, including the `return` expression and the closing `},`, became part of the comment. The function lost its return value and its closing brace.
Why not caught earlier: (1) the lint scan only looked at `src/` and only for comments containing assignments, not for comments that hide code; (2) there is no syntax check of the test files before running them; (3) the one-line, multi-statement style of those functions makes any mid-line comment dangerous; (4) the patch was applied by text replacement without re-reading the line.
Class:         20.1 Swallowed statements (second instance)
Detect similar: (1) `node --check` / `new vm.Script` on every `.js` file under `src/` and `tests/` as the first step of the suite (SYNTAX-01); (2) lint rule: a `//` comment on a line whose code part is longer than 120 characters or holds more than two statements is rejected; (3) lint now scans `tests/` as well as `src/`.
Fix pattern:   Inline notes inside a line use `/* ... */`, never `//`; long one-liners are split into one statement per line; every automated patch is followed by a syntax check.
Instances found and fixed: `tests/mutate.js` line 15. The new scan was run over all files: see the fix record.
QA guide update: section 20.1 (second instance and stricter prevention)
Regression test: SYNTAX-01, LINT-01

---

## DEF-007  Debug handle clobbered: `window.SF_DEBUG.reset` disappears after the first reset
Status:        FIXED (see fix record 2)
Found by:      first browser session (manual call `SF_DEBUG.reset()` -> "reset is not a function")
Version/seed:  `src/main.js` at first browser build
Severity:      Minor (debug and test hook only), but it breaks browser tests that call the hook twice.
Symptom:       `TypeError: window.SF_DEBUG.reset is not a function`.
Reproduction:  load the page, call `SF_DEBUG.reset()` after any key press that resets (T, R, 1, 2).
Root cause:    `main.js` first creates `window.SF_DEBUG = { reset }`, then `reset()` itself assigns a brand-new object `{ match, styleSel, modes }` to the same name. Every reset therefore replaces the handle and drops the other members.
Why not caught earlier: the shell (`main.js`) has no automated test; Node tests load only the rules modules, so the browser-only file was verified by eye.
Class:         20.12 Shared handle replaced instead of updated
Detect similar: (1) a browser smoke test (`tests/browser-smoke.js`, run in the page) that checks the public hook has all its members before and after a reset; (2) a lint scan that finds more than one assignment to the same `window.X` name in a file.
Fix pattern:   Create the handle once and mutate its fields; never reassign an exported object after creation.
Instances found and fixed: `SF_DEBUG`. Scan: no other `window.` assignments exist in `src/`.
QA guide update: section 20.12
Regression test: LINT-01 (single assignment per window.* name) and the browser smoke test BR-01

---

## OBS-001  Help overlay seen ON after F1 had been pressed (not reproduced)
Status:        OPEN (observation, no defect proven)
Found by:      manual screenshot in the first browser session
Symptom:       The help overlay was visible in a screenshot taken after F1 had been dispatched once.
Reproduction:  Not reproduced in two clean runs (load, F1, mode changes, 14 s of AI vs AI): the overlay toggled correctly each time and stayed off. The first session had also been interrupted by the `reset` TypeError above.
Analysis:      The overlay state is a private variable, so it cannot be read from outside; the screenshot cannot be tied to a state. Class 20.5 (rare event, not exercised).
Action:        No code change (no cause shown). Detection added: `SF_DEBUG` exposes `help` so the browser smoke test can assert the overlay state directly (BR-02). If it recurs, record the exact key sequence and timing here.

---

## Fix record

Order followed for every defect: capture, reproduce, root cause, classify, generalise (detection + fix pattern), update the QA guide, then fix, then verify.

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-001 helper argument shift | 20.7 | `hit(m, kind, ang, s, limb)` with type checks; lint rule on call sites | CMB-01/02/03/06, KO-01 pass; LINT-01 |
| DEF-002 fixture distance 60 > grab 55 | 20.8 | `FIX_DIST = min(grab) - 5`; FIX-01 | GRP-01, GRP-02 pass; FIX-01 |
| DEF-003 stamina underflow | 20.9 | `spend()`, `drain()`, `gain()`, `normalise()` in `sim.js`; lint finds any unreviewed direct write | STA-02, STA-03, MUT (jump) |
| DEF-004 confounded combo test | 20.10 | attacker balance reset between the two measurements | CMB-06 |
| DEF-005 head radius / floating lying figure | 20.4 addendum, 20.11 | clamp uses extents; lying hip height and hands authored at floor level; FLR-05 sweeps rotations; FLR-06 added | FLR-05, FLR-06, MUT-01 |
| DEF-006 comment swallowed code (20.1 again) | 20.1 addendum | line split; `/* */` for inline notes; SYNTAX-01; lint scans `tests/` and flags long lines with `//` | SYNTAX-01, LINT-01 |

### Findings made while fixing (no defect, recorded for the guide)

- The first strict "feet float" check flagged the pose because the second foot is deliberately raised (a bent leg). The check was wrong, not the pose; it now requires that at least one foot touches the floor.
- Mutation `clamp ignores head radius` is an **equivalent mutant**: no reachable pose has the head as its lowest point (hands reach 99 px from the hip, head 78 px), so no test can ever see it. It was replaced by a mutation of the authored lying height, which is observable. Lesson recorded in 20.11: investigate a surviving mutant before blaming the test; some mutants cannot change behaviour.
- Lint reported five more lines at the same risk as DEF-006 in `src/`; all were reformatted at the same time.

### Test status after the fixes

36 passed, 0 failed (run 6). `node tests/lint.js`: 0 findings. `node tests/mutate.js`: 5 of 5 mutations detected, baseline clean. `node tests/sweep.js 270`: 0 timeouts, median fight 12.6 s, win shares Boxer 30 / Kicker 41 / Grappler 29 percent, all 16 move names used.

## Fix record 2 (browser session)

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-007 debug handle clobbered | 20.12, 20.13 | `window.SF_DEBUG` created once with getters; lint rule LINT-03 (one assignment per `window.*` name); `tests/browser-smoke.js` | browser smoke test: PASS (members present before and after R, T, 1, 2, [, ], reset; help flag toggles; simulation advances; no non-numeric state) |
| OBS-001 help overlay seen on (not reproduced) | 20.5 (existing) | no code change; `SF_DEBUG.help` exposed; BR-02 asserts it | BR-02 passes (load shows it, F1 hides it, F1 shows it again) |

Visual check in the browser (AI vs AI, three screenshots): both figures render with constant limbs, hit feedback (PARTIAL, 25 HEAD), flash on hit, HUD bars and the aim line all display; nothing is drawn under the floor line.

### Final status of this iteration

- `node tests/run.js`: 36 passed, 0 failed
- `node tests/lint.js`: 0 findings (syntax of src and tests, swallowed-statement scan, bounded writes, CFG writes, determinism, window handles, helper signature)
- `node tests/mutate.js`: 5 of 5 mutations detected, baseline clean
- `node tests/sweep.js 270`: 0 timeouts; median fight 12.6 s; win shares Boxer 30 / Kicker 41 / Grappler 29 percent; all 16 move names used
- Browser smoke test: PASS
- Open: OBS-001 (not reproduced)


---

# Iteration 2 (closing the gaps found while comparing with v1)

Requirements MOV-05, MOV-06, MOV-07, CMB-08, BAL-01, ANI-01 to ANI-04, SND-01 and HELP-01 were added to `docs/REQUIREMENTS.md` (section 6) and 11 tests were written first. They all failed (features absent), then the code was written. First full run: 45 passed, 2 failed.

## DEF-008  The stand-up is a squat-rise, not "hands and knees, one knee up, rise"
Status:        FIXED (see iteration 2 fix record)
Found by:      ANI-04 ("a kneeling stage exists (low hips, a knee near the floor)")
Version/seed:  `pose.js` first iteration-2 version
Severity:      Minor (appearance), but it fails the requirement.
Symptom:       Between 30 and 55 percent of the stand-up the hips are 28 to 45 px up, both feet are flat on the floor and both knees are 35 to 46 px above the floor. No knee ever touches down, so it looks like a squat, not a martial artist's stand-up.
Reproduction:  `skeleton(f)` with `state = 'getup'` for t = 0.30 to 0.55 (read-only script, numbers above).
Root cause:    Only the hip height and the torso angle were keyframed. The feet were interpolated in a straight line between the lying and the standing targets, and two-bone IK then placed the knees as a by-product. A kneel needs an explicit contact (a knee or shin on the floor) and a different foot target for the back leg; neither was authored, so nothing in the code could ever produce one.
Why not caught earlier: the requirement was ambiguous until it was written as a test ("a knee near the floor in the middle of the sequence"). The test is what exposed the gap.
Class:         20.14 By-products mistaken for authored poses
Detect similar: for every animated sequence, write the key poses as measurable conditions (contact points, heights) and test them at the key times; add a continuity test that no joint jumps more than a set distance between two samples (ANI-05).
Fix pattern:   Author each key pose with explicit contact targets (back foot behind the hips on the floor so the knee lands low), pick the IK bend direction deliberately per phase, and check continuity.
Instances found and fixed: stand-up. Reviewed other sequences: the flip and the lying pose already have authored contact targets; the jump spring and hit reactions are covered by ANI-03 and MOV-07.
QA guide update: section 20.14
Regression test: ANI-04 (kneeling stage), ANI-05 (no joint jumps during the stand-up)

---

## DEF-009  The lint reports `Math.random` found inside a comment (scanner false positive)
Status:        FIXED (see iteration 2 fix record)
Found by:      LINT-01 ("src/sound.js:25 Math.random in src")
Version/seed:  `tests/lint.js`
Severity:      Minor (noise that would train people to ignore the lint).
Symptom:       The scan flagged a line that only contains the words "no Math.random" inside a block comment.
Reproduction:  `node tests/lint.js`
Root cause:    The scanner removes only `//` comments before matching its patterns. A `/* ... */` comment, or a string, containing the pattern text still matches. The scanner was never tested with samples that should not match.
Why not caught earlier: the scanner had only been checked against code it should flag (the swallowed statements); there was no negative sample and no test of the scanner itself.
Class:         20.15 Scanner without its own tests (false positives and false negatives)
Detect similar: a self-test of every scanner with positive samples (must flag) and negative samples (must not flag), including the pattern text inside comments and strings (LINT-04).
Fix pattern:   Strip block comments, line comments and string contents before pattern matching, keep line numbers, and give the scanner a sample table in its tests.
Instances found and fixed: all scan rules in `tests/lint.js` now match against stripped code.
QA guide update: section 20.15
Regression test: LINT-04


---

## DEF-010  After a K.O. the loser stands upright instead of lying on the floor
Status:        FIXED (see iteration 2 fix record)
Found by:      visual check in the browser (screenshot of a finished fight); no automated test failed
Version/seed:  every K.O.; example seed 70446, Kicker vs Grappler
Severity:      Major for the feel of the game (the knockout looks like nothing happened), minor for the rules.
Symptom:       The winner shows the victory pose; the loser stands idle (flashing white) next to them.
Reproduction:  play any AI-vs-AI fight to the end and look at the loser.
Root cause:    `finish()` resets both fighters to `idle` so that nothing can act, and KO-01 only required that the match is frozen afterwards. The requirement said "frozen", not "the loser is down", so the code and the test were both correct against an incomplete requirement. The v1 behaviour (loser lies on the floor) was in the old spec but was not carried into the v2 requirements.
Why not caught earlier: requirements were rewritten from memory of the v1 spec rather than checked line by line against it (section 4 of `SPEC.md` lists the K.O. rule: loser lies still), and the test asserted the weaker property that was easy to measure.
Class:         20.16 Requirement weaker than the intent (the test passes, the product is wrong)
Detect similar: (1) walk the old spec and the old game's behaviours line by line against the new requirement table and mark each as carried, changed or dropped; (2) for every end state (K.O., timeout, disconnect) assert what the player sees, not only what stops moving; (3) look at a screenshot of every end state at each release.
Fix pattern:   State the end state as an observable condition (loser is `down`, at h = 0, lying within the floor tolerance; winner is in the victory pose) and test it; keep the frozen-match test.
Second instance (found in the same browser check): the loser's white hit-flash stayed on for ever because its timer is frozen with the match. Fix: clear transient visual timers (`flash`) when the match ends.
Instances found and fixed: K.O. (loser stays standing; frozen white flash). Other end states: timeout does not exist in v2 (fights only end by K.O.); mode switches reset the match.
QA guide update: section 20.16
Regression test: KO-01 (updated: loser down), KO-02 (loser lies on the floor, invariants hold)


## Fix record, iteration 2

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-008 stand-up was a squat-rise | 20.14 | Back leg authored: swept straight, then folded under with the knee on the floor, then standing; bend direction always the forward side of the hip-to-foot line (continuous); phase timings tuned with `tests/tune-getup.js` (search over parameters, no floor penetration, worst joint jump 17 px per 0.025 s) | ANI-04 (kneeling stage, monotonic hips), ANI-05 (continuity), FLR checks, mutation `stand-up never kneels` |
| DEF-009 lint false positive | 20.15 | Scanner works on code with comments and strings stripped; `LINT-04` self-test with 6 positive and 8 negative samples | LINT-01, LINT-04 |
| DEF-010 K.O. loser standing, frozen flash | 20.16 | `finish()` puts the loser `down`, clears `flash`; cosmetic `koT` drives the fall without changing the state hash; pose uses it | KO-01 (updated), KO-02, browser screenshot |

Two other things learned while fixing, recorded for the guide:

- **Search beats guessing for animation timing.** Three hand-picked values failed; a small parameter search with a cost function (penetration first, then joint jump) found a setting in seconds. The search script is kept (`tests/tune-getup.js` reports the numbers).
- **Mutation scripts must fail loudly when their target moves.** After the K.O. change the old mutation no longer matched the code and the mutation test reported "target not found" instead of silently passing. The mutation was updated.

### Iteration 2 status

- Requirements added: MOV-05, MOV-06, MOV-07, CMB-08, BAL-01, ANI-01 to ANI-05, SND-01, HELP-01, KO-02 (see `REQUIREMENTS.md` section 6)
- `node tests/run.js`: **50 passed, 0 failed**
- `node tests/lint.js`: 0 findings, scanner self-test passes
- `node tests/mutate.js`: **8 of 8 mutations detected**, baseline clean
- Browser smoke test: PASS (with the guide and the sound module present); visual check of balance gauge, victory pose and K.O. fall done
- Soak report (`node tests/sweep.js 270 5000`):
  - fights 270  timeouts 0  median length 13.7s  longest 32.5s
  - wins by style (share of decided fights): Boxer 28%, Kicker 37%, Grappler 35%
  - win rate when fielded: Boxer 42%, Kicker 56%, Grappler 52%
  - P1 side wins 128  P2 side wins 142
  - moves used: FRONT KICK 349, CROSS 348, HOOK 313, ROUNDHOUSE 301, FLYING SIDE KICK 274, LOW KICK 204, JAB 150, LOW SWEEP 149, OVERHAND 121, UPPERCUT 97, HEAVY PUNCH 64, HEAVY KICK 63, RISING KICK 62, SPINNING KICK 54, JUMP PUNCH 3
  - events: dodge 42, grapple 192, grappleFail 30, hit 1825, knockdown 99, ko 270, throw 192, trip 5, whiff 541

Not verified: the sounds themselves (synthesised audio cannot be listened to from the test tools; only the event-to-sound mapping and the presence of the module are tested), the feel of the new movement (sprint, spring jump, variable jump) by hand, and the spinning-kick squeeze on screen (the scale function is tested; the drawing was not captured mid-kick).


---

# Iteration 3 (recording and replay)

Requirements REC-01 to REC-08 added to `docs/REQUIREMENTS.md` (section 7). Seven tests written first; all failed (module absent). After `src/replay.js` was written: 56 passed, 1 failed.

## DEF-011  Test sets up hidden initial state that a recording cannot reproduce
Status:        FIXED (see iteration 3 fix record)
Found by:      REC-05 ("a recording that includes the K.O. verifies")
Version/seed:  `tests/rec.js`, seed 4
Severity:      Minor (test); but the failure points at a real rule of the design.
Symptom:       A recording that ended in a K.O. failed `verifyRecording`.
Reproduction:  `node tests/run.js`, test REC-05.
Root cause:    The test created a match, then edited it by hand (`x` positions and `hp = 1` for the target) before recording. A recording stores only the seed, the styles and the inputs, so the replay started from the normal initial state, where the fighters are 300 px apart and at full health, and the punches never connected. The verification was right to refuse; the test depended on state that exists outside the recorded inputs.
Why not caught earlier: the earlier tests (REC-01) used scripted inputs only, so nothing had ever shown that hand-edited state breaks determinism; the rule "everything that affects the match must come from the seed and the inputs" was not written down.
Class:         20.17 Hidden initial state (setup outside the recorded inputs)
Detect similar: (1) every recording is verified by replaying from the seed (this is what found it); (2) a scan of the shell and the tests for edits to `match.f[...]` fields before a recording starts; (3) in the shell, starting a recording always creates a new match from a seed (V starts a new round), never records a match that has been edited.
Fix pattern:   Produce the situation through the inputs or the seed (play it, or search seeds for the situation), never by editing the match; if tests need special set-ups, add them as explicit, recorded options of `createMatch` rather than as edits afterwards.
Instances found and fixed: REC-05. Reviewed REC-01, REC-02, REC-04, REC-06, REC-07 (no hand edits). The shell creates a fresh match for every recording.
QA guide update: section 20.17
Regression test: REC-05 (now records a natural AI-vs-AI K.O.), REC-01 (tamper checks)


---

## DEF-012  A patch applied through a shell heredoc mangled backslashes and broke `tests/lint.js`
Status:        FIXED (see iteration 3 fix record)
Found by:      SYNTAX-01, LINT-01, LINT-04 ("Invalid regular expression: missing /")
Version/seed:  `tests/lint.js` after adding the DEF-011 rule
Severity:      Minor (loud failure, the suite stopped at once).
Symptom:       `SyntaxError: Invalid regular expression: missing /` at the new rule; three tests failed together.
Reproduction:  `node tests/lint.js`
Root cause:    The patch text lived inside a shell here-document that held a Python string. The sequences `\\r?\\n` and `\\d` passed through two escaping layers (shell, then Python) and arrived in the JavaScript file as real line breaks inside a regular-expression literal, which is not valid JavaScript.
Why not caught earlier: the same tool-use pattern had already caused an earlier problem (a heredoc rejected for length) and was handled by working around it; the underlying rule, "do not carry code with backslashes through shell layers", was never written down. SYNTAX-01 did catch the result immediately, which is why the cost was small.
Class:         20.18 Escaping layers corrupt patches
Detect similar: SYNTAX-01 after every patch (already in place); a lint rule that flags a regular-expression literal containing a raw line break (it cannot parse, so SYNTAX-01 reports it).
Fix pattern:   Apply changes with the editor tools (or write the patch script to a file with the file-writing tool) so the text is not interpreted by a shell; keep code with backslashes out of heredocs; re-run the syntax check straight after.
Instances found and fixed: `tests/lint.js`. All earlier patches were verified by SYNTAX-01 and by the full suite.
QA guide update: section 20.18
Regression test: SYNTAX-01


## Fix record, iteration 3

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-011 hidden initial state in a recording test | 20.17 | REC-05 now records a natural AI-vs-AI K.O.; lint rule flags hand edits of fighter state in `tests/rec.js` (with its own self-test samples); recordings always start from a fresh match (V starts a new round) | REC-05, LINT-01, LINT-04 |
| DEF-012 patch mangled by shell escaping | 20.18 | `lint.js` repaired with a script file; all later edits made with the editor tools | SYNTAX-01 (caught it at once) |

### Iteration 3 status

- Requirements REC-01 to REC-08 (`REQUIREMENTS.md` section 7); 7 tests written first, all failed before `src/replay.js` existed
- `node tests/run.js`: **57 passed, 0 failed**
- `node tests/lint.js`: 0 findings, scanner self-test passes (now includes the hand-edit rule)
- `node tests/mutate.js`: **11 of 11 mutations detected** (3 new: verification ignores the final hash, replay ignores the speed, loading accepts any version)
- Browser: `tests/browser-smoke.js` PASS; `tests/browser-smoke-rec.js` PASS (record with real key presses, human input recorded and AI input not, live recording verifies, replay at normal speed, speed keys, R/T/1/2 ignored during replay, the live match untouched, save and load round trip, tampered file rejected with a clear message, invalid JSON rejected)
- Video export checked in the browser: replaying a 112-step recording produced `slowfist-v2-replay.webm`, 116,624 bytes, type `video/webm` (download intercepted for the test)
- Visual check: REC indicator with timer, replay bar with speed and position, message line, buttons

### Known limits (not defects, recorded for the guide)

- A recording stores inputs, not positions, so it depends on the simulation being bit-for-bit reproducible. The simulation uses `Math.sin`, `cos` and `tan`, which can differ in the last digits between browsers or JavaScript engines. A recording made in one browser is therefore checked when it is loaded (every 60 steps and at the end) and rejected with an explanation if it does not replay identically; it has been verified only in the same browser and engine that made it.
- A recording made with an older version of the rules will usually fail to verify after the rules change (damage, timing). That is intended: the format has a version number (`v: 1`), and a rule change that alters results should raise it.
- Recording starts a new round (it does not record from the middle of a round).
- Hand-set test situations cannot be recorded (DEF-011); special start situations would have to become recorded options of `createMatch`.
- The check and message for a rejected file are tested; the file-chooser dialog itself (the Load button opening the system dialog) was not exercised by the tools, only the loading code behind it.


---

# Iteration 4 (found by playing)

## DEF-013  High kicks bend the knee the wrong way (hyperextension)
Status:        FIXED (see iteration 4 fix record)
Found by:      the user, playing in the browser ("some kicks such as the final kick seem to bend the knee upward")
Version/seed:  `pose.js` at iteration 3; reproduced for all styles and both facings
Severity:      Major for the look of the game. This is the same complaint as in v1 ("knee seem to bend upward sometime"), so it is a repeat of a known issue.
Symptom:       When a kick is aimed 10 degrees or higher, the knee joint sits on the wrong side of the hip-to-foot line: the shin folds the wrong way relative to the thigh.
Reproduction:  read-only script: 1,056 kick poses (2 facings x 3 styles x 8 aim angles x strike and recovery x 11 times); the sign of cross(thigh, shin) x facing is negative (a reversed knee) in 174 of them. Angles -25, -15 and 0 degrees: none. 10 to 60 degrees: all of the bad ones, with flex = -1.0 (exactly reversed) in the worst cases.
Root cause:    The solver picks one of the two possible knee positions with a *preference direction* ("forward, slightly up"). That is correct when the leg points down, but when the leg points forward and up the forward-pointing normal of the hip-to-foot line is the *lower* one, so the preference selects the reversed knee. A direction preference is a property of one posture, not of a knee; the real rule (the shin folds backward relative to the thigh) is the same for every posture and was never expressed.
Why not caught earlier: FLR-04 only checked "knee forward of the hip-foot line" for upright poses, which is the same wrong preference in test form, so the test agreed with the code. No test swept strike angles, and the invariant of the joint was never stated as a rule about the joint itself.
Class:         20.19 Bend direction chosen by a preference instead of a constraint (a repeat of 20.4, impossible geometry)
Detect similar: (1) an anatomical rule per joint, stated as a sign test: for knees `cross(thigh, shin) x facing >= 0`, for elbows the opposite sign; (2) sweep every state and every strike angle, both facings, both phases (FLR-07); (3) a mutation that restores the old preference and must be caught.
Fix pattern:   Choose the IK solution by the joint's flexion sign, not by a direction. Near a straight limb both solutions coincide, so there is no pop. Apply to every two-bone limb (legs and arms).
Instances found and fixed: legs (all kicks), and arms are covered by the same rule and test (elbows), including the stand-up and the victory poses that used preferences.
QA guide update: section 20.19
Regression test: FLR-07 (knees and elbows, every state, angle and facing), mutation `knee side chosen by preference`


## Fix record, iteration 4

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-013 knees bent the wrong way in high kicks | 20.19 | `ik2` now takes a flexion sign (knee: facing, elbow: -facing) and picks the solution by `cross(upper, lower) x sign`; all direction preferences removed from `pose.js` (legs and arms); the stand-up start and the Grappler victory pose, which had relied on the old preferences, were re-authored | FLR-07 (3,000+ limb checks: every state, 8 kick and punch angles, strike and recovery, both facings, stand-up at 35 times, victory, jump spring, flip rotations), mutation `knee bend side reversed`, a visual check of six kick poses, and printed thigh/shin directions |

Side effects found and fixed during the same change (no separate defect: they were consequences of removing the preference rule, and the existing tests caught them at once):

- ANI-04 (stand-up): the hands started in front of the shoulder, which forces the correctly bending elbow under the floor; the hands now start where the lying pose has them and move to the push-up position.
- ANI-02 (Grappler victory): the elbows could not be "out" with hands beside the head under the correct elbow rule; re-authored as a double-biceps pose in profile (elbows forward, fists up).

Result after the fix: before the fix 174 of 1,056 kick poses had a reversed knee; after, 0 (FLR-07 sweeps a larger set and passes).

### Status after iteration 4

- `node tests/run.js`: **58 passed, 0 failed**
- `node tests/lint.js`: 0 findings
- `node tests/mutate.js`: **12 of 12 mutations detected**, baseline clean
- Printed kick geometry (style 1, strike, facing right): thigh and shin directions for aims 0, 10, 20, 45 and 60 degrees all show the shin folding downward relative to the thigh (the correct knee flexion)
- Not re-checked after the change: the sounds, and the feel of the kicks by hand (the animation timing was not changed; only which side the knee bends)

A lesson recorded because it repeated: the first complaint about this ("knee seem to bend upward sometime", in v1) was treated as a symptom. The rule behind it, that a knee only flexes one way, was never written as a test until now. When an old complaint comes back, ask what rule the first fix failed to state.


---

# Iteration 5 (human motion envelope)

Requirements ANI-06, ANI-07, ANI-08 added (`REQUIREMENTS.md` section 8) after the user asked whether all motions are humanly possible. The honest answer was "only partly": the floor, limb lengths and bend direction were tested, joint ranges and speeds were not. A first measurement over 60 AI fights (98,660 poses) found problems; four tests were then written first and all failed (62 total, 58 passed, 4 failed).

## DEF-014  Joints bend beyond human range (elbow, hip, knee)
Status:        FIXED (see iteration 5 fix record)
Found by:      measurement requested by the user; then ANI-06 and ANI-06b
Version/seed:  `pose.js` at iteration 4
Severity:      Major for realism.
Symptom:       Elbow bent more than 150 degrees in 15 percent of poses (worst 178, mostly the stagger pose, also the grab, the wind-up and the punch), the hip flexed up to 178 degrees (thigh pressed against the torso; worst case in tests 138 for a 20 degree kick) in 0.7 percent, the knee up to 167 degrees in 0.2 percent (low kicks, the stand-up).
Reproduction:  `node tests/run.js` (ANI-06: "hip 0 flexed 138 degrees in kick strike angle 20 u 6"; ANI-06b: "elbow 1 bent 164 degrees in grab (seed 900 step 128)").
Root cause:    Poses are authored as hand and foot target positions and solved with two-bone inverse kinematics. The solver guarantees the limb lengths and the bend side but nothing about the joint angle: the closer a target is to the limb root, the tighter the joint folds, with no stop at the human limit. The hip has no constraint at all because each leg is solved from the hip point on its own, with no reference to the torso angle.
Why not caught earlier: every requirement so far was about positions (floor, lengths) or the bend direction; angle ranges were never stated, and the question was only asked at the end of iteration 4.
Class:         20.20 Incomplete constraint set (positions checked, angles not)
Detect similar: for every joint list its anatomical range and sweep all poses and all AI fights against it (ANI-06 and ANI-06b); report the worst value and the state it occurs in.
Fix pattern:   Put the joint limits into the solver: for a two-bone joint the interior angle fixes the end distance, so a minimum reach enforces a maximum flexion exactly (`d_min = sqrt(l1^2 + l2^2 - 2 l1 l2 cos(180 - maxFlexion))`); for the hip, rotate the whole leg about the hip until the angle to the torso is inside its range.
Instances found and fixed: knee, elbow and hip, all poses (they all go through the same solver).
QA guide update: section 20.20
Regression test: ANI-06, ANI-06b, mutation `joint limits removed`

---

## DEF-015  Pose changes teleport the body (hands and feet move 11,734 px/s)
Status:        FIXED (see iteration 5 fix record)
Found by:      measurement requested by the user; then ANI-07
Version/seed:  `pose.js` at iteration 4
Severity:      Major for realism (limbs flick between poses).
Symptom:       Hand, foot or head speed above 2,500 px/s (about 27 m/s, a fast kick) in 1.3 percent of frames; worst 11,734 px/s, a hand "in down after flipped" (the landing after a throw); other peaks at idle to charge, stagger to idle, recovery after a grapple.
Reproduction:  `node tests/run.js` (ANI-07: "964 samples over the limit in 65,124 frames; worst 11734 px/s: hand in down after flipped (seed 903 step 950)").
Root cause:    The skeleton is a pure function of the current state: it has no memory of the previous pose. Whenever the state changes, the hand and foot targets, the torso angle and the facing change to the new pose within a single step, so the joints jump. Only the stand-up had a continuity check (ANI-05), so nothing measured the other transitions.
Why not caught earlier: poses were tested one at a time (static invariants); transitions between poses were tested for one sequence only.
Class:         20.21 Pose is a function of state with no temporal continuity
Detect similar: measure the speed of every end point (hands, feet, head) between consecutive frames over many AI fights, and report the worst transitions by name (ANI-07); keep a mutation that removes the smoothing.
Fix pattern:   Add a presentation-layer animator that keeps the previous pose parameters and moves toward the new targets with a rate and a speed cap (positions and angles, including the facing), then solves the limbs from the smoothed parameters. The simulation is untouched, the pure pose function stays testable, and the animator is tested for speed, convergence, no first-frame lag and no effect on the state hash.
Instances found and fixed: all transitions (one mechanism): idle/charge, stagger/idle, flip landing, grapple recovery, turning round.
QA guide update: section 20.21
Regression test: ANI-07, ANI-08, mutation `animator does not smooth`


---

## DEF-016  The new hip limiter swings the leg the wrong way when the thigh points along the torso (angle wrap-around)
Status:        FIXED (see iteration 5 fix record)
Found by:      ANI-07 after the first version of the animator (88 samples still over the speed limit, worst 5,078 px/s: "foot in strike/up after strike/up")
Version/seed:  `pose.js`, iteration 5 work in progress, seed 903, step 343
Severity:      Major (it would have shipped a visible flick in high kicks); found before release, in my own new code.
Symptom:       The solved foot jumped 84 px in one frame while the foot parameter moved smoothly; for the same smooth parameters the solved foot sat behind the hip (578,326) instead of in front (about 650,270).
Reproduction:  trace script on seed 903, step 342: `solve(params)` for a foot target 42 px from the hip (well outside the minimum reach) returned a foot on the opposite side of the hip.
Root cause:    `limitHip` measures the hip flexion as a signed angle from `atan2`, which wraps from +180 to -180 degrees when the thigh points straight up along the torso. Just past the wrap the value is about -179, which the clamp to [-30, 125] treats as "extended 179 degrees behind", so it rotates the whole leg by about 150 degrees the wrong way instead of by a few degrees toward the 125 degree limit.
Why not caught earlier: the pose sweep (ANI-06) never placed the thigh exactly along the torso, and the animator test only measured speeds in fights, where it showed up as an unexplained spike; the limiter had been written and tested in the same step as the animator.
Class:         20.22 Angle wrap-around in a clamp
Detect similar: any code that clamps a signed angle must be tested with values on both sides of the wrap point (plus and minus 180 degrees) and with an exhaustive sweep of the direction of the limb (every 5 degrees around the full circle); speed and continuity tests over fights find the symptom (a jump with no cause in the inputs).
Fix pattern:   Unwrap the angle before clamping: values past the middle of the forbidden arc are moved by 360 degrees so that the nearest limit is chosen; test the continuity of the solver output as the limb direction sweeps through the full circle.
Instances found and fixed: `limitHip`. The knee and elbow limits use a minimum reach (a distance), not an angle, so they have no wrap.
QA guide update: section 20.22
Regression test: MOT-09 (limb direction sweep: the solved foot moves continuously as the target direction goes round the circle), mutation `hip limit without unwrap`


---

## DEF-017  Limits and smoothing applied to the end points (hands, feet) cannot be continuous; DEF-016 was only part of the cause
Status:        FIXED (see iteration 5 fix record)
Found by:      ANI-07 and MOT-09 still failing after the DEF-016 fix (84 samples over the speed limit; the foot jumped 144.5 px for a 2 degree change of the target direction at 106 degrees)
Version/seed:  `pose.js`, iteration 5 work in progress (end-point solver with a rigid hip limiter, plus a parameter animator)
Severity:      Major (a design flaw in my first fix; found before release).
Correction:    DEF-016 above named the angle wrap as the root cause. That was real but incomplete: after unwrapping, the foot still jumped. The first trace was read too quickly; the wrap was one symptom of a deeper cause, which is this entry. The unwrap fix is kept (it was a genuine error) but it did not remove the failure.
Symptom:       Moving a limb target through the region "up along the torso" makes the solved leg flip between the flexion limit (125 degrees, forward) and the extension limit (-30 degrees, behind). Pose changes in which the foot target travels in a straight line from behind the hip to in front of it (wind-up to kick) go through that region, so the foot jumps 85 px in one frame even though the parameters move smoothly.
Reproduction:  MOT-09 (foot target direction swept in 2 degree steps): 144.5 px jump; trace `step 342, seed 903`.
Root cause:    A limb target cannot pass through the torso, so the set of reachable thigh directions is an arc, not a full circle. Mapping a full circle of targets onto an arc with a hard clamp must be discontinuous somewhere (a topological fact). Smoothing and limiting the end point in position space makes the end point travel in a straight line through that unreachable region. The limit and the smoothing were applied in the wrong space: joint ranges are limits on joint angles, and the straight line between two end-point positions is not a path the joints can follow.
Why not caught earlier: the first fix (minimum reach and a rigid hip rotation) satisfied the range tests and removed most speed violations, so it looked finished; only the stricter continuity test (MOT-09) and the speed test in full fights showed the remaining jumps.
Class:         20.23 Limits or smoothing applied in end-point space instead of joint space
Detect similar: sweep a limb target through every direction its joints can reach and check continuity of the output (MOT-09); measure end-point speed over many fights (ANI-07); ask for every limit "is it a limit on a position or on an angle?".
Fix pattern:   Animate in joint space. Convert the target pose to joint angles once (inverse kinematics), clamp each angle to its human range (unwrapped, nearest limit), smooth the angles with a rate and a cap, and rebuild the limbs with forward kinematics. Range, limb length, continuity and an upper bound on end-point speed then follow by construction, and the speed bisection stays only as a safety net.
Instances found and fixed: legs and arms (hip, knee, shoulder, elbow); the old minimum-reach and hip-rotation code was removed.
QA guide update: section 20.23
Regression test: MOT-09 (rewritten to sweep only the directions the joints can reach, because a target through the torso is unreachable), ANI-06, ANI-06b, ANI-07, ANI-08, mutations `joint ranges removed` and `animator does not smooth`


## Fix record, iteration 5 (human motion envelope, shoulders, fancy movement, health)

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-014 joints beyond human range | 20.20 | joint angles are clamped to human ranges (hip -30 to 140, knee 0 to 140, shoulder -60 to 180, elbow 0 to 145 degrees), limbs rebuilt by forward kinematics | ANI-06, ANI-06b, mutation `joint ranges removed`; measurement below |
| DEF-015 pose changes teleport the body | 20.21 | presentation-layer animator: smoothing plus a per-joint speed cap, plus a bisection safety net on end-point speed (2,300 px/s); the simulation never reads it | ANI-07, ANI-08, mutation `animator does not smooth` |
| DEF-016 hip limiter angle wrap (partly misdiagnosed) | 20.22 | unwrap before clamping (kept); the larger cause is DEF-017 | MOT-09 |
| DEF-017 limits and smoothing in end-point space | 20.23 | whole pipeline moved to joint space (inverse kinematics once, clamp and smooth the angles, forward kinematics); the old minimum-reach and rigid hip rotation were removed | MOT-09 (rewritten to sweep the reachable arc), ANI-07, all range tests |

Things decided or found along the way (recorded, not defects):

- **Hip flexion limit 140 degrees, not 125.** With 125 the Kicker's 60 degree kicks cannot be reached; fighters are martial artists. Tests allow 145 (`ANI-06`).
- **The stand-up needed re-authoring twice.** Hands planted under a tilted torso need about 80 degrees of shoulder extension, which no shoulder has; the hands are now authored as shoulder angles in the torso's frame (posted overhead on the floor, then forward to guard).
- **A mutant that cannot be seen is not always a weak test.** `knee side reversed` produced straight legs (legal), so the check now also requires the knee to bend in a crouch; `animator does not smooth` was hidden by the speed safety net, so that mutation now switches off both layers.
- **When a fix barely changes the failing number (88 became 84 samples), the diagnosis was wrong.** DEF-016 shows the cost of reading a trace too quickly; DEF-017 is the corrected analysis (QA guide 20.23).
- **Health raised 50 percent at the user's request:** Boxer 100 to 150, Kicker 112 to 168, Grappler 125 to 188 (STY-01 updated first and failed before the data change). Effect over 300 AI fights: median fight 13.2 s to 23.0 s, 3 of 300 reach the 40 s limit (1 percent; AI-02 allows 5).
- **Shoulders (FIG-01):** each figure now has a shoulder girdle: two shoulder joints 14 px apart, perpendicular to the torso, the arms hang from them, a collar line and joints are drawn. The skeleton gains `chest` (centre), `shoulder` (front) and `shoulderB` (back); tests that read the arm roots were updated.
- **Fancy movement (FANCY-01 to FANCY-04):** each throw or knockdown draws a flair (0, 1, 2) from the match RNG and reports it in the event. Flights: tuck, pike with windmilling arms, scissor legs. Stand-ups: standard kneel, kip-up (legs overhead, hips spring above standing height, landing crouch), tornado (a full 360 degree turn with a hop). They are authored as joint angles, so ranges and speed limits hold; the test sweeps cover them and recordings still verify.

### Measurement after the changes (same 60 AI fights, on the animated skeleton that the player sees)

| Check | Before (iteration 4) | After |
|---|---|---|
| Elbow bend over 150 degrees | 15.08 percent of poses (worst 178) | 0 of 161,290 (worst 145, the solver limit) |
| Hip flexion over the limit | 0.69 percent (worst 178) | 0 (worst 140) |
| Knee bend over 145 degrees | 0.21 percent (worst 167) | 0 (worst 140) |
| Hand, foot or head faster than 2,500 px/s | 1.29 percent (worst 11,735) | 0 (worst 2,300, the safety-net limit) |

### Status after iteration 5

- `node tests/run.js`: **68 passed, 0 failed**
- `node tests/lint.js`: 0 findings
- `node tests/mutate.js`: **16 of 16 mutations detected**, baseline clean
- `node tests/sweep.js 300 9000`: 3 timeouts, median fight 23.0 s, win shares Boxer 33 / Kicker 37 / Grappler 30 percent, 15 move names used, 332 throws (so many flairs shown)
- Browser: live AI-vs-AI fight with the animator, record, replay, save, load: PASS, no page errors; contact sheet of the three flights, the three stand-ups and the shoulders checked by eye
- Not verified: how the new motions feel in real play (speed and timing of the flights, whether the kip-up looks right at game speed), the shoulder drawing at close range, and the sounds.


---

# Iteration 6 (found by playing)

## DEF-018  The punch does not look like a punch
Status:        FIXED (see iteration 6 fix record)
Found by:      the user, playing ("punch motion doesn't look like a punch")
Version/seed:  `pose.js` at iteration 5
Severity:      Major for the look of the game: the punch is the most common move.
Symptom:       The arm never straightens, the fist swings in an arc, the wind-up pulls the fist behind the body, and the other hand does not guard.
Reproduction:  read-only measurement of the pose at the start and the contact of straight punches at aims 0, 10 and 45 degrees: elbow still bent 61, 59 and 43 degrees at contact (a real punch ends within about 20); fist path deviates 23, 26 and 6 px from a straight line; the fist speed peaks at 0.30 to 0.35 of the extension (early) instead of at impact; with a full wind-up the fist sits 23 px behind the chest; the rear hand is 35 to 37 px from the head (it hangs low).
Root cause:    The punch is authored as one number, the position of the fist: it slides in a straight line in position space from a point behind the chest to a point 58 px ahead, while the torso leans forward. Nothing says what a punch is made of: a chamber at the chin, an elbow that extends, a shoulder and torso that rotate into the blow, a guard hand that stays up, and a fist that accelerates into the target. With the torso leaning forward and the target measured from the chest, the shoulder moves toward the target and the elbow cannot straighten.
Why not caught earlier: every earlier check was about validity (floor, length, range, speed); none described what makes the move recognisable, and the first measurement of the move was made after the user complained.
Class:         20.24 A move authored as an end-point interpolation, without its mechanics
Detect similar: write the recognisable features of each move as measurable conditions (extension at contact, chamber, guard, shoulder drive, path, speed profile) and test them on the pose at the key moments; review a contact sheet of the move at 5 moments before release.
Fix pattern:   Author the move in joint angles with its parts (chamber, extension, drive, guard) so the arm, shoulder and torso play their roles; use ease-in so the end point accelerates into the contact.
Instances found and fixed: punches (straight, uppercut, overhand). Kicks were reviewed for the same causes (DEF-013 fixed the knee) and left unchanged for now; the hook keeps its arc by design and is not part of the path test.
QA guide update: section 20.24
Regression test: PUNCH-01, mutation `punch does not extend`

---

## DEF-019  A throw or knockdown can be chained into a K.O.
Status:        FIXED (see iteration 6 fix record)
Found by:      the user, playing ("once thrown it can be chained to a KO, prevent it")
Version/seed:  `sim.js` at iteration 5
Severity:      Major for fairness: a fighter who is thrown can lose the whole round without getting a chance to act.
Symptom:       After a throw or knockdown the attacker keeps hitting the fallen fighter as it gets up, which knocks it down again, and so on until the K.O.
Reproduction:  measurement over 300 AI fights: 94 of 297 K.O.s (32 percent) happened within 4 s of the loser being thrown or knocked down, 55 of them after a throw. A scripted attacker hitting a thrown 188-hit-point fighter every 0.25 s knocked it out after 17.3 s and 70 follow-up hits.
Root cause:    A rule loop with no recovery protection. Being hit can knock a fighter down; a fighter who is down or standing up is vulnerable again as soon as the short invulnerability at the start of the stand-up ends (55 percent of it); the attacker is free to act at that moment, so hit, knockdown, stand-up, hit repeats with nothing that interrupts it. Only the first part of the stand-up was protected, and nothing limited how much damage a single chain could do.
Why not caught earlier: the combat rules were tested one hit at a time (damage, zone, knockdown); the sequence "what can the attacker do next, and the next after that" was never measured, and the soak report counted K.O.s but not how they happened.
Class:         20.25 Rule loop without recovery protection
Detect similar: in the soak, count K.O.s that follow a knockdown or throw within a few seconds and the maximum damage taken in a chain; add a scripted worst-case attacker to the tests; ask for every state that is hard to leave "what stops the other side from repeating the move that put me here?".
Fix pattern:   A protection window with a damage budget: from the landing until the stand-up ends plus 1.5 s the fighter cannot be K.O.'d and takes at most 20 percent of its maximum health in total; the budget is not refilled by a new knockdown inside the window; a protected fighter cannot be grappled.
Instances found and fixed: throw and knockdown chains (one mechanism).
QA guide update: section 20.25
Regression test: CHAIN-01 to CHAIN-04, mutation `no damage budget`


---

## DEF-020  The protection window never ends if the stand-up is interrupted (self-inflicted by the DEF-019 fix)
Status:        FIXED (see iteration 6 fix record)
Found by:      the soak report after the DEF-019 fix: AI fights that reached the 40 s limit rose from 3 of 300 to 21 of 300 (1 percent to 7 percent)
Version/seed:  `sim.js`, iteration 6 work in progress; seeds 9012, 9014, 9027, 9034, 9047
Severity:      Major (a fighter could become effectively invulnerable for the rest of the round).
Symptom:       In the stalled fights one fighter was protected for 14 to 35 s of the 40 s (the protect timer read 99.0, 98.8, 97.3 and so on, counting down by one frame at a time); the other side kept hitting it with no effect ("protected" events) and the fight did not finish.
Reproduction:  `timeline` trace of seed 9027: knockdown at 10.8 s sets protect to 99; at 15 s the fighter is in `stagger` with protect 98.8.
Root cause:    "Protected until the stand-up ends" was implemented with a placeholder value (99) that is replaced by the 1.5 s grace only when the stand-up finishes (`getup` to `idle`). The last 45 percent of the stand-up can be hit, and a hit sends the fighter from `getup` to `stagger`, which is another way out of the state. That exit never converted the placeholder, and the timer then counted down from 99 at one second per second.
Why not caught earlier: the CHAIN tests checked the properties "no K.O. while protected" and "damage capped", which also hold if protection never ends; nothing measured how long protection lasts. A state that is left by one path in the tests had two paths in the game.
Class:         20.26 A placeholder state with one exit path (a timer that never starts)
Detect similar: assert an upper bound on the duration of every protection, invulnerability or lock (CHAIN-05: never longer than 8 s in 100 fights, and a scripted test that interrupts the stand-up); check the soak report for any change in timeouts after a rule change, not only the property the rule was meant to give.
Fix pattern:   Do not wait for one particular exit: convert the placeholder to the real timer at the single place where the timer runs, as soon as the fighter is in any state other than down, standing up or flipped.
Instances found and fixed: the protection timer. No other placeholder timers exist in `sim.js` (searched for sentinel values; the K.O. loser keeps `stagDur` 1e9 on purpose because the match is frozen).
QA guide update: section 20.26
Regression test: CHAIN-05, mutation `protection placeholder never converted`


## Fix record, iteration 6 (punch, throw chains)

| Defect | Guide updated | Fixed by | Verified by |
|---|---|---|---|
| DEF-018 the punch does not look like a punch | 20.24 | the punch is built from its parts in joint angles: a chamber with the fist at the chin and the elbow folded, an arm that straightens along the aim, a shoulder girdle that slides forward as the torso rotates (new `twist` parameter, width unchanged), a rear hand that stays at the chin, and a fist that accelerates into the contact (ease-in) | PUNCH-01 (36 cases: 3 styles, both facings, straight 0/10/25, uppercut 45, overhand -30/-15), PUNCH-02 (wind-up and recovery), mutation `punch does not extend`, contact sheet checked by eye |
| DEF-019 a throw or knockdown can be chained into a K.O. | 20.25 | protection window from the landing to the end of the stand-up plus 1.5 s: no K.O. (keeps 1 hit point), damage budget 20 percent of the maximum health, no second grapple, no second knockdown (only a stagger); a hit with the budget used up does nothing and shows PROTECTED; the HUD shows PROTECTED | CHAIN-01 to CHAIN-04, mutations `protection never starts`, `no damage cap while protected` |
| DEF-020 the protection window could last 99 s (self-inflicted) | 20.26 | the placeholder is converted to the grace period at the one place the timer runs; a knockdown lasts at most 3 s (it could be 5.9 s) | CHAIN-05, mutation `protection placeholder never converted` |

Decisions and findings recorded:

- **Overhand path limit 16 px, straight punches and uppercuts 10 px.** A parameter search (shoulder and elbow timing) could not get the overhand below 12.5 px: it drops from the chin to a lower target, so it loops by nature. The requirement was changed knowingly, not the test loosened silently.
- **The CHAIN-04 first metric was flawed**: it counted the hit that causes the fall and kills at once as a "chain". It now excludes the same step; the threshold is 10 percent of K.O.s.
- **A rule change moved a statistic the rule did not mention**: timeouts rose from 3 to 21 of 300 after the first version of the window, which is how DEF-020 was found. After the fix they are 8 of 300 (2.7 percent; the test allows 5 percent).
- **Knockdown duration was unbounded** (0.9 s plus 0.04 per point of hit strength, up to 5.9 s in the data); it is now at most 3 s.

### Measurement after the changes

| Check | Before | After |
|---|---|---|
| Elbow bend at the contact of a punch | 61, 59, 43 degrees | 5 degrees |
| Fist path deviation (jab, aim 0 / 10 / 45) | 23 / 26 / 6 px | at most 10 px (overhand at most 16) |
| Fist speed peak (fraction of the extension) | 0.30 to 0.35 | at least 0.5 |
| Fist during a full wind-up | 23 px behind the chest | in front of the chest, within 35 px of the head |
| Rear hand distance to the head during a punch | 35 to 37 px | at most 30 px |
| K.O.s within 4 s after the loser was thrown or knocked down (same definition as before, includes the hit that causes the fall) | 94 of 297 (32 percent) | 67 of 294 (23 percent); excluding that hit, at most 10 percent (CHAIN-04) |
| K.O. while the loser is protected | possible | never (100 fights, plus 4 scripted victims) |

A scripted attacker who keeps hitting a thrown 188-hit-point fighter every 0.25 s still wins in the end (8.3 s, 34 hits, against 17.3 s and 70 hits before the knockdown cap), because once the window is over the fighter is a normal target again. What the rule guarantees is that the fighter always gets control back after a fall and cannot be knocked out while down, standing up or in the 1.5 s afterwards.

### Status after iteration 6

- `node tests/run.js`: **75 passed, 0 failed**
- `node tests/lint.js`: 0 findings
- `node tests/mutate.js`: **20 of 20 mutations detected**, baseline clean
- `node tests/sweep.js 300 9000`: 8 timeouts (2.7 percent), median fight 24.7 s, win shares Boxer 34 / Kicker 37 / Grappler 29 percent, 15 move names used, 178 PROTECTED events (about 0.6 per fight)
- Browser: contact sheet of three punches at five moments checked by eye
- Not verified: how the new punch feels at game speed, the PROTECTED text on screen during play, and the AI's behaviour around protected opponents (it still attacks them sometimes; 178 harmless hits over 300 fights).


---

# Iteration 7 (choreography: sequences, steps, frames)

Specification `docs/CHOREOGRAPHY.md` and requirements SEQ-01 to SEQ-10 written first; ten tests written first and all failed. After the simulation part (frame table, active window, cancel window and buffer, sequences, lunge, grapple cancel, chain events): 82 passed, 3 failed (SEQ-05 pose and SEQ-08 AI not yet written, SEQ-09 test bug below).

## DEF-021  The speed test compares the first frame with a previous frame that does not exist
Status:        FIXED (see iteration 7 fix record)
Found by:      SEQ-09 ("Cannot read properties of null (reading 'head')")
Severity:      Minor (test only).
Symptom:       The test crashed on its first measurement.
Root cause:    In the measuring loop the speed of the head was computed outside the `if (prev)` guard that protects the hands and feet, so on the first frame `prev` was still null.
Why not caught earlier: the loop was written in one piece and run for the first time by the suite; the guard was applied to two of the three measurements.
Class:         20.27 First iteration of a loop that compares with the previous value
Detect similar: every "compare with the previous sample" loop is written with one guard around all uses of the previous value; a test that runs even one iteration reveals the others at once (this one did).
Fix pattern:   Put every use of the previous value inside the same guard, or start the loop from the second sample.
Instances found and fixed: SEQ-09. Reviewed the other speed loops (ANI-07, ANI-05, FANCY-04): all guard every use.
QA guide update: section 20.27
Regression test: SEQ-09


## DEF-022  The speed test skips the frame of the key press, so one measurement spans two frames
Status:        FIXED (the measuring helper now advances and measures; SEQ-09 also asserts one sample per step)
Found by:      SEQ-09 ("an end point moved at 3142 px/s", limit 2500)
Severity:      Minor (test only; the game was not at fault).
Symptom:       The test reported 3142 px/s, above the limit, on a sequence that looks smooth by eye.
Root cause:    The step that carries the key press was run outside the measuring helper (`SF.step` then `anim.step` directly), so `prev` was one frame older at the next measurement and the distance was divided by one frame instead of two.
Why not caught earlier: the value looked like a real motion fault, and the first reaction was to tune the pose. Measured per frame, the real peak is within the limit.
Class:         20.27 Comparing with the previous sample (second instance: a sample that is skipped, not missing)
Detect similar: any measuring loop with more than one place that advances the simulation; a self check that the sample count equals the step count.
Fix pattern:   One helper both advances and measures; no other code path calls the step function.
Instances to check: ANI-07, ANI-05, FANCY-04 (each advances only through its helper).
QA guide update: section 20.27 (add the skipped-sample variant)
Regression test: SEQ-09 (now also asserts samples == steps)

## STA-01  Stamina while down (requirement change, not a defect)
Requested by the user ("does his stamina recover when down?"). Before: no recovery while down or getting up. After: half the idle rate in those two states, none while staggering or being carried. Test STA-01 written first and failed (no recovery), then the one-line rule in `updateFighter` made it pass. Old recordings no longer replay identically (replays check the version).
Side effect found by the suite: GRP-02 (throw costs 20 stamina) failed by 0.14 because the landing step now includes one tick of ground regeneration. The rule changed on purpose, so the test's tolerance was widened to one tick (0.3) with a comment; the cost itself is still checked.

## Iteration 7 additions (this session)
- Shield: a translucent arc in front of the guard while block is held, bright on BLOCK, gold on PARRY (render only; no rule change).
- SEQ-05: the guard hand of a rear-hand punch was tuned from shoulder 50 / elbow 140 to 80 / 150 so the lead hand stays within 30 px of the head (was 39).
- STA-01: stamina recovers at half rate while down or getting up (see above).
- 3D view (`src/render3d.js`): key 3 or the button; drawing only, same simulation and skeleton; three.js r128 loaded from cdnjs on demand; drag to turn the camera. Not covered by the automated suite (browser only); checked by eye in the browser.
- Status: `node tests/run.js` 86 passed, 0 failed; lint 0 findings; mutations 20 of 20; soak 300 fights: 1 timeout, median 18.8 s, win shares Boxer 34 / Kicker 37 / Grappler 29 percent.

## DEF-023  Finger speed inflated by sampling noise (found by CTL-11, controller decoder)
Status:        FIXED (speed window 24 ms -> 60 ms)
Found by:      CTL-11 (a slow 26 mm stroke at 240 Hz with 0.4 mm jitter read as speed 0.50 instead of 0.2, so "heavy" became "normal").
Root cause:    Peak speed was the maximum over 24 ms windows; the maximum of noisy values is biased upward, and the bias grows with the sampling rate.
Why not caught earlier: CTL-07 only compared move types, not the speed tier, and a mutation run (window 24 -> 1 ms) survived until CTL-11 was written.
Class:         Maximum of a noisy measurement (the same family as 20.27 and the ANI speed limits)
Detect similar: any "peak" or "worst" taken over raw samples: mutate the window to the smallest value and see if a test notices.
Fix pattern:   Measure over a window long enough that noise is small against the signal; test at the highest sampling rate with noise.
Regression test: CTL-11 (and CTL-07 for the sampling rates)
Also from the same mutation run: the "turn < 40" guard of a grapple is only reached by bent back-draws, now covered by CTL-11.

## Note on LINT-01 (iteration 8)
The rule "assignment to CFG" matches any `X.C.y = ...`, so a property named `C` on a touch object (`s.C.limb`) was flagged. It is the same family as DEF-009 (a scanner that pattern-matches names): the code was changed (property renamed `zone`), because `C` means CFG in this code base, and the scanner was left strict.

## DEF-024  The touch overlay hid the game (global CSS rule applied to a new canvas)
Status:        FIXED
Found by:      first look in the browser (the controller was visible, the arena was not); the automated tests cannot see it.
Root cause:    the page stylesheet has `canvas { background: #0f1218; border... }`, which also styled the new overlay canvas, so it was opaque.
Class:         20.34 A global style rule reaches a new element (CSS leak)
Detect similar: for every element a script adds, list the global selectors that match its tag; a browser check that samples the pixel under the element.
Fix pattern:   Style added elements explicitly (background, border) instead of relying on the page defaults; give overlays an id selector.
Regression check: in the browser, `elementsFromPoint` plus a pixel read shows the arena below the overlay (manual until a browser test exists).
Regression test: BR-04 (tests/browser-smoke-ui.js reads the pixel under the overlay and its computed background)

## Iteration 8 status (touch controller merged)
- `mobile/decode.js` (pure gesture decoder, tests CTL-01..11) and `src/touch.js` (overlay, fingers to inputs) are built into `index.html`; touch mode starts on a touch device or with `?touch=1`.
- Mapping to the unchanged rules: strokes become the same key presses the keyboard gives (hold time chooses jab / cross / hook / heavy, crouch gives uppercut and sweep, an aim servo gives rising and low), so recordings and replays work.
- `node tests/run.js` 97 passed, 0 failed; lint 0 findings. Mutation checks of the decoder: 6 tried, 4 caught at first, 2 survivors strengthened by CTL-11 (DEF-023).
- Not verified: feel on a real phone (thresholds are guesses), the analog move speed (the sim is digital, so the stick only gives direction), the real mm per CSS pixel (default 6, `?pxmm=`).

## Iteration 8 feedback 1 (first phone look)
User: the right circles sat far above the left one, were a little too big, and "move when using". Layout changed: all three controls sit on one bottom baseline, attack circles 9.5 mm radius (was 13), move circle 12 mm (was 16), labels moved inside the circles (the LEGS label was off screen). Movement: the page is now fixed (no scroll, pan or pull-to-refresh under a thumb). The cause of "moves" is not confirmed: it may also be the floating move circle (it re-centres on the first touch by design) or the fullscreen switch resizing the page; tell me which.

## Iteration 8 feedback 2
User: the stage should be in the centre and not overlap the controls. Change: in touch mode the arena is sized to the space between a left column (move circle, with BLOCK above it) and a right column (hands over legs), centred; the controls are never over the stage. Cost: the arena is smaller on a short screen (about 470 px wide on 850 x 393). Checked in an emulated phone only.

## Iteration 8 feedback 3
1. "Server not loading": the server was running and the phone had reached it once (a connection from 192.168.1.8 was in the log). Likely causes: the phone showing a cached or stale page, or the server having been stopped between sessions. Fix: `v2/serve.py` (threaded, no-store headers, prints the phone address); `v2/serve.bat` starts it with a double-click. The cause on the phone is unconfirmed.
2. "Start the action before lifting the finger": (a) the wind-up now starts at touch-down (key held while the stroke decides the move; measured in the browser: charge state 9 ms after touch-down with the finger still down); (b) a stroke commits after 2.5 mm of travel (was 4 mm; CTL-12: within 20 ms for a fast stroke, a 1.7 mm wobble does not commit); (c) a pending plan is dropped if the finger disappears without a lift event. Test CTL-12 written first and failed (25 ms).
Risk: because the wind-up starts on touch, a finger resting in an attack circle holds the charge; the fighter cannot block while charging. Tell me if stray touches cause unwanted punches.


# Iteration 8, round 2 (user feedback on the phone)

## DEF-025  The grapple never happens on the touch controller
Status:        OPEN until the fix record below
Found by:      user ("Grapple is missing?"), then reproduced by the new end-to-end test TCH-02 (states seen: charge, strike, recover, idle; never grab).
Severity:      Major (a whole move type unreachable).
Symptom:       Drawing back in either attack circle does nothing useful.
Root cause:    Feedback 3 made the wind-up start at touch-down. The wind-up puts the fighter in the "charge" state, and the simulation refuses a grab unless the fighter is idle or guarding. A back-draw is only recognised after 9 mm, by which time the fighter is already charging. Second cause in the same path: the grab plan took its press length from the steps already waited, so even a permitted press would have been skipped.
Why not caught earlier: the touch plan was only tested by hand in the browser with strokes that were not grapples; no test drove stroke -> plan -> simulation for every move.
Class:         20.28 A new early action silently blocks an existing alternative
Detect similar: TCH-01/02, the table test over every stroke.
Fix pattern:   Give the early state a rule-level exit: a grab cancels a wind-up that has not been released (charge under 0.3 s); the grab plan restarts its step count.
Regression test: TCH-02 (hand and leg, three speeds), TCH-05 (the rule).

## DEF-026  A heavy stroke always comes out as a normal punch or kick
Status:        OPEN until the fix record below
Found by:      TCH-01 (heavy punch gave CROSS).
Root cause:    The tier (quick / normal / heavy) was decided at the early commit from speed and power, but power (the length) is unknown then, so heavy was never chosen early; the plan released the strike before the final decision arrived.
Class:         20.29 A decision taken before the information exists
Fix pattern:   Early on, a slow stroke is tentatively heavy (speed is the proxy); the final decision corrects it while the strike has not been released.
Regression test: TCH-01 (HEAVY PUNCH, HEAVY KICK), CTL-13.

## Fix record, iteration 8 round 2
- DEF-025 fixed: `SF.CFG.GRAB_CANCEL` (0.3 s) and the rule in `updateFighter` (a grab cancels a young wind-up); the grab plan restarts its step count. Tests TCH-02 (hand and leg at three speeds) and TCH-05 (the rule, both sides of the limit) pass.
- DEF-026 fixed: early tier by speed (tentatively heavy while the finger is down), corrected by the final decision; plus `needSure` in `mobile/plan.js`: a straight move is released only when the path is clearly straight (8 mm, under 25 degrees) or the finger has lifted, because a hook starts straight (found by TCH-01: the hook came out as a jab). CTL-13, TCH-01.
- New code under test: `mobile/plan.js` (plan from a stroke to keys, pure), TCH-01..05 drive the real simulation for 12 strokes and the grapple.
- User items: (1) key map revised to remove contradictions: `docs/MOBILE-KEYMAP.md`. (2) Unequal segments (forward and back 100 degrees, up and down 80) in the decoder, the drawing and the move circle; CTL-07's edge zone updated. (3) Grapple: DEF-025. (4) Full-stage option: the button at the top right of the three small buttons (stage fills the screen, controls drawn see-through over it); the choice is remembered. (5) "Motion block moves when touched": the move circle was floating (it jumped to the first touch by design); it is now fixed and only the knob moves. (6) Menu (the three-line button, or P on a keyboard, or the Menu button): mode, your fighter, the opponent and AI difficulty (Easy / Normal / Hard); the choice is remembered. Difficulty is part of the match and of the recording (`lv`; older recordings replay as Normal). Tests DIFF-01 (Normal changes nothing, same hashes), DIFF-02 (Hard beats Easy at least 65 percent of 60 fights, both sides), DIFF-03 (saved, restored, verified), DIFF-04 (clamped).
- Status: `node tests/run.js` 108 passed, 0 failed; lint 0 findings; mutations 20 of 20; soak of 300 fights unchanged (1 timeout, median 18.8 s, shares 34 / 37 / 29 percent), as expected because Normal is the old behaviour.
- Not verified: feel on a real phone (still), the Easy / Hard AI by hand, the menu on a very small screen, the controller without a menu on a keyboard-only desktop.


# Iteration 9 (boost, turn, more fighters, speed, help)
Requirements BOOST-01..04, TURN-01..03, MP-01..05, HELP-01, SPD-01 written first (`docs/REQUIREMENTS.md` section 12); 11 tests written first and failed.

## DEF-027  A thrown fighter is left without a holder in matches with more than two fighters
Status:        OPEN until the fix record below
Found by:      MP-04 (2 v 2 fights timed out: 5 of 30), then a look at the final states: fighters stuck in `flipped` with their holder knocked out of the grapple.
Severity:      Major (the match can never finish).
Root cause:    A fighter that grapples is in the state `grapple` and the victim in `flipped`. With two fighters nobody else can hit the holder. With a third fighter a strike staggers the holder, the grapple state ends, and the victim stays `flipped` forever (nothing moves it).
Why not caught earlier: every earlier test and the AI fights had exactly two fighters; the state machine silently assumed that.
Class:         20.30 A state machine that assumes exactly two parties
Detect similar: a property test over many random multi-party fights: "every dependent state has its owner at every step" (here: no `flipped` without a `grapple` holder); list every state that refers to another fighter (`grap`, `flipped`, protect) and ask what happens if the other one is interrupted by a third.
Fix pattern:   Make the interruption impossible (a fighter in a grapple cannot be hit) and add a safety net that releases an orphaned partner.
Regression test: MP-06 (scripted third-party hit and a 75-fight property check).

## Test-spec changes from deliberate rule changes (not defects)
- REC-03 used the mask 5000 as "out of range"; with 13 input keys it is valid. The test now uses `1 << keys`, which follows the key list.
- BOOST-01 first tried "an exhausted fighter cannot boost" with 100 stamina; the exhausted flag is cleared by normalise at that stamina, so the case was not testable that way. The test uses 29 stamina.
- The recording check allowed only winners 0 and 1; with more fighters the winner is any index 0 to 3.

## DEF-028  The AI crashes when its target changes in the middle of a reaction
Status:        OPEN until the fix record below
Found by:      an ad-hoc 2 v 2 soak (seed 4003): "Cannot read properties of null (reading 'a')" in `aiInput`; MP-04 and MP-06 had not hit it (other seeds).
Severity:      Major (the page would stop at a random moment in a 2 v 2 or 1 v 3 fight).
Root cause:    The AI keeps a reaction to a threat (`ai.threat`, `ai.reply = 'block'`) chosen against one opponent. With several enemies the nearest enemy can change while the reaction is running; the threat is then another enemy that is grabbing (it has no strike), but the stored reply is still "block", which reads the strike angle of an enemy that has none.
Why not caught earlier: with two fighters the target never changes, so the stored reaction always matched the current threat.
Class:         20.30 A state machine that assumes exactly two parties (second instance: per-opponent memory)
Detect similar: any field of the AI or of a fighter that was chosen "against the opponent" and lives longer than one step: reset it when the target changes; a randomised multi-fighter soak that must not throw (MP-08).
Fix pattern:   Remember which enemy the reaction was chosen against; when the target changes, drop the reaction so a new one is chosen. Also read the strike angle defensively.
Regression test: MP-08 (120 AI fights over three layouts, no error; seed 4003 of the 2 v 2 layout crashes before the fix).

## Fix record, iteration 9
- DEF-027 fixed (a fighter in a grapple cannot be hit or thrown; a safety net puts an orphaned thrown fighter on the floor): MP-06.
- DEF-028 fixed (the AI forgets its reaction when its target changes; the strike angle is read defensively): MP-08.
- Features: BOOST (30 stamina, 4 s of x1.5 damage, 12 s cooldown), TURN (flip the facing, 3 s lock, no hits behind), 2 to 4 fighters in teams (1v1, 1v2, 1v3, 2v2; allies pass through each other, K.O.'d fighters stay down and do not block), health bonus for the outnumbered side (CFG.LONE_BONUS 0.5), speed setting (default 1.0, no K.O. slow motion; 0.25 / 0.5 / 0.75 / 1 in the menu), help built from the game's own tables (HELP-01), touch buttons BLOCK / TURN / BOOST on an arc to the right of the move circle (BOOST shows its cooldown), flick the move circle for a dash.
- Status: `node tests/run.js` 124 passed, 0 failed; lint 0 findings; mutations 20 of 20; 2-fighter soak unchanged (1 timeout, median 18.8 s, shares 34 / 37 / 29 percent).
- Measured, not fixed: AI against AI, the lone side wins only 1 to 3 of 60 fights in 1 v 2 and 0 of 60 in 1 v 3 even with a bigger bonus (x2 to x3). Health is not the main problem (two attackers double the pressure), so a human may find it harder or easier than these numbers suggest; tell me if it feels unfair and I will add damage resistance or a larger bonus.
- Not verified: the feel on a real phone, boost balance by hand, 2v2 with an ally by hand, the keyboard keys X / U for boost and turn, the help on a very small screen. One unexplained observation: once the page showed all-AI after a menu choice (saved mode "cpu"); it did not reproduce in three attempts.

# Iteration 9, round 2 (lone-player balance, obstacles)

## Lone-player balance (user: "too hard")
The lone side now gets x2.5 health and takes x0.4 damage in 1 v 2 (x4 and x0.25 in 1 v 3): CFG.LONE_BONUS 1.5 and CFG.LONE_ARMOR 1.5 (per extra enemy). MP-07 rewritten first (health and damage ratios), failed, then passed. Measured: AI against AI, the lone side still wins only about a quarter of 1 v 2 fights with extreme settings, because it has to beat two fighters in a row; a human should find it much easier. Use Easy AI difficulty in the menu for more help.

## DEF-029  Boxes: two thresholds for one boundary, and a gap narrower than a body
Status:        FIXED
Found by:      OBS-06 (steps with a fighter inside a box: 17,847; then 2; and fights not finishing: 46 of 90), while building the obstacles.
Root cause:    (1) The height at which a fighter lands on a box (6 px under the top) and the height below which a box is solid from the side (8 px under the top) were two different numbers, so a fast fall could end in the band between them, inside the box. (2) The landing width (8 px beyond the edge) differed from the solid width (20 px), the same mistake sideways. (3) Boxes could be generated 24 px apart, narrower than a body (32 px), so a fighter squeezed between two boxes was pushed back and forth. (4) Shoves, throws and the separation of bodies moved a fighter after the box check. (5) The AI had no idea boxes exist and stood in front of them for the rest of the fight.
Class:         20.31 Two constants for one boundary
Detect similar: for every boundary the code tests in more than one place (land / solid, hit / miss, inside / outside), derive all tests from one constant or function; an invariant test over randomised play that counts violations ("nobody inside a box") finds the leftovers.
Fix pattern:   One constant for height (10 px) and one for width (16 px), used by landing, solidity and the final clean-up pass at the end of every step; box gaps of at least 40 px; the AI jumps when a box blocks the way (SF.blockedAhead).
Regression test: OBS-06 (invariant over 90 AI fights), OBS-01 (gaps).

## Fix record
Obstacles (option off / a few = 2 / many = 4, in the menu; default off): `SF.makeObstacles` (from the seed, own random stream, so with the option off the game is identical: OBS-07 and MP-03), `SF.groundLevel`, solid sides, climbing, standing, falling off edges, AI jump. Drawn in 2D (crates, shadows on the box top) and in 3D. Status: `node tests/run.js` 131 passed, 0 failed; lint 0 findings.
Not verified: climbing by touch on a real phone (jump is the move circle's up), the AI on top of boxes by eye, the 3D boxes by eye, strikes between fighters on different heights at length.

## DEF-030  Fighters fall through boxes (thrown, or when the match ends)
Status:        OPEN until the fix record below
Found by:      user ("when falling down sometimes they fall through the boxes"); reproduced by OBS-08 (a thrown fighter never lands on a box: 0 of 20 throws over a box; the end-of-match case checked in the same test).
Severity:      Major (visible, breaks the new feature).
Root cause:    Three code paths assign the height directly and were written before boxes existed, so they ignore the floor under the fighter: (1) the throw arc (`driveFlip`) sets the victim's height from a curve that ends at 0 and passes through the box; (2) `finishFlip` sets `h = 0`; (3) the freeze at the end of the match (`finish`) sets `h = 0` for everyone. Ordinary jumps and drops are correct (OBS-08 part a). The clean-up pass at the end of the step then pushes the body out sideways, which looks like falling through and popping out.
Why not caught earlier: OBS-06 only counts steps inside a box and exempts the flying state; the clean-up pass hid the other two paths.
Class:         20.32 A shortcut path that bypasses a new rule (second instance of "one rule, several writers")
Detect similar: grep for every direct assignment to the variable the new rule constrains (`\.h =`, `\.h =`), and for each ask "does it know about the new constraint?"; a scenario test per writer.
Fix pattern:   One function gives the floor under a position (`SF.floorUnder`); every writer of the height uses it as the lower bound.
Regression test: OBS-08.
Fix record DEF-030: `SF.floorUnder`; the throw arc, the throw landing, the freeze at the end of the match and the orphan safety net all use it as the lower bound for the height. OBS-08 (dropped at 135 speeds x positions x heights, thrown over a box at 20 positions, a K.O. on top of a box) passes. 132 tests, lint 0, mutations 20 of 20, 2-fighter soak unchanged. Not verified by eye: a throw over a box in the browser.

# Iteration 10 (trainer mode)
Requirements TRN-01..05 written first (`docs/REQUIREMENTS.md` section 13); 5 tests written first and failed, then passed. No defects found in this iteration by the tests.
- Rules: match option `training` (nobody is K.O.'d, the trainee never tires; recording is off in training because the dummy is changed at run time).
- Model: `src/training.js` (pure): 19 drills built from the style's own tables (12 move drills, a 3-move sequence from the style's graph, block, parry, dodge, grapple, boost, turn), the dummy (still / blocks / attacks slowly with the easy AI / fights back / follows the drill), progress, skip, restart. The hit event now carries the move name.
- UI: menu mode "Training", a "Training dummy" row, a small panel at the top of the screen (drill, count, hint for the keyboard or the touch controls, Skip / Restart / Exit). Checked in the browser: the first drill completed by three real jabs and the dummy was refilled instead of K.O.'d.
- Status: `node tests/run.js` 137 passed, 0 failed; lint 0 findings.
- Not verified: the panel over the stage on a real phone (it covers the top of the arena; Skip / Restart / Exit are small), the block / parry / dodge drills by hand against the attacking dummy, drills with obstacles on.

# Iteration 10b (strike angle, tutorial)

## DEF-031  Crouched, an overhand points up (a mode overrides the control angle)
Status:        OPEN until the fix record below
Found by:      user ("when crouched, overhand punch is angled toward top; the angle should match the hand control angle"); reproduced by TUT-01 (crouched with aim -30 gives an UPPERCUT at +45) and TUT-02 (crouch + aim down hits the head).
Severity:      Major (the control does the opposite of what the thumb says).
Root cause:    In `SF.pickMove` the test "crouching" came before the test of the aim, and set the move to an uppercut at a fixed 45 degrees whatever the aim. The touch controller holds the crouch for a downward stroke because the move circle's down segment is crouch, so every downward overhand stroke made from a crouch became an uppercut.
Why not caught earlier: the keyboard rule "crouch + F = uppercut" is intended; no test combined crouch with an aim.
Class:         20.33 A mode flag overrides a continuous input (priority of overlapping rules)
Detect similar: for every rule that selects by a flag (crouch, air, run), list the continuous inputs it ignores and test each combination (flag x input value); TUT-01 does it for punches.
Fix pattern:   The continuous input wins: choose by the aim first; the flag only supplies the default when the input says nothing (level aim).
Regression test: TUT-01, TUT-02.

## Fix record, iteration 10b
- DEF-031 fixed: `SF.pickMove` decides by the aim first (aim up 35 or more: uppercut at that angle; aim down 25 or more: overhand at that angle); crouching only gives the uppercut default when the aim is level. TUT-01 and TUT-02 pass (they failed first).
- Touch: the stroke angle is the aim (level hits the body, up and forward the head, steep down the overhand); the strike waits for the aim to arrive when it is more than 8 degrees away (the aim moves at 120 degrees per second). TUT-03.
- Fixed dummy (`SF.setDummy(m, 'fixed')`): stays, no reaction, cannot be thrown, is not pushed by the attacker's body; still takes damage. TUT-04.
- Tutorial lesson 1, hands (`src/tutorial.js`, TUT-05, TUT-06): 8 steps: BODY target, HEAD target (aim up), LOW target (aim steeply down), UPPERCUT to the head, HOOK to the body, SPEED (3 jabs within 3 s), STRENGTH (a heavy punch, shown against the average jab), and a mix (head, body, low in a row). The dummy is fixed at x = 520; the target ring and a "stand here" band are drawn; the panel shows the step, the hint for this device, the live aim angle, the last hit with damage and a hint when the wrong zone was hit. Menu: Mode "Tutorial: hands (new)". Recording is off. Skip / restart / exit buttons.
- Status: `node tests/run.js` 143 passed, 0 failed; lint 0 findings. Checked in the browser (emulated phone): a level stroke hit the body, an up-forward stroke hit the head and the panel gave the right hint; the fixed dummy stayed at x 520.
- Not verified: the target ring and band by eye (the pane screenshots were too small), the panel on a real phone, the LOW target (needs standing at the right distance), the speed and strength steps by hand, balance of the damage numbers.

## Iteration 10c: the tutorial redone (user: "not all that; punch only, one line, the angle is the punch angle")
The first version of the lesson (named punches, hit zones on a dummy) was replaced. Now: no opponent on the screen, only targets.
- Lesson 1, punch (`src/tutorial.js`, TUT-05..07): a dashed line at the angle to punch and a semi-transparent circle to hit; the line you draw (or the aim on a keyboard) sets the punch angle; 7 steps (straight ahead, up, down, steep, any angle, speed with expiring targets, strength with light and heavy targets); a miss says "N degrees too high / low".
- Rules for the tutorial (`createMatch({ tutorial: 1 })`): the trainee is planted, so no lunge or foot movement (the pose also skips the rear heel lift when there is no lunge), no walking, jumping or kicking; the aim turns at 360 degrees per second; each punch reports a `swing` event. The hidden dummy is fixed off the stage at x = 860.
- Touch: in the tutorial every line is a punch at the angle of the line; the aim servo dead band is now 3 degrees (was 5) so the punch angle is within about 3 degrees of the line; legs and the other buttons are dimmed.
- Drawing: the dashed line is long and bright, the circle turns green on a hit and red on a miss, a white ring counts down timed targets, the label shows the angle (and LIGHT / HEAVY).
- Test fixes while building (test bugs, not defects): TUT-06 used a swing angle relative to the wrong target; the earlier drill steps fed jabs that satisfied the speed step.
- Status: `node tests/run.js` 144 passed, 0 failed; lint 0 findings. Checked in the browser: no opponent drawn, dashed 0 degree line and circle, a +30 degree punch reported as 30 degrees off, the trainee stayed at x = 300.
- Not verified: drawing lines on a real phone (the 4 mm / 2.5 mm thresholds were made for the full game), the speed and strength steps by hand, the line at the steep angles by eye.

## QA audit, end of iteration 10 (the user asked: "did you follow QA?")
Gaps found in my own process, and what was done:
1. DEF-024 named the class "20.x" and the guide entry was never written. Done now: guide 20.34.
2. DEF-024 and parts of DEF-029 were fixed in code before they were logged (order wrong). The later defects (DEF-025 to DEF-028, DEF-030, DEF-031) kept the order: reproduce with a test, log, then fix.
3. User feedback on the phone layout (circles too high, too big, "moves", the stage overlapping, the server not loading) was handled as design changes without a reproduction or a root cause; "the controls move" and "the server does not load" were never confirmed. Logged as feedback, not as defects.
4. One observation was left unexplained (the saved mode "cpu" after a menu choice). It did not reproduce; the root cause is not found.
5. New code has no mutation checks (only the old 20 run): the decoder, the touch plan, difficulty, teams, boxes, training and the tutorial. The decoder had 6 ad-hoc mutations (4 caught at first).
6. Browser-only code (drawing, the 3D view, the panels, the touch overlay, the menus) is checked by eye in a browser, not by an automated test.
7. Three tests were changed after a deliberate rule change (REC-03, BOOST-01, GRP-02); each was logged, but loosening a test is a risk.
Open items to close: mutation checks for the new modules, a browser smoke test for the overlays, and a root cause for item 4.

## QA audit, results (the user asked for the audit to be done)
Tools added: `tests/audit.js` (requirements, tests, defects and guide agree), `tests/mutate2.js` (30 mutations of the code added after iteration 7), `tests/browser-smoke-ui.js` (overlay, menus, help, buttons, a 200-step menu fuzz).
What the audit found and what was done:
1. Traceability: 29 tests had no requirement row (CTL, TCH, DIFF, FIG-01, PUNCH-02, FLR-02b) and 4 requirements had no test or reason. Done: rows added (section 15 of the requirements); UI-01, REC-08 and TURN-03 are listed with the reason that they are checked in the browser. `node tests/audit.js` is clean (142 requirements, 153 tests, 31 defects).
2. Defect records: DEF-006 and DEF-007 named tests that do not exist (LINT-02, LINT-03), DEF-025 named GRP-08 (the real one is TCH-05), DEF-023 and DEF-024 named no regression test, DEF-024 cited "20.x". Done: corrected; DEF-024 is now class 20.34 with the regression test BR-04.
3. Stale tests: `browser-smoke.js` still expected the old F1 canvas overlay (fixed: F1 opens the help panel); `browser-smoke-rec.js` still expected the live speed to be 0.7, the old default (fixed: it compares with the speed it started with, and it must run in a page without ?touch=1).
4. Mutation checks for the new code: 30 mutations; at first 27 were caught. Survivors showed two weaknesses of my tests: the new aim wait protected the hook from being released early, so the check could not see the missing release rule (now a direct check of the plan, `planSure`), and one mutation edited the wrong copy of a line (a mutation target must be unique; the tool says so only if the text is missing). All 30 are caught now.
5. The unexplained all-AI state: not reproduced. A 400-step random menu fuzz (one field at a time, as in the menu) found no inconsistency; the fuzz is kept as BR-09 (200 steps). The root cause stays unknown; the likeliest source is a leftover saved setting from an earlier build of the page in that tab.
6. Still open: browser-only drawing (3D view, arrow, target drawing) has no pixel tests beyond BR-04; the touch thresholds were never measured on a real phone.
Status: `node tests/run.js` 144 passed, 0 failed; lint 0; mutate 20 of 20; mutate2 30 of 30; audit clean; soak of 300 fights unchanged (1 timeout, median 18.8 s, shares 34 / 37 / 29 percent); browser UI smoke, general smoke and recording smoke all pass.

## Tutorial readouts (user: the aim line was blue like the fighter; show angle, power and speed; "how about arrow length, width or colour")
The aim is now one white arrow with a dark edge (never blue): its direction is the angle, its length the power (length of your line, or the charge of the key), its width the speed of your line; the last punch stays as a faint dashed line for a second (green hit, red miss). Target colours: yellow, orange for heavy, green for light (no blue). Readouts on the left: ANGLE (target, you), POWER (LIGHT / NORMAL / HEAVY as it would be if you lifted now), SPEED (mm/s). Strength does follow the drawn line: see `mobile/decode.js` and `mobile/plan.js`.

# Iteration 11: the GUI comparison, all eight improvements, and the action catalogue
Requirements first (section 16 of the requirements) and tests first (`tests/gui.js`): 18 tests written, 3 of them failed at first for missing files (PWA, catalogue page) and the rest for missing modules; then the code. No product defect was found by the tests in this iteration; defects of my own tests and tools are listed below.

What was built (all of it presentation or input; the rules, recordings and AI are untouched):
1. Settings (`src/settings.js`, SET-01..03): handedness, control size, opacity, floating or fixed move circle, back-block, tap-to-jab, TURN button, colour-blind palette, HUD size, vibration, hit pause. Menu page "Settings", remembered on the device.
2. Layout (`mobile/layout.js`, LAY-01..04): one pure function for where everything sits and what a touch means; left-handed mirrors it; right-handed is exactly the old layout (LAY-01).
3. Fast paths: a tap anywhere on the attack half is a jab and a line there punches at its angle (TAP-01, browser BR-14); hold the stick away from the opponent to block, off by default (BKB-01).
4. HUD: labelled bars (HEALTH, STAMINA, GUARD, BALANCE), a size setting, the palette (HUD-01, BR-10).
5. Feedback (`src/feedback.js`, FBK-01): a brief pause of the picture on a hit (at most 250 ms), vibration on hits, blocks, parries, knockdowns and the K.O.; a dash recharge ring on the move circle.
6. Menu: Quick play, Settings, Help, Action pictures, Resume (the pause menu, also on Escape and P), the first-run offer of the tutorial (MNU-01, ONB-01, BR-11, BR-12, BR-13).
7. TURN: can be hidden in the settings (the automatic facing was already there).
8. Offline app (PWA-01..03): manifest (landscape, fullscreen), icons, a service worker written by the build with a cache name that carries a hash of the build, and a local copy of three.js (`vendor/three.min.js`, 603,445 bytes, from cdnjs, the same r128 the 3D view used). The service worker is tested in a fake worker environment because a real one cannot register here.
9. Action catalogue (`src/actions.js`, `tools/make-actions.js`, ACT-01..03): 29 actions, each in three poses taken from the game's own pose engine and drawn as images (`docs/ACTIONS.html`; a test regenerates the page and compares, so it cannot go stale); also reachable in the game (menu, Action pictures).

QA tools after this iteration: `node tests/run.js` 160 passed, 0 failed; lint 0; `mutate.js` 20 of 20; `mutate2.js` 45 of 45 (15 new mutations for the new modules, all caught at the first run); `audit.js` clean (166 requirements, 174 tests); soak of 300 fights unchanged (1 timeout, median 18.8 s); the three browser smoke tests pass (general, recording, UI with BR-10 to BR-14).

Defects of my own tests and tools found and fixed on the way (not product defects):
- A test used `/^\.\//` and a URL string containing two slashes; the lint rule for `//` comments (20.1) flagged both. Rewritten without the sequence.
- The UI smoke test clicked the first "Skip" button on the page, which was the training panel's, not the first-run offer's (a selector that is not unique; same family as DEF-024). Now it searches inside the offer.
- The old smoke tests had to learn about the first-run offer (they skip it).
- The audit tool needed the list of requirements checked in the browser to name browser tests that exist (it now checks that).

Not verified, and why:
- Everything on a real phone: layout sizes, floating stick feel, tap-to-jab versus accidental taps, back-block feel, hit pause length, vibration.
- The service worker for real: this browser pane is an embedded browser that refuses to register one, and a phone on http://192.168.x.x is not a secure context either. To install the game on the phone it must be served over https (for example a static host) or through `adb reverse` to localhost. Vibration works on Android Chrome only.
- The 3D view does not use the colour-blind palette.
- Previews show the Boxer's moves (the moves are the same for every style apart from the sequences).

## DEF-032  Different moves are drawn almost the same (found in the action catalogue)
Status:        OPEN until the fix record below
Found by:      user ("some actions look almost the same?" about docs/ACTIONS.html); reproduced with a pairwise comparison of the contact poses of every action (hip-relative RMS distance of all joints).
Severity:      Medium (it is a game-feel problem, not a crash: the player cannot tell the moves apart by looking).
Symptom:       The contact poses of FRONT KICK, HEAVY KICK and SPINNING KICK differ by 0.0 to 0.8 px, ROUNDHOUSE by 1.1 to 1.7 px; CROSS and HEAVY PUNCH by 1.4 px; LOW KICK and LOW SWEEP by 2.5 px; BLOCK and PARRY, STAND and BOOST are identical. Several actions barely change over their three preview poses (HOOK 7.4, JUMP 6.7, CROSS-type punches).
Root cause:    Two layers. (1) The pose engine draws a kick from only two numbers, the aim angle and the limb: every move of the same limb at about the same angle gets the same pose. The move's `kind` (hook, spin, straight) changes damage and flight but is not read by the pose code, and the heavy versions differ only in timing and strength. The spinning kick looks different in play only because the drawing squeezes the figure sideways (spinScale), which the skeleton, and so the preview, does not contain. (2) The catalogue shows three still poses, so it cannot show timing, power, the path of the limb or the angle, which is where such moves do differ.
Why not caught earlier: the motion tests check that poses are legal (joint ranges, speeds, the floor) and smooth; nothing compared one move with another, and the preview page was the first time all moves were put side by side.
Class:         20.35 Variants that differ in the rules but not in what the player sees
Detect similar: a pairwise distinctness test over every variant (here: contact poses of all moves) with an explicit, explained list of pairs that may look alike; a side-by-side page of all variants.
Fix pattern:   Give each variant its own look field in the data table and read it in the drawing code (kick chamber and lean, torso rotation, balance arms), include everything the drawing adds (the sideways squeeze) in what the preview shows, and add to the preview what a still pose cannot show (the path of the limb, a highlight of the striking limb, the aim angle, the timing bar and the numbers).
Regression test: ACT-04

## Fix record, DEF-032 (moves that look the same)
- Test first: ACT-04 failed with 8 pairs under 4 px (FRONT / HEAVY / SPINNING kick at 0.0, ROUNDHOUSE at 1.5, CROSS / HEAVY PUNCH at 2.3, LOW KICK / LOW SWEEP at 2.7).
- Data: a `look` field in `CFG.MOVES` (heavy, round, spin, sweep); `beginMove` copies it into the strike.
- Pose engine (`src/pose.js`): the look is read. Roundhouse: knee up and across, a curved path, hips turned, torso leaning away. Heavy kick: high chamber, long thrust, leaning back, arms back. Spinning kick: body turned away and leaning forward, arms tucked (plus the sideways squeeze). Low sweep: low forward lean, the foot along the floor, a hand down. Heavy punch: more lean and more shoulder turn than a cross.
- Catalogue: the preview now shows the squeeze of a spin, a dotted path of the fist or foot, the contact point ringed, the tip highlighted, the aim angle as a dashed line, a timing bar in proportion, and the numbers (angle, hand, reach, damage, knockdown, step, chain window); marks for block and parry (shield, spark), dash and sprint (speed lines), jump (path) and turn (arrows).
- After: every pair of moves differs by 4 px or more at contact (the closest are about 5 px); the stand, boost, block and parry still share a pose on purpose and are told apart by the aura, the shield and the labels. `node tests/run.js` 161 passed, 0 failed; mutate2 47 of 47 (two new mutations, both caught by a new check); the animation limit tests (speed, joint ranges, floor) still pass with the new poses.
- Not verified: how the new kick poses look and feel at game speed in a real fight (they were checked in the catalogue and by the motion tests only); the previews are for the Boxer.

# Iteration 12: flashy moves instead of look-alikes (user: "replace similar ones with actions that look flashy and completely different; a flying kick, a round kick, a butterfly kick?")
Answer to the question: the flying kick (FLYING SIDE KICK, in the air) and the round kick (ROUNDHOUSE) already existed; the butterfly kick did not.
Requirements first (section 17), tests first (`tests/flash.js`: 5 tests; the 3 that checked the table and the choice failed, the others failed on missing names); then the change. The rules are reused (frames, damage kinds), so the balance is unchanged.
- Replaced: HEAVY KICK by the AXE KICK (a long kick hold; the leg goes straight up overhead and the heel chops down; the Kicker keeps the spinning kick), HEAVY PUNCH by the SPINNING BACKFIST (a long punch hold; the body turns, the arm swings wide), JUMP PUNCH by the SUPERMAN PUNCH (a punch in the air; the body lies flat in the air, one arm out).
- New: BUTTERFLY KICK (in the air, kick with the aim up: the body lies flat and turns, the legs open like scissors) and TORNADO KICK (in the air, a kick held for 0.3 s: a full turn ending in a high roundhouse). The FLYING SIDE KICK is now drawn with the body lying back and one leg driven out straight.
- The pose engine: the figure can lean or lie as a whole in the air (the rigid rotation that the throw already used), the aerial and backfist turns are drawn as a squeeze that never goes thinner than 40 percent, and kicks have chambers, arcs and balance arms of their own (`kickLook`).
- The AI throws them: after a jump it now picks the flying kick, the butterfly kick (aim up), the tornado kick (a hold) or the superman punch. This changes what the AI does after a jump, so recordings made before this build may no longer replay identically.
- Also updated: the move table, the help, the training drills (4 new drills: superman, flying kick, butterfly, tornado; 23 in all), the catalogue (`docs/ACTIONS.html`, 18 moves with the path, contact ring, angle and timing), the old tests that named the replaced moves.
- Status: `node tests/run.js` 166 passed, 0 failed; lint 0; `mutate.js` 20 of 20; `mutate2.js` 49 of 49 (two more for the choice of move); `audit.js` clean; soak of 300 fights: 0 timeouts, median 19.2 s, shares Boxer 33 / Kicker 38 / Grappler 29 percent (before: 34 / 37 / 29). The new aerial moves are used by the AI (about 75 times each in 300 fights).
- Checked by eye: the catalogue at large size, and one flying side kick in the real game (the body lies flat, the leg hits the dummy at head height). Not checked by eye in play: the butterfly, tornado, superman, axe and backfist at game speed, on a phone, and the touch gestures for the aerial moves (they work through the existing plan: jump, then a stroke up in the leg circle, or a long slow stroke).

# Iteration 13: getting up (user: "how about recovery once down? can we use the movement wheel? what are good martial-arts recoveries?", then "do the recommended")
Requirements first (section 18, RCV-01..RCV-14), tests first (`tests/recovery.js`), then the change.
- While down, after 0.3 s, the move circle (keys W A S D) picks the stand-up: up kip-up (0.5 s, 25 stamina, safe 0.2 s), forward roll (0.8 s, 15, +70 px toward the opponent, safe 0.35 s), back roll (0.8 s, 15, -90 px, safe 0.5 s), down stay and guard (1.4 s, free, fastest stamina regeneration, safe 0.8 s). No choice: the old automatic stand-up. Break-fall: a tap within 0.15 s after landing, or in the last 0.25 s of a throw, shortens the fall by a third and the throw damage by 30 percent, once per fall.
- AI chooses once per fall (weights by stamina, gap, edge). Poses: tucked roll with a rigid rotation, kip-up. UI: recovery wheel on the stage, touch move-circle labels switch while down. Help, two training drills (recover, breakfall), five catalogue actions.
- Fixture bug (not a game defect): the first `lying()` fixture had no `budget`, so test hits counted as protected and RCV-03 failed for the wrong reason; fixed in the fixture. Other test fixes: roller moved out of range (RCV-03), loop too short and a head-low guard crawl (RCV-13 now checks rotation).
- Audit found two gaps (RCV-12 not listed as checked by hand, BR-15 not a requirement row); both added.
- Status: `node tests/run.js` 179 passed, 0 failed; lint 0; `mutate.js` 20 of 20; `mutate2.js` 55 of 55 (six new for recovery); `audit.js` clean; soak 300 fights: 1 timeout, median 18.5 s, shares Boxer 30 / Kicker 39 / Grappler 31 percent; 403 recoveries by the AI.
- Numbers are starting guesses to tune by feel. The AI change means recordings made before this build may not replay identically.
- NOT verified: the browser smoke tests could not give a valid result this session (the pane ran at about 5 frames a second, so BR-05, 07, 10, 12, 14 failed too, and those passed in earlier iterations; no console errors from the game); BR-15 therefore has not yet passed in a browser. Not seen by eye: the recovery wheel, the roll poses at game speed, the touch labels, on a real phone. Not built: up-kick from the ground, technical stand-up, AI break-falls.
