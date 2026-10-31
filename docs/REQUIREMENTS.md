# Slow Fist v2: Requirements, scope and architecture

Follows `QA-GUIDE.md` (sections 3, 4 and 19). Behavioural rules are carried over from v1 (`SPEC.md` in the folder above) and rebuilt from scratch with a testable design.

## 1. Vision

A real-time, slow-motion stick-figure duel for two (or one against the AI) where reading the opponent and planning a counter beats button speed. Not turn based, not rock-paper-scissors: continuous dials (hold time, aim angle, taps, spacing, stamina, balance) resolved by simple physics.

Top quality attributes and targets:

| # | Attribute | Target | Measured by |
|---|---|---|---|
| 1 | Correctness / determinism | Same seed and inputs give identical results; no NaN; config never mutated | `tests/run.js` SIM suite |
| 2 | Physical plausibility | No joint under the floor, constant limb lengths, knees bend forward, in every state | FLR suite + `sweep.js` |
| 3 | Fairness and variety | AI fights finish; every style wins 25 to 75 percent; at least 10 move kinds used | `sweep.js` soak |
| 4 | Maintainability | Rules separate from drawing; tunables in one frozen table; each requirement has a test | file layout, `tests/` |

## 2. Scope of v2.0

In scope: two fighters, three styles (Boxer, Kicker, Grappler), keyboard for two players, AI opponent and AI vs AI, slow-motion speed control, strikes (jab, cross, hook, heavy punch, uppercut, overhand, front kick, roundhouse, spinning kick, rising kick, low kick, sweep, heavy kick, jump punch, flying kick), guard with parry/block/partial, grapple and throw, dash with dodge, stamina and exhaustion, balance, combos, knockdown and get-up, K.O., help screen.

Out of scope for v2.0 (roadmap): touch gestures, online play, record/replay, superman punch, slide kick, somersault kick, shoulder tackle, axe kick, gamepad, mouse aim.

## 3. Requirements (each has a test id in `tests/run.js`)

| ID | Requirement |
|---|---|
| SIM-01 | The simulation is deterministic: the same seed and the same input list produce the same state hash after N steps. |
| SIM-02 | The simulation advances in fixed steps of 1/60 s; the step function rejects or clamps any other time step into [0, 1/20]. |
| SIM-03 | No numeric field of the match state is NaN or infinite after any step. |
| SIM-04 | The configuration tables are deeply frozen; running a match does not change them. |
| FLR-01 | A fighter's height `h` is never negative outside the `flipped` state. |
| FLR-02 | In every state, every skeleton joint has y no more than 1 px below the floor line. |
| FLR-03 | Upper arm, forearm, thigh and shin lengths stay within 1 px of their rest lengths in every pose. |
| FLR-04 | Knees point in the facing direction (never backwards) in every upright pose. |
| MOV-01 | Move selection follows the table in `SPEC.md` 7.5 for punches and kicks, including Kicker-only spinning kick. |
| MOV-02 | Strike angle is clamped to the anatomical limits (`SPEC.md` 7.6). |
| MOV-03 | Tap-boost adds `0.7 x style.tap` to strike speed per tap, capped at 3, costs 12 stamina, needs 0.08 s between taps. |
| MOV-04 | Jumping needs the ground and no crouch; leg injury lowers the jump to 75 percent. |
| CMB-01 | Guard outcomes: PARRY (guard age under 0.25 s and within tolerance), BLOCK (within tolerance, 10 percent damage), PARTIAL (within 2 x tolerance, 50 percent), otherwise HIT. |
| CMB-02 | Hit zone follows contact height: head, body, legs. |
| CMB-03 | Damage multipliers: head x1.3, legs x0.8, charging target x1.3, off-balance target x1.25. |
| CMB-04 | Knockdown occurs when `tip` exceeds 52 (40 if off balance) and the target is grounded. |
| CMB-05 | Strikes whiff against a target that is down, flipped, early in get-up, or dashing (dodge gives a counter window). |
| CMB-06 | A hit landed inside the victim's hit reaction within 1.2 s chains a combo (+10 percent per hit, up to +40). |
| CMB-07 | Guard health reaching 0 breaks the guard (1.0 s stagger). |
| GRP-01 | A grapple fails (no throw) against a crouching, dashing or fast-retreating target, out of range, or airborne. |
| GRP-02 | A successful throw ends with the victim `down` at h = 0, damage 14 x thr, stamina -20. |
| KO-01 | When hp reaches 0 a winner is set; afterwards stepping the match changes nothing about either fighter. |
| STA-01 | Stamina 0 means exhausted (no strikes or jumps) until stamina is back to 30. |
| STY-01 | Style numbers (reach, multipliers, HP, grab range, throw power) equal `SPEC.md` section 4. |
| AI-01 | The AI never issues an attack input when its fighter cannot act. |
| AI-02 | At least 95 percent of AI-vs-AI fights across 60 seeds finish within 40 s of simulated time. |
| AI-03 | Across 40 fights the AI uses at least 10 distinct move kinds. |
| AI-04 | Across a mixed-matchup sample no style wins under 25 or over 75 percent of decided fights (reported as a warning if the sample is under 60). |
| UI-01 | Keyboard maps for P1 and P2 and the system keys (R, T, 1, 2, [, ]) are documented in the help overlay. |

