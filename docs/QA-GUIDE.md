# How to Build Quality Software

A practical guide to the main steps, from the first idea to long-term maintenance. It uses examples from the Slow Fist stick-fighting game in this folder where they help.

## 1. What "quality" means

Quality is not one thing. Decide up front which of these matter most for your product, because they pull against each other.

| Attribute | Question it answers |
|---|---|
| Correctness | Does it do what it is supposed to do? |
| Reliability | Does it keep working over time, with bad input, and after failures? |
| Usability | Can the intended people use it without friction or confusion? |
| Performance | Is it fast enough, and does it stay smooth under load? |
| Security | Does it protect data and resist misuse? |
| Maintainability | Can a new person understand and change it safely? |
| Portability | Does it work on the devices and platforms people actually use? |
| Feel (for games and consumer apps) | Does it feel right, not just work? |

**Step zero:** write down the top three attributes for this product and what "good enough" means for each, as a number or a test. "Fast" is a wish; "a fight frame renders in under 16 ms on a mid-range phone" is a requirement.

## 2. The overall process

```
Idea -> Requirements -> Architecture -> Design -> Build -> Test -> Release -> Operate -> Improve
          ^                                                  |                          |
          +--------------- feedback loops -------------------+--------------------------+
```

The order is a guide, not a waterfall. Short loops (build a little, test it, show it, adjust) catch problems when they are cheap. Every step below has a quality gate: a question that must be answered "yes" before moving on.

## 3. Requirements and vision

**Do**

- Write a one-paragraph vision: who it is for, what problem it solves, what it is not.
- List user goals first, features second. A feature without a goal is a guess.
- Turn each requirement into something checkable: an example, a number, or an acceptance test ("When a guard is raised less than 0.25 s before impact at the right angle, the hit is a parry").
- Record non-functional requirements (speed, security, accessibility, platforms) with the same care as features.
- Mark what is deliberately out of scope.
- Keep a short list of open questions and assumptions, and resolve them early.

**Gate:** can someone who did not write the requirements decide, without asking, whether a given behaviour is right or wrong?

**Common failure:** vague goals ("make it fun") that cannot be tested. Break them into observable parts (reaction time, readability of attacks, variety of moves).

## 4. Architecture and design

Architecture is the set of decisions that are expensive to change later. Make them deliberately, write them down, and revisit them when facts change.

**Do**

1. **Choose the shape.** Single file or modules? Monolith or services? Client only or client plus server? Pick the simplest thing that meets the requirements; add complexity only when a requirement forces it. (Slow Fist is a single HTML file on purpose: no build step, trivial to share and run.)
2. **Separate concerns.** Keep rules (simulation), presentation (drawing), input, and networking apart so each can change and be tested alone. In Slow Fist the simulation (`update`) is separate from the visual state (`animate`) and drawing (`drawFighter`).
3. **Define boundaries and contracts.** Decide what each part promises to the others: inputs, outputs, units, ranges, error behaviour. Write down invariants that must always hold (for example "a fighter's height is never negative outside a flip").
4. **Make state explicit.** Name the states and the allowed transitions (a state machine) instead of scattering flags. List what data is the source of truth and what is derived.
5. **Plan for failure.** What happens when input is missing, a connection drops, a number goes NaN, or time jumps? Decide, then handle it in one place.
6. **Design for testing.** Prefer pure functions and injectable time, randomness and input, so tests can run the logic without a real clock or screen.
7. **Keep data-driven rules in tables.** Tunable values (damage multipliers, timings) belong in named constants or tables, not buried in code, so they can be reviewed and balanced.
8. **Record decisions.** Keep short Architecture Decision Records: context, decision, alternatives considered, consequences.
9. **Review the design before building.** A 30-minute review by someone else catches expensive mistakes.

**Useful diagrams:** a context diagram (system and its surroundings), a component diagram, a state machine for the core object, and a sequence diagram for the trickiest interaction.

**Gate:** can you explain how a typical request or frame flows through the system in five minutes, and name the three riskiest assumptions?

## 5. Build practices

- **Small steps.** Change one thing, run it, then change the next. Large untested changes hide their own bugs.
- **Version control.** Commit often with messages that say why. If a folder is not under version control, keep dated backups before every risky change (Slow Fist keeps `index.before-<topic>.html` copies).
- **Coding standards.** Agree on naming, formatting, comment style and file layout, and enforce them with a formatter and linter, not with willpower.
- **Readable code.** Names that say what things mean, short functions that do one thing, comments that explain *why*, not what.
- **No hidden constants.** Name magic numbers and keep units in the name (`GRAB_LOCK_SECONDS`).
- **Guard the invariants.** Add assertions or clamps for the rules that must never break, and log loudly when one trips.
- **Beware silent failures.** A swallowed error is worse than a crash. (A real example from this project: a comment placed in the middle of a line silently disabled the reset statements after it, which left fighters sunk below the floor. Linting, code review and an invariant check would each have caught it.)
- **Code review.** Every change gets a second pair of eyes, or at least a self-review the next day. Review for correctness, clarity, tests, and risk, not style nitpicks.
- **Definition of done.** A task is done only when it is built, tested, reviewed, documented where needed, and merged to the main line.

## 6. Quality assurance (QA)

QA is the whole system that prevents defects. Testing is one part of it.

**Prevent**

- Clear requirements and design reviews (steps 3 and 4).
- Coding standards, linters, static analysis, type checking.
- Code review and pair work on risky parts.
- Automated checks on every change (continuous integration).

**Detect**

- Automated and manual testing (step 7).
- Monitoring and error reports from real use.
- Regular exploratory sessions where a person tries to break it.

**Correct and learn**

- Every defect gets a short root-cause note: what happened, why it slipped through, what stops it next time.
- Add a regression test for each fixed bug.
- Track a few honest metrics: defects found per release, how many reach users, time to fix, test pass rate, flaky tests.

**A QA plan should state:** scope, quality goals (from step 1), test types and who runs them, environments and devices, entry and exit criteria for each release, how bugs are triaged (severity and priority), and who signs off.

**Severity guide**

| Level | Meaning | Example |
|---|---|---|
| Critical | Data loss, crash, security hole, blocks everything | Game freezes at start |
| Major | Core feature broken, no workaround | Characters sink through the floor |
| Minor | Feature works but wrongly, workaround exists | A label shows the wrong move name |
| Trivial | Cosmetic | A misaligned bar |

## 7. Testing

Test at several levels. Each catches different problems, and the cheap ones should be most numerous (the "test pyramid").

| Level | What it checks | Speed | How many |
|---|---|---|---|
| Static checks | Syntax, types, style, obvious bugs | Seconds | Always on |
| Unit tests | One function or rule in isolation | Milliseconds | Many |
| Integration tests | Parts working together | Seconds | Some |
| System / end-to-end tests | Whole product through its real interface | Minutes | Few |
| Acceptance tests | Does it meet the stated requirements? | Minutes to hours | One per requirement |
| Exploratory testing | A human looks for what nobody predicted | Hours | Regularly |