## 4. Architecture

Single-file delivery, modular source. `src/*.js` are plain scripts sharing one namespace `SF`; `build.js` concatenates them into `index.html`; the tests load the same files in Node, so the browser and the tests run identical code.

| File | Responsibility | Must never |
|---|---|---|
| `src/rng.js` | Seeded random numbers | Use `Math.random` |
| `src/data.js` | Frozen constants, styles, move-kind table | Contain logic |
| `src/sim.js` | Match creation, step, combat, physics | Touch the DOM or canvas |
| `src/pose.js` | Skeleton from fighter state (IK, floor snap) | Change fighter state |
| `src/ai.js` | Input choice from match state | Change state directly |
| `src/render.js` | Draw skeleton, effects, HUD | Change state |
| `src/main.js` | Keys, loop, modes, help | Hold game rules |

### ADR-003: modular source, single-file build
Context: v1 was one 1,700-line file that was hard to test headlessly. Decision: modules concatenated at build time, tested in Node. Consequences: a build step (a 30-line script) but real automated tests.

### ADR-004: deterministic fixed-step simulation
Decision: 60 Hz fixed step, seeded RNG, inputs as plain data. Consequences: replays, regressions by seed, and soak tests reproducible. Rendering interpolates nothing; it draws the latest state.

### ADR-005: ground clamp by construction
Decision: `pose.js` computes the skeleton, then translates it so the lowest joint is never below the floor (except an explicit flip arc). Reason: defect class 20.4 and 20.1 in the QA guide; constrain at the source of the pose.

### State machine
`idle -> charge -> strike -> recover -> idle`; `idle|guard`; `idle -> grab -> grapple -> idle`; victim `flipped -> down -> getup -> idle`; hit `-> stagger -> idle` or `-> down`. Forbidden: any attack state while `down`, `flipped`, `getup` (early) or after a winner exists.

### Invariants (checked by tests and sweeps)
no NaN; `h >= 0` outside flips; joints above floor; limb lengths constant; stamina in [0,100]; hp in [0, max]; state in the allowed list; no strike after winner.


## 5. Traceability (requirement -> test)

| Requirement | Tests |
|---|---|
| SIM-01 to SIM-04 | `SIM-01`, `SIM-02`, `SIM-03`, `SIM-04` |
| FLR-01 | `FLR-01` |
| FLR-02, FLR-03 | `FLR-02/03`, `FLR-02b`, `FLR-05` (head extent), `FLR-06` (lying figure rests on the floor) |
| FLR-04 | `FLR-04` |
| MOV-01 to MOV-04 | `MOV-01` to `MOV-04` |
| CMB-01 to CMB-07 | `CMB-01` to `CMB-07` |
| GRP-01, GRP-02 | `GRP-01`, `GRP-02` |
| KO-01 | `KO-01` |
| STA-01 | `STA-01`, `STA-02` (bounds), `STA-03` (jump refused at low stamina) |
| STY-01 | `STY-01` |
| AI-01 to AI-04 | `AI-01` to `AI-04`, plus `node tests/sweep.js` for the numbers |
| UI-01 | help overlay in `src/render.js` (checked in the browser smoke test, `BR-02`) |
| Process (QA guide 19, 20) | `FIX-01`, `SYNTAX-01`, `LINT-01`, `MUT-01`, browser `BR-01` to `BR-03` |

Out of scope for v2.0 and therefore untested: touch, online, replay, mouse aim, gamepad, dummy mode, slide kick, superman punch, somersault kick, shoulder tackle, axe kick.

## 6. Iteration 2: closing the gaps found while comparing with v1

Added after the first v2 release. Same process: requirements, then tests, then code; any failure follows the defect protocol.

| ID | Requirement |
|---|---|
| MOV-05 | Sprint: two rising edges of the same direction key within 0.25 s start a sprint burst of 0.5 s (top speed x1.45, costs 6 stamina, refused if stamina is below 6). |
| MOV-06 | Variable jump: holding jump while rising uses the lower gravity `G_HOLD` (330), so a held jump goes higher than a tapped one. |
| MOV-07 | Jump spring: a jump first crouches for 0.07 s (`jumpPre`), then launches. Stamina is spent when the key is pressed. |
| CMB-08 | A leg hit on a grounded target moving faster than 110 px/s is a TRIP: event `trip`, stagger 0.9 s. |
| BAL-01 | Balance gauge: weight shifts forward when stepping toward the opponent, back when backing away, and back while loading a strike; the gauge is shown in the HUD. `bal` stays in [-1, 1]. |
| ANI-01 | The spinning kick turns the body through a full 360 degrees in the drawing: horizontal scale 1, 0, -1, 0, 1 over the strike (`SF.spinScale`). |
| ANI-02 | Victory poses differ by style (Boxer fists up, Kicker high kick held, Grappler flexing) and obey the floor and limb-length invariants. |
| ANI-03 | Hit reactions depend on the zone: body hit doubles the fighter over, head hit snaps the head back, leg hit buckles the knees. |
| ANI-04 | The stand-up is a sequence (hands and knees, one knee up, rise) and keeps every invariant at every instant. |
| SND-01 | Every simulation event that has a sound maps to a named sound (`SF.soundPlan`); audio is synthesised in the browser, F2 toggles it. |
| HELP-01 | The page carries a written guide (controls, moves, mechanics) under the game, not only the overlay. |

| ID (added in iteration 2) | Requirement |
|---|---|
| KO-02 | After a K.O. the loser is `down` and falls to lie on the floor (head resting within 3 px of it), no hit flash is left on either fighter, and the winner holds the victory pose; the state hash stays frozen. |
| ANI-05 | No joint moves more than 22 px between two samples 0.025 s apart during the stand-up (continuity). |
| LINT-04 | The lint scanner flags the patterns it should and ignores the same text inside comments and strings. |

### Traceability for iteration 2

| Requirement | Tests |
|---|---|
| MOV-05, MOV-06, MOV-07 | `MOV-05`, `MOV-06`, `MOV-07` (+ mutations `sprint never starts`, `held jump uses normal gravity`) |
| CMB-08 | `CMB-08` |
| BAL-01 | `BAL-01` |
| ANI-01 | `ANI-01` |
| ANI-02, ANI-03 | `ANI-02`, `ANI-03` |
| ANI-04, ANI-05 | `ANI-04`, `ANI-05` (+ mutation `stand-up never kneels`) |
| SND-01 | `SND-01` (mapping only; audio is synthesised in the browser) |
| HELP-01 | `HELP-01` |
| KO-02 | `KO-02` |

Still out of scope: online play, touch controls, recording and replay, mouse aim, gamepad, dummy mode, slide kick, superman punch, somersault kick, shoulder tackle, axe kick.

## 7. Iteration 3: recording and replay

Design: the simulation is deterministic (seed, fixed step, AI driven by the match RNG), so a recording is the seed, the two styles, which fighters are AI, and the input of each human fighter for each step, plus a state-hash checkpoint every 60 steps and a final hash. Replaying re-runs the simulation. Pressing V starts a **new round** and records it from its first step.

| ID | Requirement |
|---|---|
| REC-01 | A recording replays to the same state hash at every checkpoint and at the end (human vs AI and AI vs AI). Changing one recorded input, a checkpoint or the final hash makes verification fail. |
| REC-02 | `parse(serialize(rec))` equals the recording; 1,800 steps serialise to under 40 KB. |
| REC-03 | Loading rejects: invalid JSON, wrong version, missing or non-integer seed, styles out of range, a non-array or oversized frame list, frames that are not two integers in 0..2047, malformed checkpoints. |
| REC-04 | Replay runs at normal speed (1.0) by default, independent of the live slow-motion setting; speed can be set from 0.1 to 2.0; it advances `speed x 60` steps per real second and stops at the end. |
| REC-05 | Recording stops by itself 132 steps (2.2 s) after the K.O. so the fall is included, and at a maximum length (default 36,000 steps = 10 minutes). |
| REC-06 | Replay does not change the recording, runs on its own match, and ends with the recorded final hash. |
| REC-07 | A file that parses but does not replay identically is rejected on load with a clear message. |
| REC-08 | Keys: V record on and off, B replay on and off, `[` `]` replay speed while replaying; buttons: Record, Replay, Save, Load, Export video; R, T, 1, 2 are ignored during replay; an indicator shows REC and the replay position. |


### Traceability for iteration 3

| Requirement | Tests |
|---|---|
| REC-01 | `REC-01`; mutation `verification ignores the final hash`; browser smoke (live recording verifies) |
| REC-02 | `REC-02` |
| REC-03 | `REC-03`; mutation `loading accepts any version`; browser smoke (`{bad` rejected) |
| REC-04 | `REC-04`; mutation `replay ignores the speed`; browser smoke (speed 1.0 at start, `[` `]`, live speed untouched) |
| REC-05 | `REC-05` |
| REC-06 | `REC-06` |
| REC-07 | `REC-07`; browser smoke (tampered file rejected with the message) |
| REC-08 | browser smoke (`tests/browser-smoke-rec.js`); video export checked by hand in the browser |

Still out of scope: online play, touch controls, mouse aim, gamepad, dummy mode, slide kick, superman punch, somersault kick, shoulder tackle, axe kick.


### Iteration 4 (found by playing)

| ID | Requirement |
|---|---|
| FLR-07 | In every state, at every kick and punch aim angle, in both phases of a strike and for both facings, a knee flexes only backward (`cross(thigh, shin) x facing >= -0.05`) and an elbow only forward (`cross(upper arm, forearm) x facing <= 0.05`). |

Traceability: FLR-07 is tested by `FLR-07` and by the mutation `knee bend side reversed`.


## 8. Iteration 5: motions must be humanly possible

Measured before this iteration (60 AI fights, 98,660 poses, typical adult limits): elbow bend over 150 degrees in 15 percent of poses, hip bend over 130 degrees in 0.7 percent, knee bend over 145 degrees in 0.2 percent, and hand or foot speed over 2,500 px/s in 1.3 percent of poses (worst 11,735 px/s at a pose change). Scale used: the fighter is about 165 px tall, so about 91 px per metre.