**Other test types to plan for**

- **Regression:** re-run old tests to be sure fixes and features did not break earlier behaviour.
- **Property and invariant tests:** assert rules that must always hold, over thousands of random runs (for example "over 300 AI fights, no fighter is below the floor and none acts after a knockout").
- **Simulation and soak tests:** run the system unattended for a long time to find leaks, stalls and rare states (for example AI vs AI fights that never end).
- **Performance tests:** measure speed and memory against the numbers in your requirements.
- **Compatibility tests:** the browsers, devices, screen sizes, and input methods real users have.
- **Security tests:** input validation, authentication, dependency vulnerabilities, secrets handling.
- **Usability tests:** watch real users try real tasks; note where they hesitate.
- **Accessibility tests:** keyboard-only use, contrast, screen-reader support, motion sensitivity.
- **Failure tests:** disconnect the network, send garbage input, pause and resume, make the clock jump.

**Writing good tests**

1. Name the behaviour, not the function ("a parry staggers the attacker").
2. Arrange, act, assert: set up the situation, do one thing, check the result.
3. One reason to fail per test.
4. Independent: no test depends on another's leftovers (shared mutable data caused false failures in this project until tests reloaded the page).
5. Deterministic: control randomness and time, or run enough repetitions and judge by a rate.
6. Fast and automated, so people run them without thinking.
7. Test the edges: zero, one, maximum, just over the limit, empty, null, simultaneous events.
8. When a bug is found, write the failing test first, then fix it.

**Test data and environments:** keep test data in version control, never use real personal data, and keep a test environment that matches production closely.

**Measuring tests:** coverage shows what was *not* tested, not that the rest is right. Use it to find gaps, not as a target to game.

**Gate (release):** all automated tests pass, no open critical or major defects, the acceptance tests for the release are met, and exploratory testing found nothing alarming.

## 8. User experience and "feel"

Many products fail with no bugs at all, simply by being unpleasant to use.

- Define the experience in observable terms (response time, clarity of feedback, how long to learn).
- Prototype early and put it in front of real users; watch silently, do not explain.
- Give clear feedback for every action (sound, motion, text), and show system status.
- Make errors recoverable and messages human.
- For real-time and game systems, tune with data and playtests: log outcomes, look at win rates, variety of actions used and time to finish, then adjust numbers deliberately.
- Do not rely on only your own judgement; the author is the worst tester of their own product.

## 9. Security and privacy (build in, do not bolt on)

- Threat-model early: what is valuable, who might attack, how.
- Validate all input at the boundary; never trust the client in a multiplayer game.
- Least privilege for every component and key.
- Keep secrets out of source control.
- Keep dependencies few, pinned, and updated; scan them for known vulnerabilities.
- Collect the minimum personal data and say what you do with it.
- Plan how to learn about, fix and announce a vulnerability.

## 10. Performance and reliability

- Set budgets (frame time, load time, memory) and measure against them on the slowest supported device.
- Profile before optimising; fix the measured bottleneck, not the suspected one.
- Handle bad conditions: slow networks, large inputs, low battery, background tabs, unexpected time steps.
- Add timeouts, retries with limits, and sensible fallbacks.
- Make failures visible: logs, error reports, and health checks.

## 11. Documentation

Document what is hard to rediscover.

| Document | Audience | Content |
|---|---|---|
| Vision and requirements | Everyone | What and why |
| Specification | Builders and testers | Exact rules, numbers, controls |
| Architecture and decisions | Builders | Structure, why, alternatives |
| User guide / help | Users | How to use it |
| Test plan and results | QA and managers | What was tested, what was found |
| Runbook | Operators | How to deploy, monitor, recover |
| Changelog | Everyone | What changed in each version |

Keep documents next to the code, review them with the code, and delete what is no longer true. A wrong document is worse than none.

## 12. Release and delivery

- **Automate the pipeline:** build, check, test, package, deploy, with the same steps every time.
- **Version numbers** that mean something (major.minor.patch).
- **Release checklist:** tests green, changelog written, backups taken, rollback plan ready, owners informed.
- **Staged rollout:** internal, then a small group, then everyone; use feature flags to turn things off quickly.
- **Rollback:** know in advance how to go back, and rehearse it.
- **Cache and compatibility:** think about users with old versions or cached files (a hard refresh or a version query string is a stop-gap, not a plan).

## 13. Operate, monitor, and improve

- Monitor errors, performance and real usage; alert on what matters, not on everything.
- Triage incoming reports quickly and acknowledge them.
- After any serious problem, hold a blameless review: timeline, causes, fixes, prevention.
- Schedule regular maintenance: dependency updates, removing dead code, paying down known technical debt.
- Use feedback and data to decide what to build next; retire features nobody uses.

## 14. People and process

- Small, clear ownership: every area has a named owner and a backup.
- Short feedback loops: demo every week or two.
- Psychological safety: people report problems early when it is safe to do so.
- Estimate honestly, track the real cost of rework, and treat repeated bugs as a process problem, not a people problem.
- Keep learning: read other people's code, study incident reports, and share lessons.

## 15. Quality gates summary

| Stage | Question to answer "yes" before moving on |
|---|---|
| Requirements | Can anyone decide right or wrong without asking? |
| Architecture | Can it be explained in five minutes, with the risks named? |
| Build | Is each change small, reviewed, and tested? |
| Test | Do all levels pass, with no open critical or major defects? |
| Release | Is there a rollback plan, and have the users been told? |
| Operate | Will we hear about problems before the users complain? |

## 16. A starter checklist

Copy this into a new project.

- [ ] One-paragraph vision and the top three quality attributes, with numbers
- [ ] Requirements as testable examples; out-of-scope list
- [ ] Architecture sketch, state machine, invariants, and decision records
- [ ] Version control (or dated backups) and a branching rule
- [ ] Formatter, linter, and type or static checks running automatically
- [ ] Unit, integration and end-to-end tests; invariant and soak tests for core rules
- [ ] Regression test added for every fixed bug
- [ ] Code review for every change
- [ ] Performance budgets measured on the slowest target device
- [ ] Threat model and dependency scanning
- [ ] User testing with at least five real people before release
- [ ] User guide, specification, and changelog
- [ ] Automated release with a tested rollback
- [ ] Monitoring, error reporting, and a blameless review habit

## 17. Lessons from the Slow Fist project

Concrete examples of the points above:

1. **Invariants catch what eyes miss.** "No body part below the floor" was easy to state and to measure by script. It found real bugs a quick look had not.
2. **A tiny syntax slip can look like a design bug.** A comment in the middle of a line disabled later statements and made fighters sink. Automated linting and a post-change regression run would have flagged it at once.
3. **Tests must not pollute each other.** Shared style objects changed by one test (for example a hit-point value) distorted later fights. Reload or reset shared state between tests.
4. **Measure, do not guess.** Balance, AI variety and fight length were checked by running hundreds of simulated fights and counting moves, not by feel alone. The same measurement exposed that the AI never used some moves.
5. **Write the spec from the code, then check the spec against the code.** The first draft of the spec contained several wrong statements; a line-by-line comparison fixed them. Treat documentation as something to be verified.
6. **Keep backups before risky changes.** Dated copies made it safe to experiment.
7. **Test the environment limits.** Very large test runs crashed the browser tool; small batches were reliable. Design tests that run in small, repeatable pieces.
8. **Rare problems need many runs.** A 40-second stalemate appeared once in 21 fights, and a few-pixel floor clipping once in 18,000 frames. Rare issues need soak tests and good logging so they can be reproduced.

## 18. Further reading

- *Clean Code* and *The Pragmatic Programmer* (code and craft)
- *Code Complete* (construction practice)
- *Designing Data-Intensive Applications* (architecture for data systems)
- *Release It!* (stability and failure patterns)
- *Accelerate* (delivery metrics and practices)
- *The Art of Software Testing* and *Explore It!* (testing)
- *Don't Make Me Think* and *The Design of Everyday Things* (usability)
- OWASP Top 10 and ASVS (security)
- ISO/IEC 25010 (a standard model of software quality attributes)

---

# Appendices: templates and worked examples

Everything below can be copied into a project and filled in. Examples use the Slow Fist game.

## A. Vision and quality-goals template

```
Product:            <name>
For:                <who uses it>
Problem it solves:  <one sentence>
It is NOT:          <what is out of scope>

Top quality attributes and targets
1. <attribute>  Target: <measurable>   How measured: <test or tool>
2. ...
3. ...

Assumptions to check:   <list>
Open questions:         <list>
```

**Example (Slow Fist)**

```
Product:            Slow Fist
For:                Two players on one keyboard, online friends, or one player vs AI; phone players by touch
Problem it solves:  A stick-figure duel where reading the opponent and planning a counter matters more than button speed
It is NOT:          A turn-based game, a rock-paper-scissors game, or a button masher

1. Correctness of physics   Target: no body part below the floor line outside a flip   Measured: per-frame invariant check over 300 AI fights
2. Readability              Target: a wind-up is visible before impact at the default speed   Measured: timing in the move table, playtest
3. Variety                  Target: AI uses at least 12 different moves across 10 fights   Measured: move counts logged in a soak run
```

## B. Requirement template (testable)

```
ID:            REQ-<area>-<number>
Statement:     The system shall <behaviour> when <condition>.
Rationale:     <why it matters>
Acceptance:    Given <state>, when <action>, then <observable result>.
Priority:      Must / Should / Could
Test:          <test id or description>
```

**Examples**

| ID | Statement | Acceptance |
|---|---|---|
| REQ-GUARD-01 | A guard raised less than 0.25 s before impact, within the angle tolerance, shall parry. | Given a guard held 0.1 s with aim within tolerance, when a punch lands, then damage is 0, the attacker staggers 0.8 s and the defender gets a 1.2 s counter window. |
| REQ-FLOOR-01 | No fighter body part shall be drawn below the floor line outside a flip. | Given any state in 300 AI fights, then the lowest body point is no more than 5 px below the floor. |
| REQ-KO-01 | After a K.O. neither fighter shall attack or travel. | Given a winner is set, then for the next 90 frames the loser's x moves less than 150 px and its state is never `strike`. |
| REQ-GRAP-01 | A grapple shall fail against a crouching, dashing, or fast-retreating target. | Given the target is crouching, when grapple is pressed in range, then the message is "ducked" and no throw occurs. |

## C. Architecture overview template

```
1. Context          Who and what the system talks to
2. Components       Name, responsibility, owner, what it must never do
3. Data             Source of truth for each kind of state; derived data
4. Key flows        The 3 to 5 most important sequences (input -> result)
5. State machines   States, transitions, forbidden transitions
6. Invariants       Rules that must always hold, and where they are checked
7. Failure handling What happens on bad input, lost connection, time jumps
8. Quality targets  Performance, security, compatibility
9. Risks            Top risks, with a plan for each
10. Decisions       Links to the decision records
```

**Example: Slow Fist components**

| Component | Responsibility | Must never |
|---|---|---|
| Input | Turn keys, touch or AI into one input record per fighter | Change game state directly |
| Simulation (`update`) | Apply rules, physics, combat, cooldowns | Draw anything |
| Animation (`animate`) | Turn simulation state into smooth visual state | Change who wins |
| Renderer (`drawFighter`, `draw`) | Draw the fighters and effects | Move a fighter |
| AI (`aiThink`) | Choose inputs from the situation | Bypass cooldowns or physics |
| Recorder | Store snapshots and events | Alter live state |
| Network | Send inputs, receive snapshots | Run its own copy of the rules (the host is authoritative) |

**Example state machine (fighter):** `idle -> charge -> strike -> recover -> idle`; `idle -> guard`; `idle -> grab -> grapple -> idle`; any hit `-> stagger` or `-> down -> getup -> idle`; a thrown fighter `idle -> flipped -> down`. Forbidden: `down -> strike`, `flipped -> charge`, any attack after a winner is set.

## D. Architecture decision record (ADR) template

```
Title:          ADR-<number>: <decision>
Date / status:  <date>, proposed / accepted / superseded by ADR-<n>
Context:        <forces and facts that led here>
Decision:       <what we will do>
Alternatives:   <what else we considered, and why not>
Consequences:   <good, bad, and what we must now watch>
```

**Examples**

```
ADR-001: Keep the game in a single HTML file
Status: accepted
Context: One developer, no build tooling, wants to share by copying a file or serving a folder.
Decision: All code, styles and help text live in index.html.
Alternatives: Separate modules with a bundler (more tooling, slower to share); a framework (heavy for a canvas game).
Consequences: Easy to run and back up. The file keeps growing and is harder to navigate, so we keep named sections and a spec, and revisit splitting at a larger size.
```

```
ADR-002: Host-authoritative online play with copy/paste signaling
Status: accepted
Context: No budget for a game server; friends play occasionally.
Decision: One player hosts the simulation; the other sends inputs and draws snapshots. WebRTC with manual code exchange.
Alternatives: Lockstep (needs identical floating-point behaviour on both sides); a relay server (cost and upkeep).
Consequences: The guest sees some lag and depends on the host's speed. No cheating protection against the host.
```

## E. Definition of Ready and Definition of Done

**Ready (a task can be started)**

- [ ] The goal and acceptance example are written
- [ ] Dependencies and risks are known
- [ ] It can be finished in a day or two; if not, split it

**Done (a task can be closed)**

- [ ] Built and runs on the target devices
- [ ] Tests written or updated; all automated tests pass
- [ ] Invariant and regression checks pass
- [ ] Reviewed by someone else (or self-reviewed after a break)
- [ ] Spec, help text and changelog updated
- [ ] A backup or tag exists for easy rollback
- [ ] No new warnings from the linter

## F. Test plan template