| ID | Requirement |
|---|---|
| ANI-06 | Joint ranges. In every pose the knee flexes at most 145 degrees (solver limit 140), the elbow at most 150 (limit 145), and the hip flexion lies between -35 degrees (leg behind the torso) and 130 (limit 125). Checked on the pose function for every state, aim angle and facing, and on the animated skeleton over 40 AI fights. |
| ANI-07 | Movement speed. In the animated skeleton the hands, feet and head never move faster than 2,500 px/s between two steps (about 27 m/s, a fast kick), in any state, including pose changes, turning round and the fall after a throw. |
| ANI-08 | The animator is presentation only: it never changes the simulation or its hash; after two seconds in the same state the animated pose equals the target pose within 1 px; the first pose after a reset has no lag; the animated skeleton still never goes under the floor or contains a non-number. |


## 9. Iteration 5b: fancy movement in the throw flight and the stand-up

Requested by the user. Each knockdown or throw gives the fallen fighter a **flair** (0, 1 or 2) drawn from the match random generator at the moment of the fall (so it is deterministic and replays identically). The flair picks the style of the flight (after a throw) and of the stand-up. All motions stay inside the human ranges and the speed limit of section 8 (they are authored as joint angles, so the limits hold by construction).

| ID | Requirement |
|---|---|
| FANCY-01 | Flight (state `flipped`), by flair. Flair 0, tuck: at its most tucked both hips and knees are flexed at least 100 degrees. Flair 1, pike and windmill: the straight legs are held in a pike and the arms swing through a shoulder range of at least 100 degrees during the flight. Flair 2, scissor: the two legs differ by at least 60 degrees of hip flexion at some moment. The three flights differ from each other (mean joint-angle difference of at least 15 degrees). |
| FANCY-02 | Stand-up, by flair. Flair 0: the existing kneeling stand-up. Flair 1, kip-up: early on the legs swing overhead (hip flexion at least 120 degrees), the hips spring above standing height (at least 10 px higher) and the fighter ends standing. Flair 2, tornado: the body turns a full circle while rising (horizontal scale reaches -0.9 or less and ends at 1) and ends standing. Every flair ends standing (hip height within 6 px of standing). |
| FANCY-03 | The flair is drawn from the match RNG when a fighter is knocked down or thrown, is reported in the `knockdown` and `throw` events, takes the values 0, 1 and 2 (all three occur in 40 fights), and recordings still verify. |
| FANCY-04 | Every flair, in flight and in the stand-up, satisfies the floor, limb length, joint range, bend direction and continuity checks of sections 3 and 8. |


### Updates made during iteration 5

| ID | Change |
|---|---|
| STY-01 | Health is Boxer 150, Kicker 168, Grappler 188 (was 100, 112, 125). Other style numbers unchanged. |
| ANI-06 | Hip flexion limit is 140 degrees in the solver (test limit 145), not 125; the Kicker's 60 degree kicks need it. |
| FIG-01 (new) | Each figure has a shoulder girdle: two shoulder joints 14 px apart, perpendicular to the torso, centred on the chest; the arms hang from them; the front one is on the facing side. |

Traceability: ANI-06 `ANI-06`, `ANI-06b`; ANI-07 `ANI-07`, `MOT-09`; ANI-08 `ANI-08`; FIG-01 `FIG-01` (+ mutation `no shoulder width`); FANCY-01 `FANCY-01` (+ mutation `flair ignored in the flight`); FANCY-02 `FANCY-02`; FANCY-03 `FANCY-03`; FANCY-04 `FANCY-04`.


## 10. Iteration 6: a punch that looks like a punch, and no K.O. chains after a throw

Reported by the user while playing: "punch motion doesn't look like a punch" and "once thrown it can be chained to a KO, prevent it".

| ID | Requirement |
|---|---|
| PUNCH-01 | For straight, uppercut and overhand punches (aim -30 to 50 degrees, both facings, all styles): (a) at contact the elbow is bent at most 25 degrees (the arm is extended); (b) the hand lies within 8 degrees of the aim direction seen from the front shoulder; (c) at the start of the strike the fist is within 30 px of the head with the elbow bent at least 90 degrees (chamber at the chin); (d) the rear hand stays within 30 px of the head during the whole strike (guard); (e) the front shoulder drives forward by at least 5 px between the start and the contact (torso rotation); (f) the fist path from the chamber to the contact deviates at most 10 px from a straight line; (g) the fist speed peaks in the second half of the extension; (h) during the wind-up the fist stays in front of the chest and within 35 px of the head. Everything stays inside the ranges and speed limit of section 8. |
| CHAIN-01 | Protection window. When a fighter is thrown or knocked down it is protected from the moment it lands until the stand-up ends plus 1.5 s. While protected it cannot be K.O.'d: damage is capped so that it keeps at least 1 hit point. |
| CHAIN-02 | Damage budget. Total damage taken while protected is at most 20 percent of the maximum health; later hits do nothing (the hit shows PROTECTED). A protected fighter is staggered but not knocked down again, so the budget cannot be refilled and one chain has one fall. |
| CHAIN-05 | Protection always ends: it lasts at most the fall (a knockdown lasts at most 3 s), the stand-up (0.85 s) and 1.5 s, so no more than 6.5 s in any fight, also when a hit interrupts the stand-up. |
| CHAIN-03 | A protected fighter cannot be grappled again (`grappleFail`, reason `protected`). |
| CHAIN-04 | Over 100 AI fights, no K.O. happens while the loser is protected, and a scripted attacker that hits a thrown fighter every 0.25 s cannot take more than the budget plus 1 hit point away until the window ends. |


### Updates made during iteration 6

| ID | Change |
|---|---|
| PUNCH-01 | The path limit is 10 px for straight punches and uppercuts and 16 px for the overhand (it loops by nature). |
| Knockdown | A knockdown lasts at most 3 s (was unbounded: up to 5.9 s). |

Traceability: PUNCH-01 `PUNCH-01` (+ mutation `punch does not extend`); PUNCH-02 `PUNCH-02`; CHAIN-01 `CHAIN-01`; CHAIN-02 `CHAIN-02`; CHAIN-03 `CHAIN-03`; CHAIN-04 `CHAIN-04`; CHAIN-05 `CHAIN-05` (+ mutations `protection never starts`, `no damage cap while protected`, `protection placeholder never converted`).


## 11. Iteration 7: choreography (sequences, steps, frames)

Specified in `docs/CHOREOGRAPHY.md` (frame table, sequence graphs, sources). Requested by the user: strikes that chain into sequences that look like a real fight scene, with steps and frames.

| ID | Requirement |
|---|---|
| SEQ-01 | Frame data. Every move in the table has the startup, active and recovery frames of the table at speed 1 (hit lands on the startup frame, the strike state lasts startup plus active frames, the recovery lasts the table value; plus or minus one frame). Strike speed divides startup and active. |
| SEQ-02 | Sequences. For every style and every entry of the sequence graph, pressing punch or kick in the cancel window of the recovery starts the next move of the graph at once, in the strike state, without winding up. |
| SEQ-03 | Window and buffer. A press up to 5 frames before the window opens is buffered and starts the next move when it opens; a press earlier than that during the strike, or after the recovery has ended, does not continue the sequence. |
| SEQ-04 | Footwork. A move advances the body by its lunge during the startup (jab 16 px, plus or minus 3); a sequence advances cumulatively; fighters never pass through each other. |
| SEQ-05 | Hands and mechanics. The jab extends the lead hand and the cross the rear hand (arm bend at most 25 degrees at the contact, the other hand within 30 px of the head); the hook keeps the elbow bent (60 to 110 degrees); the uppercut extends the rear hand upward. |
| SEQ-06 | Active frames. A move whose target is out of reach on the first active frame still hits if the target comes into reach during the active frames; a move that never reaches produces exactly one whiff, at the end of the active frames. |
| SEQ-07 | Grapple cancel. Grapple pressed in the cancel window of the second move of a sequence or later starts the grapple; after the first move it does not. |
| SEQ-08 | The AI uses sequences: over 40 AI fights at least 20 sequences of 3 or more moves, at least 6 different sequences, and one of 4 or more moves. |
| SEQ-09 | Sequences keep the motion limits: over scripted sequences of every style the animated hands, feet and head never move faster than 2,500 px/s, nothing goes under the floor, nothing is not-a-number. |
| SEQ-10 | Each continued move is reported in a `chain` event with the names of the moves so far (for example JAB, CROSS, HOOK) and shown on the screen. |


## 12. Iteration 9: boost, turn, more fighters, speed, help (requested by the user)

| ID | Requirement |
|---|---|
| BOOST-01 | Boost. A boost press with stamina of at least 30, no cooldown and not exhausted spends 30 stamina, starts a boost of 4 s and a cooldown of 12 s (counted from the press). Any other press does nothing (no stamina is spent). Timers never go below 0. |
| BOOST-02 | While boosted, the damage a fighter deals (strikes and throws, and the guard damage of strikes) is 1.5 times the damage of the same hit without the boost. |
| BOOST-03 | Boost and turn are input keys appended to the key list; recordings keep working (an older recording replays identically) and a recording with boost replays identically. |
| BOOST-04 | The AI uses boost only on the Hard level; Normal and Easy never press it, so Normal is unchanged. |
| TURN-01 | Turn. A turn press while idle or guarding flips the facing and locks it for 3 s; while locked the fighter does not turn toward the opponent by itself; after the lock it does. |
| TURN-02 | While the facing is locked a strike can only hit a fighter in front: it never hits an opponent behind the attacker. Without a lock nothing changes. |
| TURN-03 | The touch controller follows the facing: the segments and labels of the attack circles flip when the fighter turns (checked in the browser). |
| MP-01 | A match can have 2 to 4 fighters in teams (1 v 1, 1 v 2, 1 v 3, 2 v 2). A fighter's target is the nearest living enemy (in front if the facing is locked). Allies never hit, grapple or target each other. |
| MP-02 | A fighter at zero health is K.O.'d and stays down; the match ends when every fighter of one team is K.O.'d; the winning team is marked and the match freezes. |
| MP-03 | Matches with 2 fighters behave exactly as before (the same state hashes for the same seeds). |
| MP-04 | Matches with 3 and 4 fighters are deterministic, never produce a non-finite number, and finish within the time limit in at least 90 percent of 30 AI fights per team layout. |
| MP-05 | Recordings carry the teams, replay identically for 3 and 4 fighters, and reject malformed team lists. |
| HELP-01 | The help lists every action: each input key with its keyboard binding and touch control, each move of the frame table with its frames, the sequences of the current style, and the touch gestures. It is built from the same tables the simulation uses, so a new move cannot be missing. |
| SPD-01 | Speed. The default is 1.0 (real time, no slow motion, also at the K.O.); the menu offers 0.25, 0.5, 0.75 and 1; the choice is remembered; the keys [ and ] still change it. |
| MP-07 | The outnumbered side gets a health bonus: half a bar per extra opponent (1 v 2: x1.5, 1 v 3: x2); equal teams get none; the bonus is the real maximum (health is clamped to it, and the protection budget is a fraction of it). |
| MP-08 | The AI survives a change of target: 120 AI fights over three layouts run without an error. |
| OBS-01 | Obstacles (option: off, a few = 2, many = 4). Boxes 30 to 60 px high and 50 to 110 px wide are generated from the match seed (deterministic), inside the arena, clear of the start positions and of each other. Off is the default and changes nothing. |
| OBS-02 | A box is solid from the side: a fighter below its top cannot walk, dash or be pushed into it. |
| OBS-03 | A jump from beside a box (higher than the box) lands on top; the fighter stands there at the height of the box (strikes use that height). |
| OBS-04 | Walking off the edge of a box falls to the ground (or onto the next box). |
| OBS-05 | A box higher than a jump (about 80 px) cannot be climbed. |
| OBS-06 | AI fights with boxes finish (90 percent), nobody is ever inside a box, below the floor or at a non-finite position; the AI jumps when a box blocks its way. |
| OBS-07 | Recordings carry the obstacle level and replay identically; a bad level is rejected. |