```
Release / version:        <id>
Scope (in / out):         <list>
Quality goals:            <from the vision>
Test levels and owners:   <unit, integration, system, acceptance, exploratory>
Environments / devices:   <list>
Test data:                <where it lives, how it is reset>
Entry criteria:           <build is stable, tests exist>
Exit criteria:            <all must-pass tests green, no open critical or major bugs>
Risks and mitigations:    <list>
Schedule:                 <dates>
Reporting:                <where results go>
```

## G. Test case template and worked cases

```
ID:            TC-<area>-<number>
Title:         <behaviour under test>
Preconditions: <state before>
Steps:         1. ... 2. ...
Expected:      <observable result>
Type:          automated / manual
Links:         <requirement ids>
```

| ID | Title | Steps | Expected |
|---|---|---|---|
| TC-GUARD-01 | Parry window | Raise guard at the incoming strike angle 0.1 s before impact. | PARRY banner, attacker staggers, defender counter window set. |
| TC-GUARD-02 | Late guard blocks only | Hold guard at the right angle for more than 0.25 s before impact. | BLOCK, 10 percent damage, small push. |
| TC-GUARD-03 | Wrong angle hits | Guard well outside twice the tolerance of the strike angle. | Full HIT, no block. |
| TC-GRAP-01 | Grapple range | Press grapple at 100 px with a Boxer. | "whiffs", no state change. |
| TC-GRAP-02 | Throw lands on the floor | Perform a full throw. | Victim ends in `down` with height 0 and rotation 0; no part below the floor. |
| TC-MOVE-01 | Superman punch needs speed | Jump with no forward speed and punch. | JUMP PUNCH, not SUPERMAN PUNCH. |
| TC-MOVE-02 | Spinning kick is Kicker only | Hold kick 0.5 s with a Boxer. | HEAVY KICK. |
| TC-KO-01 | No action after K.O. | Reduce HP to 0, wait 90 frames. | Loser stays still; no `strike` state for either fighter. |
| TC-STAM-01 | Exhaustion | Drain stamina to 0. | EXHAUSTED; no strikes or jumps until stamina is 30. |
| TC-DASH-01 | Dash dodge | Dash during the last 0.2 s of an incoming strike. | DODGE banner, counter window, +8 stamina. |
| TC-TOUCH-01 | Backward stroke ignored | Draw a stroke that moves away from the opponent. | No strike. |
| TC-NET-01 | Disconnect | Close the data channel mid-fight. | Game returns to two-player mode and resets. |

## H. Automated test recipes

**Invariant sweep (run 300 AI fights, check every frame)**

1. Stub the animation frame function so you control time.
2. Step the game one fixed time step at a time.
3. After each step assert: no fighter height below 0 outside `flipped`; no NaN positions; state is in the allowed list; after a winner is set, no `strike` state.
4. Count and report violations; fail the run if the count is not zero.

**Draw sweep (visual floor check)**

1. Wrap the canvas drawing calls to record each point in world coordinates.
2. Draw only the body, not effects.
3. Fail if any point is more than 5 px below the floor line.

**Soak and variety run**

1. Run 100 fights with random matchups and fixed settings.
2. Record winner, length, moves used, grapples, knockdowns.
3. Report: fights without a winner, win rate per style, moves never used.
4. Review the report after every balance change.

**Regression habit:** keep these scripts in a `tests` folder next to the game, run them before every release, and add a new check for every bug fixed. (Today the scripts live only in session notes; moving them into a `tests` folder is a to-do.)

## I. Bug report template

```
Title:        <short, specific>
Severity:     Critical / Major / Minor / Trivial
Version:      <build or file date>
Environment:  <browser, device, input method>
Steps:        1. ... 2. ... 3. ...
Expected:     <what should happen>
Actual:       <what happened>   Evidence: <screenshot, log, recording>
Frequency:    <always, sometimes (n of m), once>
Notes:        <suspected cause, workaround>
```

**Example**

```
Title:        Thrown fighter stays 50 px below the floor and keeps fighting
Severity:     Major
Environment:  Chrome, keyboard, AI vs AI
Steps:        1. Start AI vs AI. 2. Wait for a grapple throw.
Expected:     Victim lands on the floor line.
Actual:       Victim lands at height -50, stays there until the next reset.
Frequency:    Every throw
Root cause:   A comment placed mid-line swallowed the statements that reset the victim's height and rotation.
Fix + guard:  Statements restored on their own lines; invariant sweep added so any negative height outside a flip fails the run.
```

## J. Root-cause review template (blameless)

```
What happened (timeline):
Impact:
Why it happened (ask "why" five times):
Why it was not caught earlier:
What we changed (fix, test, process):
What we will watch:
```

## K. Code review checklist

- [ ] Does it do what the requirement says, including the edge cases?
- [ ] Is every changed rule covered by a test?
- [ ] Are there new magic numbers, silent failures or swallowed errors?
- [ ] Are names clear; are comments about *why*?
- [ ] Is state changed only where it should be?
- [ ] Could this break an invariant or an existing behaviour?
- [ ] Performance: anything in the per-frame path that allocates or loops heavily?
- [ ] Security and privacy: any new input, data or dependency?
- [ ] Are the spec, help and changelog updated?

## L. Release checklist

- [ ] All automated tests green; invariant and soak runs clean
- [ ] Open defects reviewed; no critical or major left
- [ ] Manual smoke test on each target device and browser
- [ ] Performance within budget on the slowest device
- [ ] Version number and changelog written
- [ ] Backup of the previous version made and tested
- [ ] Rollback steps written and rehearsed
- [ ] Users told what changed and how to refresh (hard reload, new version string)
- [ ] After release: watch errors and feedback for 24 to 48 hours

## M. Metrics worth tracking

| Metric | Why |
|---|---|
| Defects found before vs after release | Shows how well testing works |
| Time from bug report to fix | Responsiveness |
| Rate of reopened bugs | Quality of fixes and tests |
| Test pass rate and flaky test count | Trust in the test suite |
| Build and test duration | Keeps feedback fast |
| Frame time and load time on the slowest device | Performance regressions |
| Soak results: stalemates, unused moves, win rates | Gameplay balance |
| User task success and time (usability tests) | Real-world usability |

Track a few numbers honestly rather than many badly; review them at each release.

## N. Glossary

- **Acceptance test:** checks the product against a stated requirement.
- **ADR:** architecture decision record.
- **CI:** continuous integration, which builds and tests every change automatically.
- **Flaky test:** a test that sometimes passes and sometimes fails without any change.
- **Invariant:** a rule that must always hold.
- **Regression:** a bug where something that worked stops working.
- **Soak test:** a long-running test to expose rare faults.
- **Smoke test:** a quick check that the basics work.
- **Technical debt:** shortcuts that make future change slower or riskier.

---

# Part 2: Defect handling protocol and defect catalogue

*Added at the start of Slow Fist version 2. This protocol is mandatory for v2 and for any project using this guide.*

## 19. The rule: understand before you fix