## 13. Iteration 10: trainer mode (requested by the user)

A practice mode: a dummy opponent with a choice of behaviour, a list of drills that teach every move, and rules that let you practise without losing.

| ID | Requirement |
|---|---|
| TRN-01 | Training rules (match option `training`): nobody is K.O.'d (a fighter at zero health is refilled and the match goes on), the trainee (fighter 0) never runs out of stamina. A normal match is unchanged. Recording is off in training. |
| TRN-02 | Drills. At least 14. Offence drills count hits of a named move on the dummy (3 hits each); defence and other drills count blocks, parries, throws, boost, turn, dodge from the match events; events of the wrong fighter or the wrong kind do nothing. |
| TRN-03 | The sequence drill is built from the style's own sequence graph (3 or more moves) and counts only the trainee's full chain. |
| TRN-04 | The dummy: stands still, blocks, attacks slowly (easy AI) or plays like the normal AI; chosen in the menu, and set by the drill that needs it. |
| TRN-05 | Progress: drills in order, each needs its target count; skip and restart; progress is shown on the screen with the hint for the keyboard and touch. |

## 14. Iteration 10b: strike angle and the tutorial (requested by the user)

| ID | Requirement |
|---|---|
| TUT-01 | The angle of a punch matches the hand control, standing or crouched. Crouching with the aim down is an overhand pointing down; crouching with a level aim is still the uppercut; the aim is never lowered below what the control says. (User: crouched overhand pointed up.) |
| TUT-02 | Through the simulation: crouch plus aim down lands low; crouch alone is the uppercut. |
| TUT-03 | On touch the stroke angle is the aim: a level stroke hits the body, up and forward hits the head, a steep downward stroke is the overhand. |
| TUT-04 | A fixed dummy neither moves nor reacts (position, state, velocity) however hard it is hit, and still takes damage and reports hits. |
| TUT-05 | Tutorial rules (match option `tutorial`, with the training rules): the trainee stands planted (no walking, jumping, crouching, kicking, blocking, lunge or foot movement), the aim turns fast (360 degrees per second), and every punch reports a `swing` event with its angle and strength. A normal match reports none. |
| TUT-06 | The punch lesson (7 steps: straight ahead, up, down, steep, any angle, speed, strength): a target is a semi-transparent circle at a set angle (10 degrees of tolerance); a swing within it counts; a miss says how many degrees too high or low; speed targets expire after 1.5 s; strength targets need a light (0.9 or less) or heavy (1.3 or more) punch. There is no opponent on the screen, only the targets, the dashed line at the angle to punch, and a solid line at the aim now. |
| TUT-07 | On touch, in the tutorial, one line drawn across the hand circle is a punch at the angle of the line over the whole range (up to 55 degrees up and 45 down); its length and speed give the strength; backward lines and the leg circle do nothing. |

## 15. Requirements added by the QA audit (the tests existed; the rows did not)

| ID | Requirement |
|---|---|
| CTL-01 | A forward stroke commits to a straight move early (within 60 ms), before the finger lifts. |
| CTL-02 | Forward follows the facing: a stroke away from the facing is drawn back, toward it is forward. |
| CTL-03 | Up and down strokes: uppercut / rising kick and overhand / low kick. |
| CTL-04 | A curved stroke is a hook / roundhouse; the early commit is only a provisional straight move. |
| CTL-05 | A punch that returns to its start is a punch, not a grapple (the stroke is cut at its farthest point). |
| CTL-06 | A grapple needs a deliberate back-draw (9 mm or more, straight) and does not commit early. |
| CTL-07 | Jitter and the sampling rate (60, 120, 240 Hz, 0.4 mm noise) do not change the result. |
| CTL-08 | Quick is short and fast, heavy is long and slow; power grows with the length. |
| CTL-09 | A tap is a quick poke and does not commit while the finger is down. |
| CTL-10 | The decoder is pure: the same stroke, the same answer; the input is not changed. |
| CTL-11 | Noise at a high sampling rate does not inflate the speed; a bent back-draw is not a grapple. |
| CTL-12 | A fast stroke commits within 20 ms of leaving the touch-down point; a 1.7 mm wobble does not commit. |
| CTL-13 | Early tier: a slow stroke is tentatively heavy, a fast one is not, and the final decision corrects a slow short one. |
| TCH-01 | Every stroke ends in the move it names, through the touch plan and the real simulation (wind-up from touch-down). |
| TCH-02 | A back-draw gives a grapple with the hand and with the leg at three speeds. |
| TCH-03 | A tap is a quick poke and no stray strike follows. |
| TCH-04 | A finger that vanishes without a lift event does not leave the wind-up held. |
| TCH-05 | A grab cancels a wind-up under 0.3 s old, but not one that is further on. |
| DIFF-01 | Normal level changes nothing (levels [1,1] play exactly like no levels). |
| DIFF-02 | A hard AI beats an easy one at least 65 percent of the time, on either side. |
| DIFF-03 | The level is part of the recording and replays identically. |
| DIFF-04 | Levels outside 0 to 2 are clamped, never crash. |
| FIG-01 | The figure keeps its shoulder girdle and limb lengths in every pose. |
| PUNCH-02 | A punch keeps a guard hand and a chamber at the chin. |
| FLR-02b | The floor rule also holds for the displayed (animated) skeleton. |
| BR-04 | The touch overlay is transparent and the arena shows through it (DEF-024). |
| BR-05 | Every menu choice applies: players, obstacles, level, speed, training, tutorial. |
| BR-06 | The help lists every input key (browser). |
| BR-07 | The touch buttons drive the simulation: boost, turn, block (browser). |
| BR-08 | The page raises no errors during these actions. |
| BR-02 | F1 opens the help panel (browser). |
| BR-03 | No non-numeric value appears in the live match (browser). |
| BR-09 | Random menu choices (200, one field at a time) keep the page consistent: one mode entry per fighter, the chosen mode survives unless the layout forces it, and the player is never lost (browser). |

## 16. Iteration 11: the GUI comparison, all eight improvements, and the action catalogue (requested by the user)

| ID | Requirement |
|---|---|
| SET-01 | Settings (hand, size 0.7 to 1.4, opacity 0.3 to 1, floating stick, back-block, tap-to-jab, TURN button, palette, haptics, hit-stop, HUD scale, intro seen) have defaults, are validated and clamped, unknown keys are dropped and wrong types fall back to the default. |
| SET-02 | Settings are saved and loaded through the browser storage; broken or missing data gives the defaults; a storage that throws never breaks the page. |
| SET-03 | A colour-blind safe palette exists; its team and bar colours are all clearly distinct, with enough colours for four fighters. |
| ONB-01 | The first run offers the tutorial once; it is not offered again after it has been seen or skipped. |
| LAY-01 | The default right-handed layout is the layout of iteration 9 (attack circles stacked at the right, move circle at the left, BLOCK / TURN / BOOST on an arc to its right). |
| LAY-02 | Left-handed mode mirrors the layout (x becomes W - x) and swaps the stage columns; the buttons face the stage. |
| LAY-03 | At every size and on small screens, nothing leaves the screen or overlaps; the three buttons are at least 17 px in radius at size 1 or more. |
| LAY-04 | A touch means: a button, a circle, the stick half, or (when allowed) a jab zone on the rest of the attack half; the TURN button can be hidden. |
| BKB-01 | With back-block on, holding the stick away from the opponent blocks and walks back; never forward, up or down; off by default. |
| TAP-01 | A tap anywhere on the attack half (outside the circles) is a jab; a line drawn there punches at its angle like the hand circle (browser: BR-14). |
| FBK-01 | Feedback is derived from the events: a landed hit stops the picture briefly (at most 250 ms, longer for bigger hits), a hit taken buzzes, a block or parry buzzes lightly with its own pattern, a K.O. pauses, nothing for other fighters or misses. It is presentation only and never changes the simulation. |
| HUD-01 | The bars are labelled (HEALTH, STAMINA, GUARD, BALANCE), larger on request, and the colour-blind palette applies to fighters and bars (browser: BR-10). |
| MNU-01 | One panel offers Quick play (the last choices, one tap), Settings, Help and the Actions catalogue; a pause menu opens from the screen and from the Escape key and stops the match while open (browser: BR-11, BR-12). |
| PWA-01 | The game installs and runs offline: web manifest (landscape, standalone), icons of 192 and 512 pixels, a service worker, and a local copy of the 3D library. |
| PWA-02 | The service worker caches every file the page needs, with a versioned cache name. |
| ACT-01 | The catalogue lists every move of the frame table, every input key and the special states, each with three preview poses that are finite points above the floor. |
| ACT-02 | The previews are meaningful: the start, the contact and the recovery of a move differ; a stand is the same in all three. |
| ACT-03 | The page `docs/ACTIONS.html` is generated from the game's own pose engine and is up to date (a test regenerates it and compares). |
| BR-10 | The labelled HUD and the palette setting draw without errors (browser). |
| BR-11 | Quick play starts a round with the saved choices (browser). |
| BR-12 | The pause menu opens, pauses the match and resumes (browser). |
| BR-13 | The first-run prompt appears once (browser). |
| BR-14 | A tap on the jab zone punches; the settings change the layout (browser). |
| BR-15 | While down, key W starts the kip-up and the match goes on (browser). |
| PWA-03 | The service worker parses and behaves: install caches the assets, activate deletes old caches, the page comes from the network and falls back to the cache offline, other files come from the cache (tested in a fake worker environment; a real worker needs https or localhost). |
\n| ACT-04 | Different moves look different: the contact poses of any two moves differ by at least 4 px (RMS over all joints, hip-relative; a spin squeeze counts), except pairs listed with a reason. The catalogue also shows what a still pose cannot: the path of the striking limb, a highlight on it, the aim angle, a timing bar and the numbers (DEF-032). |\n