When a defect is found, **do not fix it first.** Fixing first treats the symptom, teaches nothing and lets the same class of bug return. Follow these steps in order. Skipping a step is itself a process defect.

| Step | Action | Output |
|---|---|---|
| 1. Capture | Stop. Record the defect exactly as seen (template I). Keep the failing case reproducible: seed, input, version. Do not change code. | Defect entry in `QA-LOG.md` with status OPEN |
| 2. Reproduce | Make it fail on demand, ideally by a script. If it is rare, find the smallest seed or scenario that triggers it. | Failing test or repro script |
| 3. Root cause | Ask why until you reach a cause that, if removed, makes the defect impossible. Distinguish the symptom, the trigger, the root cause and the reason it was not caught. | Root-cause note (template J) |
| 4. Classify | Place the defect in a class (see the catalogue in section 20) or create a new class. | Class name |
| 5. Generalise | Write how to **detect similar issues** (a scan, an invariant, a lint rule, a test) and how to **fix this class** (the pattern, not the patch). Search the whole codebase for other instances. | Detection method and fix pattern |
| 6. Update QA | Add the class, detection and fix pattern to the catalogue in this guide, and add any new invariant or test to the test suite plan. | Edited QA guide |
| 7. Fix | Only now change the code. Apply the fix pattern to every instance found in step 5. | Code change |
| 8. Verify | The reproducing test now passes, the new detection scan finds nothing, the full suite is green. | Test run |
| 9. Close | Mark the defect FIXED in the log with the commit, the test id and the guide section. | Closed entry |

**Gate:** a defect may be closed only when steps 3, 5 and 6 are written down. A fix with no root cause is not accepted.

### 19.1 Defect log format (`QA-LOG.md`)

```
## DEF-<nnn>  <short title>
Status:        OPEN / ROOT-CAUSED / GUARDED / FIXED
Found by:      <test id, sweep, review, user>
Version/seed:  <build, seed, input>
Severity:      Critical / Major / Minor / Trivial
Symptom:       <what was observed>
Reproduction:  <command or steps>
Root cause:    <why it happens>
Why not caught earlier: <gap in tests, review or design>
Class:         <catalogue class>
Detect similar: <scan or test, with how to run it>
Fix pattern:   <how to fix this class>
Instances found and fixed: <list>
QA guide update: <section changed>
Regression test: <test id>
```

### 19.2 Order of work in a sprint

1. Write requirements and acceptance tests.
2. Write failing tests.
3. Write code until the tests pass.
4. Run the sweeps (invariants, soak, draw).
5. On any failure, run the protocol above before touching code.

## 20. Defect catalogue (grows with every defect)

Each entry: **class**, how it shows up, how to detect, how to prevent, how to fix. Entries marked *(from v1)* came from the first Slow Fist version.

### 20.1 Swallowed statements *(from v1)*

- **Shows up as:** state is left half-updated. In v1, fighters stayed 50 px below the floor after a throw.
- **Cause:** a line comment (`//`) placed in the middle of a line, or a statement accidentally joined to a comment, so everything after it on that line is ignored. The same effect comes from a missing semicolon or brace joining two statements.
- **Detect:** a lint rule or script that flags `//` followed by code characters (`;` or `=`) on the same line after executable code; run the invariant sweep (no negative height outside a flip).
- **Prevent:** one statement per line for state transitions; put comments on their own line above, never between statements; use a formatter.
- **Fix:** move the comment, restore the statement, add the invariant.

### 20.2 Shared mutable data across tests *(from v1)*

- **Shows up as:** a test changes results of later tests (for example a style's hit points set to 999).
- **Cause:** configuration objects shared by reference (styles, tables) mutated by test code or game code.
- **Detect:** freeze configuration objects (`Object.freeze`, deep) in test mode; any write throws. Compare a snapshot of the tables before and after the suite.
- **Prevent:** copy config into each new fighter or match; never mutate tables.
- **Fix:** clone on creation, freeze the originals.

### 20.3 Wrong clock or unit *(from v1)*

- **Shows up as:** negative or huge time steps, NaN camera.
- **Cause:** mixing clocks (real vs simulated), or unclamped time steps.
- **Detect:** assert `dt` is within 0 and a maximum in the step function; NaN scan on all numeric state every step.
- **Prevent:** a single fixed-step simulation clock; renderers never feed time into rules.
- **Fix:** clamp and use a fixed step.

### 20.4 Impossible geometry *(from v1)*

- **Shows up as:** body parts below the floor, limbs through bodies, knees bending the wrong way.
- **Detect:** geometry invariants checked on the drawn skeleton (floor, limb length, joint side), run over thousands of frames.
- **Prevent:** constrain by construction (clamp, IK with a fixed bend direction), not by hoping the animation is right.
- **Fix:** add the constraint at the source of the pose.

### 20.5 Rare event never exercised *(from v1)*

- **Shows up as:** a stalemate once in 20 fights; a clipping once in 18,000 frames.
- **Detect:** seeded soak runs with failure reporting that records the seed; run many seeds in CI.
- **Prevent:** every random source takes a seed; failures print the seed.
- **Fix:** replay the seed, find the cause, add the seed to the regression list.

### 20.6 Documentation that disagrees with code *(from v1)*

- **Shows up as:** a spec saying one thing and the game doing another.
- **Detect:** tests derived from the spec's tables (data-driven: the spec numbers are read by the tests); review the spec against the code each release.
- **Prevent:** keep tunables in one data file used by both code and docs.
- **Fix:** change whichever is wrong, and record which.

*New classes from v2 are added below as defects are found.*

### 20.7 Silent argument shift in helpers *(from v2, DEF-001)*

- **Shows up as:** a helper crashes or does the wrong thing on its first line; several tests fail at once with an unrelated-looking `undefined` error.
- **Cause:** a function with several positional parameters was called with a different order or count than it was declared with. Dynamic languages accept this silently, so every argument moves one place.
- **Detect:** type assertions on the first line of each helper; a lint script that compares declarations with call sites; a failing test that many unrelated tests share is a sign of a broken helper rather than many bugs.
- **Prevent:** at most three positional parameters; otherwise pass one options object with named fields; write the helper and its first call together.
- **Fix:** change the signature to an options object (or remove the unused parameter) and update every call site in the same change.

### 20.8 Magic-number fixtures that disagree with configuration *(from v2, DEF-002)*

- **Shows up as:** a whole feature appears broken ("every grapple whiffs") although the rule code is right.
- **Cause:** a shared test fixture uses a number typed by hand (a distance, a size) that falls outside a range defined elsewhere (a style's grab range).
- **Detect:** a test of the fixture itself that asserts it sits inside every range the other tests depend on; when a whole group of tests fails the same way, check the fixture first.
- **Prevent:** compute fixture numbers from the configuration (`min(grabRanges) - 5`), never type them.
- **Fix:** derive the value from the configuration and add the fixture sanity test.

### 20.9 Unchecked resource spend and late normalisation *(from v2, DEF-003)*

- **Shows up as:** a bounded value (stamina, health) briefly goes below zero or above its maximum; bars glitch; a state flag that depends on the value lags behind.
- **Cause:** costs are subtracted by direct writes in many places, some with no affordability check, and the clamp happens at the start of the next update instead of the end of this one.
- **Detect:** an invariant sweep that checks every bounded value after every step across many seeds; a scan that lists every direct write to a bounded value so each can be reviewed.
- **Prevent:** all spending goes through one `spend(entity, cost)` function that refuses when the cost cannot be paid; one `normalise(entity)` at the end of every update clamps all bounded values and derives dependent flags.
- **Fix:** route every spend through `spend()`, add `normalise()`, and add a test for the exact trigger (for example a jump at 5 stamina).

### 20.10 Confounded expectation *(from v2, DEF-004)*

- **Shows up as:** a ratio or difference test fails by a factor that looks odd (1.2568 instead of 1.1) although the rule under test is correct.
- **Cause:** the test measures twice, and the first measurement changes other state (balance, stamina, timers) that also affects the second.
- **Detect:** check whether the observed value equals a product or sum of known factors; for every comparison test, list the state each step modifies.
- **Prevent:** a fresh match (or a reset helper) per measurement; change one variable at a time; name every side effect in a comment.
- **Fix:** reset the side effects between measurements, or state the expected value including the side effect and assert it explicitly.

#### 20.4 addendum *(from v2, DEF-005)*

- Measure **extents**, not only centres: a head drawn as a circle, a thick line or a foot has a radius that can cross the floor while its centre does not.
- Test **both bounds**: a figure must be neither below the floor nor floating above it when it is meant to rest on it.
- A safety clamp should be a net, not the thing that positions the figure: author poses so that contact points are at floor level, and treat any large clamp correction as a finding.

### 20.11 A test that passes for the wrong reason *(from v2, DEF-005)*

- **Shows up as:** a new test is green on its first run, yet a measurement shows the thing it guards is not what you assumed.
- **Cause:** another part of the code happens to mask the defect (here, hands pressed into the floor lifted the whole figure), so the test never sees the problem.
- **Detect:** a mutation check: deliberately break the code in the way the test is meant to catch (for example, put the hands on the floor) and confirm the test now fails; print the measured value, not just pass or fail.
- **Prevent:** run the mutation check for every new invariant test and keep the mutations in `tests/mutate.js`; when a test passes immediately, ask what would make it fail.
- **Fix:** repair the masked defect, then keep the mutation as a permanent test of the test.

#### 20.1 addendum: second instance *(from v2, DEF-006)*

- **It happened again, to the author who wrote this entry.** Patching a long one-line function by text replacement, a trailing `//` comment was inserted in the middle of the line and swallowed the `return` and the closing brace. It was caught only because the result did not parse. In v1 the same mistake parsed fine and silently left fighters under the floor.
- **Stricter prevention:**
  1. Inside a line use `/* ... */`; use `//` only on a line of its own or at the very end of a short line.
  2. One statement per line for anything that holds logic; reformat long one-liners before editing them.
  3. After every automated patch, run a syntax check on every source and test file (`SYNTAX-01`) before running any test.
  4. The lint rejects a `//` comment on a line whose code is over 120 characters or has more than two statements, and it scans `tests/` as well as `src/`.
- **Principle:** a defect class that has happened twice is a process problem; add an automatic check, not a reminder.

### 20.12 Shared handle replaced instead of updated *(from v2, DEF-007)*

- **Shows up as:** a function or field on a global or exported object works once, then "is not a function" or `undefined` after some later action.
- **Cause:** the object is created in one place and then re-assigned wholesale in another (often inside a `reset`), so everything attached to the first object is lost.
- **Detect:** a smoke test that checks the public members of the object before and after every operation that touches it; a scan for more than one assignment to the same global name.
- **Prevent:** create the handle once; afterwards only mutate its fields. Treat exported objects as constants.
- **Fix:** update fields in place (`handle.match = match`), never `handle = {...}`.

### 20.13 Browser-only code with no automated test *(from v2, DEF-007)*

- **Shows up as:** bugs that only appear when the page runs; the Node test suite is green.
- **Cause:** the shell that touches the DOM is excluded from the headless tests.
- **Detect and prevent:** keep the shell thin (no rules), and give it a smoke test that runs in the page and asserts its public state (`tests/browser-smoke.js`, results recorded in `QA-LOG.md`). Expose the minimal state needed (such as the help flag) through a debug hook so tests can read it instead of guessing from screenshots.


### 20.14 By-products mistaken for authored poses *(from v2, DEF-008)*

- **Shows up as:** an animation that meets the numbers (smooth, above the floor) but not the intent (a squat instead of a kneel).
- **Cause:** only some parameters were keyed and the rest came out of interpolation or IK as a side effect; nothing authored the contact that defines the pose.
- **Detect:** write each key pose as a measurable condition at a given time (a knee within 30 px of the floor at 30 to 55 percent) and add a continuity test (no joint moves more than a set distance between samples).
- **Prevent:** author the key poses with explicit contact targets; treat anything the solver chooses on its own as unreviewed.
- **Fix:** add the missing targets (and choose the IK bend direction per phase), then re-run both the key-pose and the continuity tests.

### 20.15 Scanner without its own tests *(from v2, DEF-009)*

- **Shows up as:** a lint warns about text inside a comment or string (false positive), or misses a real problem written slightly differently (false negative).
- **Cause:** the scanner works on raw text and was only checked against the cases it was written for.
- **Detect:** a self-test with positive samples that must be flagged and negative samples that must not, including the pattern inside comments and strings.
- **Prevent:** strip comments and string contents before matching; keep line numbers; add a sample for every rule when the rule is added.
- **Fix:** correct the scanner and add the failing sample to its table.


### 20.16 Requirement weaker than the intent *(from v2, DEF-010)*

- **Shows up as:** every test is green and the product still looks wrong (a knocked-out fighter that stands up straight).
- **Cause:** the requirement was written as the easiest thing to measure ("nothing moves after the K.O.") and left out what the player is meant to see; part of the old behaviour was lost when the requirements were rewritten.
- **Detect:** compare the new requirement table line by line with the old spec and the old product (carried, changed, dropped); look at a screenshot of every end state; for each end state ask "what does the player see?" and make that a test.
- **Prevent:** write end states as observable conditions, not as the absence of motion.
- **Fix:** add the missing observable condition as a requirement and a test, then change the code.


### 20.17 Hidden initial state *(from v2, DEF-011)*

- **Shows up as:** a recording or save file does not reproduce the original run; a test passes when run directly but fails when replayed.
- **Cause:** some state was set by hand after the match was created (positions, health, flags), so it is not in the seed and the inputs that the file stores.
- **Detect:** always verify a recording by replaying it from its seed and comparing hashes; scan for assignments to match or fighter fields between creating a match and starting a recording.
- **Prevent:** everything that affects a run comes from the seed and the recorded inputs; recording always starts from a fresh match; special starting situations are explicit, recorded options.
- **Fix:** reach the situation by play or by choosing a seed, or promote the set-up to a recorded option.


### 20.18 Escaping layers corrupt patches *(from v2, DEF-012)*

- **Shows up as:** a file that parses before a patch and not after, with a strange error inside a regular expression or a string.
- **Cause:** patch text with backslashes was passed through several interpreters (shell here-document, then a script, then the target language), and each layer consumed or turned some of them into real characters.
- **Detect:** run the syntax check on every source file straight after every patch (`SYNTAX-01`); a failure that appears in several tests at once points to one broken file.
- **Prevent:** write patches with an editor tool or write the patch script to a file; never carry regular expressions or escape sequences through a shell here-document.
- **Fix:** restore the line with the editor tool, then re-run the suite.


### 20.19 Bend direction chosen by a preference instead of a constraint *(from v2, DEF-013; repeat of v1)*

- **Shows up as:** a knee or elbow that bends the wrong way in some postures only (high kicks, raised arms). The same complaint came back after v1, so the root cause had not been removed.
- **Cause:** the two possible joint positions are chosen with a direction preference ("forward and slightly up"), which is only right for the posture it was tuned on. The test that existed used the same preference, so test and code agreed and both were wrong.
- **Detect:** state the anatomical rule as a sign test on the joint (`cross(thigh, shin) x facing >= 0` for a knee, the opposite sign for an elbow) and sweep it over every state, every aim angle, both facings and both phases of a move; keep a mutation that restores the preference.
- **Prevent:** select the solution by the constraint; never use a preference direction to decide which way a joint folds. When an old complaint returns, treat it as evidence that the first fix addressed a symptom and ask what rule the first fix failed to state.
- **Fix:** choose the candidate whose flexion sign is correct; near a straight limb both candidates coincide, so nothing pops.


### 20.20 Incomplete constraint set: positions checked, angles not *(from v2, DEF-014)*

- **Shows up as:** poses that satisfy every test (above the floor, constant limb lengths, correct bend direction) and still look impossible: an elbow folded flat, a thigh pressed against the chest.
- **Cause:** poses are built from target positions and solved by inverse kinematics, which guarantees lengths but not joint angles; the hip had no constraint at all.
- **Detect:** for each joint write its human range (knee flexion up to about 140 degrees, elbow about 145, hip from about 30 degrees of extension to about 125 of flexion) and measure all poses and all simulated fights against it, reporting the worst value and its state; ask the question early ("is every motion humanly possible?") instead of at the end.
- **Prevent:** put the limits inside the solver so that no pose can violate them; for a two-bone joint a minimum reach is an exact limit.
- **Fix:** minimum reach for knee and elbow; rotate the whole leg about the hip to bring the hip angle inside its range.

### 20.21 Pose is a function of state with no temporal continuity *(from v2, DEF-015)*

- **Shows up as:** limbs that flick or teleport when the state changes (a hand at 11,000 px/s after a throw), although every single pose is valid.
- **Cause:** the pose is computed from the current state only, so a change of state changes all targets in one step.
- **Detect:** measure the speed of every end point between consecutive frames over many simulated fights and list the worst transitions by name; compare with a physical speed limit.
- **Prevent:** keep pose targets and the displayed pose separate; the displayed pose moves toward the target with a rate and a speed cap (an animator in the presentation layer), including the facing, so that a turn takes time.
- **Fix:** an animator with exponential smoothing plus a cap per parameter, tested for speed, convergence, no lag on the first frame, and no influence on the simulation.


### 20.22 Angle wrap-around in a clamp *(from v2, DEF-016)*

- **Shows up as:** a limb that flips to the opposite side for a few frames when a direction passes straight up or straight down; a tiny parameter change gives a huge change of output.
- **Cause:** a signed angle from `atan2` jumps from +180 to -180 degrees; a clamp that treats the two values as far apart rotates the limb the long way.
- **Detect:** test every angle clamp with values on both sides of the wrap point, and sweep the limb direction through the full circle in small steps while checking that the output moves continuously; look for unexplained jumps in speed tests.
- **Prevent:** unwrap angles before clamping (choose the representation nearest to the allowed range) and clamp to the nearest limit.
- **Fix:** shift values past the middle of the forbidden arc by 360 degrees, then clamp.


### 20.23 Limits or smoothing applied in end-point space instead of joint space *(from v2, DEF-017)*

- **Shows up as:** a limb that flips between two poses for a tiny change of its target, or a foot that stalls and then jumps; range and speed tests pass for most poses and fail for a few transitions.
- **Cause:** joint ranges are limits on angles, but they were enforced and smoothed on hand and foot positions. The reachable positions have a hole (a limb cannot pass through the body), so any hard limit on a target that goes round the hole must jump, and a straight path between two positions can cross the hole.
- **Detect:** sweep a target through all directions the joints can reach and check that the output moves continuously; measure end-point speed over many simulated fights; for each limit ask whether it belongs to a position or to an angle.
- **Prevent:** do inverse kinematics once to get joint angles, then clamp, smooth and cap the angles and rebuild with forward kinematics. Range, constant limb length and continuity follow by construction; a speed bisection on the end points can stay as a safety net.
- **Fix:** replace the end-point limiter and smoother by a joint-space pipeline.
- **Note on process:** when a fix leaves the failing number almost unchanged (88 samples became 84), the diagnosis was wrong or incomplete; go back to the evidence instead of adding a second patch on the first.


### 20.24 A move authored as an end-point interpolation, without its mechanics *(from v2, DEF-018)*

- **Shows up as:** a move that is valid (inside ranges, no teleport) but does not look like itself: a punch with a bent arm at contact, a fist that swings in an arc, a hand that drops its guard.
- **Cause:** only the position of the end point was authored; the parts that make the move recognisable (chamber, extension, shoulder and torso drive, guard hand, speed profile) were not.
- **Detect:** list the recognisable features of the move and measure them at the key moments (start, contact, recovery); look at a contact sheet of five moments; compare with the numbers of a reference.
- **Prevent:** author moves in joint angles with named parts, and write each feature as a test when the move is written.
- **Fix:** give each part of the body its role in the move and re-measure.

### 20.25 Rule loop without recovery protection *(from v2, DEF-019)*

- **Shows up as:** a player who is hit once cannot act again until the round is lost (a chain from a throw to a K.O.).
- **Cause:** the state that follows a hit is vulnerable again before the victim can act, and the attacker can repeat the move that put the victim there; protection covered only the first part of the recovery and nothing capped the total damage of one chain.
- **Detect:** in the soak report count K.O.s that follow a knockdown or throw within a few seconds; add a scripted worst-case attacker; for each hard-to-leave state ask what stops the other side from repeating the move.
- **Prevent:** every state a hit can cause has a protection window with a damage budget, and the budget is not refilled inside the window.
- **Fix:** protection from landing until the stand-up ends plus a grace period, with a damage cap, no K.O. inside it, and no second throw.


### 20.26 A placeholder state with one exit path *(from v2, DEF-020)*

- **Shows up as:** a protection, lock or invulnerability that lasts far longer than intended in some situations; a statistic (timeouts, stalled fights) that worsens after a rule change although the rule's own tests pass.
- **Cause:** a placeholder value ("until the stand-up ends") is turned into the real timer on one exit path only; a second way out of the state (a hit during the stand-up) leaves the placeholder in place.
- **Detect:** test an upper bound on the duration of every protection and lock; test each state transition that can interrupt the protected state; compare the soak report before and after every rule change, including the timeouts.
- **Prevent:** convert placeholders in the one place that runs the timer, not at the exits; prefer a boolean "waiting for the stand-up" plus one timer over a magic large number.
- **Fix:** normalise the timer every step: if the fighter is not in a state that holds the protection, replace the placeholder by the grace time.


### 20.27 First iteration of a loop that compares with the previous value *(from v2, DEF-021)*

- **Shows up as:** a crash or a wrong number on the first sample of a speed, difference or continuity measurement.
- **Cause:** one of several uses of the previous value sits outside the guard that skips the first iteration.
- **Detect:** run the test once; the first iteration fails at once. Review such loops for a single guard.
- **Prevent:** write the comparison as one block under one guard, or start the loop at the second sample.
- **Fix:** move every use of the previous value under the guard.

*Variant (DEF-022):* a sample that is skipped rather than missing. If the step that advances the simulation is called from more than one place, the "previous value" can be one frame older than the loop thinks. **Prevent:** one helper both advances and measures, and a test asserts samples equal steps.

### 20.28 A new early action silently blocks an existing alternative *(from v2, DEF-025)*

- **Shows up as:** an action that used to work (here the grapple on a touch screen) never happens after a change that made another action start earlier.
- **Cause:** the early action puts the system in a state (here "winding up a strike") in which the alternative is refused by its own precondition. Each part is correct on its own.
- **Detect:** an end-to-end table test: for every input the user can give, drive the real pipeline (gesture, plan, simulation) and assert the result. This one found the missing grapple on the first run.
- **Prevent:** when an action is started before the choice is final, list every alternative choice and check that it can still start from that state; give the state an explicit, tested way out (here: a grapple cancels a young wind-up).
- **Fix:** add the way out to the rules, with a test, rather than weakening the early start.

### 20.29 A decision taken before the information exists *(from v2, DEF-026)*

- **Shows up as:** a "heavy" stroke always comes out as a normal one.
- **Cause:** the early decision classifies by a quantity that is only known at the end (the length of the stroke), so it always picks the default, and the plan is already executed when the final value arrives.
- **Detect:** the same table test with a slow, long input; compare the early decision with the final one for every case.
- **Prevent:** for each early decision, name the quantity it needs and whether it is known yet; where it is not, use an early proxy (here the speed), and keep the action reversible until the final value is known.
- **Fix:** a tentative class from the proxy, corrected by the final decision while the action has not been released.

### 20.30 A state machine that assumes exactly two parties *(from v2, DEF-027)*

- **Shows up as:** a thing that works for two participants and gets stuck when a third appears (here: a thrown fighter that stays in the air forever).
- **Cause:** a state that depends on another participant (holder and victim) is only ever interrupted by that participant while there are two; a third party can interrupt the owner and leave the dependent state orphaned.
- **Detect:** list every state that refers to another participant; run a randomised multi-party simulation and assert at every step that each dependent state still has its owner.
- **Prevent:** when changing the number of participants, review each such state for "what if someone else interrupts the owner"; make the owner uninterruptible or give the dependent state its own exit.
- **Fix:** both: forbid the interruption, and add a safety net that releases an orphan.

### 20.31 Two constants for one boundary *(from v2, DEF-029)*

- **Shows up as:** a thing ends up inside a wall or falls through a floor now and then, only at speed or only at corners.
- **Cause:** "on the floor" and "inside the wall" are decided by two separate tests with two separate numbers (a height of 6 here and 8 there, a width of 8 and 20); between them is a band where neither rule applies.
- **Detect:** a randomised play test that counts violations of the invariant ("no body inside a box") over many steps; it finds the band at once.
- **Prevent:** derive every test of one boundary from one constant or one function; add a final clean-up pass at the end of the step that enforces the invariant whatever moved the body.
- **Fix:** one constant per dimension, shared by all rules, plus the clean-up pass.

### 20.32 A shortcut path that bypasses a new rule *(from v2, DEF-030)*

- **Shows up as:** the new rule works in the normal path (walking, jumping) and fails in a special one (a throw, the end of the match).
- **Cause:** several places write the same variable directly (here the height); the new constraint (a floor that is not zero) was added to the main one only.
- **Detect:** when adding a constraint, search for every direct assignment to the variable it limits and write one scenario per writer; do not trust a clean-up pass that silently repairs the result, it hides the bug (a body popped out of a box looked like "falling through").
- **Prevent:** give the constraint one function (here `floorUnder`) and make every writer use it as the bound.
- **Fix:** route each writer through that function.

### 20.33 A mode flag overrides a continuous input *(from v2, DEF-031)*

- **Shows up as:** a control does the opposite of what the player does in one particular state (here: aiming down while crouched punched upward).
- **Cause:** a rule that chooses by a flag (crouching) is tested before the rule that reads the continuous input (the aim) and fixes the result.
- **Detect:** a table test of every flag against several values of every continuous input; look for outputs that do not follow the input.
- **Prevent:** order rules so that the continuous input decides and the flag supplies only a default; write down which of the two wins.
- **Fix:** swap the order (input first) and keep the old behaviour only where the input is neutral.


### 20.34 A global style rule reaches a new element *(from v2, DEF-024)*

- **Shows up as:** a newly added overlay (a canvas, a panel) hides or restyles what is under it, although its own code never set a background.
- **Cause:** the page stylesheet has a rule for the element type (`canvas { background: ... }`) and the new element matches it.
- **Detect:** for every element a script adds, list the global selectors that match it; in a browser check, read the pixel under the overlay (`elementsFromPoint` plus a pixel sample) and compare it with the expected content.
- **Prevent:** style added elements explicitly (background, border, position) and give them an id; keep global rules to classes.
- **Fix:** set the properties on the new element.


### 20.35 Variants that differ in the rules but not in what the player sees *(from v2, DEF-032)*

- **Shows up as:** several named variants (moves, items, enemies) that are different in the data but look and feel the same.
- **Cause:** the data table has a field for the difference (kind, power, timing) but the presentation code reads only the common fields, so the variants converge visually; legality tests pass because each variant on its own is fine.
- **Detect:** a pairwise distinctness test over all variants (distance between their on-screen results above a threshold, or on an explicit list of pairs allowed to look alike with the reason); a page that shows all variants side by side.
- **Prevent:** when adding a variant field to a table, add the line of drawing or sound code that reads it, and a distinctness check that fails if two variants collapse.
- **Fix:** read the field in the presentation code, and show on the preview whatever a still picture cannot (path, timing, numbers).