## 17. Iteration 12: flashy moves instead of look-alikes (requested by the user)

The user asked for completely different, flashy actions in place of the similar ones: a flying kick, a round kick, a butterfly kick. Decisions: the HEAVY KICK becomes the AXE KICK, the HEAVY PUNCH becomes the SPINNING BACKFIST, the JUMP PUNCH becomes the SUPERMAN PUNCH; two new aerial kicks (BUTTERFLY KICK, TORNADO KICK); the FLYING SIDE KICK gets a horizontal body. The round kick is the ROUNDHOUSE (already there). The rules (frames, damage kinds) are reused, so the balance is unchanged.

| ID | Requirement |
|---|---|
| FLASH-01 | The move table has SUPERMAN PUNCH (air punch), BUTTERFLY KICK and TORNADO KICK (air kicks), AXE KICK (ground kick), SPINNING BACKFIST (ground punch) and FLYING SIDE KICK, each with a look of its own and frame data; HEAVY KICK, HEAVY PUNCH and JUMP PUNCH are gone; every look belongs to one move. |
| FLASH-02 | Choice: a long punch hold is the spinning backfist; a long kick hold is the axe kick (the Kicker keeps the spinning kick); in the air a punch is the superman punch (aim up: the leaping uppercut); a kick is the flying kick, with the aim up the butterfly kick, with a hold of 0.3 s or more the tornado kick. |
| FLASH-03 | The poses of the new moves are legal at every step: finite, above the floor, bones at their lengths (1.5 px), and the animated end points never faster than 2,500 px/s, for two styles. |
| FLASH-04 | Each new move can be thrown with the inputs a player has (hold, or jump then tap, aim up or hold). |
| FLASH-05 | The AI throws the new moves: over 100 AI fights at least five of the six are used (after a jump it picks the flying kick, the butterfly kick, the tornado kick or the superman punch). |
| ACT-04 | (see section 16) the look-alike check keeps all of them apart in the catalogue. |

## 18. Iteration 13: getting up on purpose (requested by the user)

The fighter on the floor chooses how to get up with the move circle (keyboard W A S D), after a short wait. Choices, with starting values to tune: up = kip-up (0.5 s, 25 stamina, open for the last 0.3 s), forward = forward roll to stand (0.8 s, 15 stamina, moves 70 px toward the opponent), back = back roll (0.8 s, 15 stamina, moves 90 px away, safe for 0.5 s), down = stay and guard (1.4 s, free, refills stamina at the full rate, safe for 0.8 s). No choice: the old automatic stand-up. A break-fall tap just after landing, or in the last 0.25 s of a throw, shortens the fall by a third and softens a throw by 30 percent.

| ID | Requirement |
|---|---|
| RCV-01 | Choosing: the four directions (relative to the facing) start the four recoveries; not before 0.3 s on the floor; not without the stamina (staying and guarding is free); a fighter who is out cannot choose; the stamina is spent. |
| RCV-02 | Durations: kip-up 0.5 s, rolls 0.8 s, guard 1.4 s; the automatic stand-up is unchanged (0.85 s). |
| RCV-03 | Vulnerability: the kip-up is open after 0.2 s, the back roll is safe for 0.5 s, the guard stand-up for 0.8 s. |
| RCV-04 | The rolls move the body (forward 70 px toward the opponent, back 90 px away); the arena edge and boxes are respected. |
| RCV-05 | Staying and guarding refills stamina faster than lying or the automatic stand-up. |
| RCV-06 | Break-fall: a tap within 0.15 s of landing, or in the last 0.25 s of a throw, shortens the fall by a third and softens a throw by 30 percent; once per fall; a late or an early tap does nothing. |
| RCV-07 | Protection and the K.O. are unchanged: a recovering fighter cannot be K.O.'d; the loser of the match stays down. |
| RCV-08 | Recordings with chosen recoveries replay identically. |
| RCV-09 | The AI chooses recoveries too (at least three kinds over 60 fights) and no impossible state appears. |
| RCV-10 | The poses of every recovery are legal at every step (finite, above the floor, bones at their lengths, end points at most 2,500 px/s), facing both ways. |
| RCV-11 | The automatic stand-up is unchanged for a fall nobody steers. |
| RCV-12 | The screen shows the choices while you are down (a small wheel with the four recoveries and their stamina cost, a TAP ring in the break-fall window), on the stage and on the touch move circle (browser: BR-15). |
| RCV-13 | The rolls turn the body over once (forward and back in opposite directions, ending standing); the kip-up ends standing; the guard stand-up never goes upside down. |
| RCV-14 | Two drills teach it (choose a recovery; break a fall), completed only by the trainee's own events. |

