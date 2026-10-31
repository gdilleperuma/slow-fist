# Slow Fist v2: choreography (sequences, steps, frames)

Goal: strikes that chain into real fight sequences (one-two-three, front kick into roundhouse into spinning back kick), each with its own timing in frames, its own footwork and its own body mechanics.

## 1. What the real arts say (and what they do not)

| Topic | What the sources give | Use in the game |
|---|---|---|
| Boxing numbers | 1 = jab (lead hand), 2 = cross (rear hand), 3 = lead hook. The cross and the rear hook pivot on the rear foot; the jab has no pivot, its power comes from the weight moving onto the lead foot. The straight punches draw the guard up so the hook lands from the side. ([FightCamp](https://blog.joinfightcamp.com/training/3-punch-boxing-combos-leading-with-the-jab-pt-1/), [pivot punch](https://dynamicstriking.com/blogs/news/the-pivot-punch-in-boxing)) | Boxer chain JAB, CROSS, HOOK, UPPERCUT with alternating hands, a lunge on the jab and a rear-foot pivot on the cross and hook. |
| Kick phases | Preparation, kick, contact, recuperation; the leg comes back along the same path and the return takes about twice as long as the kick (0.64 s against 0.34 s in one small study). A turning kick takes about twice as long as a front kick. A Muay Thai roundhouse measured about 1.0 s start to finish, Taekwondo about 1.5 s. ([ITF study](https://ortus0m.rtu.lv/science/en/publications/7618), [kick times](https://lida.sport-iat.de/ta/Record/4022396), [PLoS ONE](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5571909/)) | Recovery is longer than the strike; the spinning kick takes about twice the front kick's startup; Kicker chain FRONT KICK, ROUNDHOUSE, SPINNING KICK. |
| Frame data | 60 frames per second; each move has startup (before the hit can land), active (the hit can land) and recovery (until you can act); a cancel window near the end of recovery lets the next move start. ([Prima](https://primagames.com/eguides/street-fighter-v-eguide/primer/reading-frame-data), [critpoints](https://critpoints.net/2016/11/29/understanding-framedata-combos-traps-and-turns/)) | The frame table below, a cancel window, and an input buffer. |
| Punch chain | The force starts in the legs and hips and ends in the fist; the body rotates as a unit. ([summary](https://quizzly.ai/play/biomechanics-of-punch-generation)) | Hip and shoulder drive on each punch (already in PUNCH-01), footwork on each step. |
| Not found | Measured start-to-impact times for jab and cross; teep timing; phase timings of the spinning back kick. | The frame numbers below are **design values** chosen to follow the ratios above (fast jab, cross slower, hook and uppercut slower again, kicks slower than punches, turning kick about twice a front kick). They are not measurements. |

## 2. Frame data (60 frames per second, at strike speed 1)

startup = frames until the hit can land; active = frames in which it can land; recovery = frames until the fighter can act; cancel = the last frames of the recovery in which the next move of a sequence can start; lunge = pixels the body travels forward during the startup; hand = 0 lead, 1 rear. Strike speed (hold time and taps) divides startup and active; recovery of kicks is multiplied by the style's `krec` / 0.9.

| Move | Startup | Active | Recovery | Cancel | Lunge | Hand / limb |
|---|---|---|---|---|---|---|
| JAB | 6 | 3 | 11 | 8 | 16 | lead hand |
| CROSS | 9 | 3 | 14 | 9 | 10 | rear hand, rear-foot pivot |
| HOOK | 11 | 3 | 16 | 9 | 8 | lead hand, elbow bent, pivot |
| UPPERCUT | 11 | 3 | 17 | 9 | 6 | rear hand |
| OVERHAND | 14 | 4 | 20 | 8 | 12 | rear hand |
| HEAVY PUNCH | 16 | 4 | 22 | 6 | 12 | rear hand |
| JUMP PUNCH | 8 | 4 | 14 | 0 | 0 | lead hand |
| LEAPING UPPERCUT | 8 | 4 | 14 | 0 | 0 | rear hand |
| FRONT KICK | 9 | 3 | 16 | 8 | 10 | kick |
| ROUNDHOUSE | 13 | 4 | 22 | 9 | 8 | kick |
| LOW KICK | 11 | 3 | 17 | 8 | 10 | kick |
| LOW SWEEP | 13 | 4 | 20 | 6 | 14 | kick |
| RISING KICK | 12 | 3 | 20 | 6 | 8 | kick |
| HEAVY KICK | 16 | 4 | 24 | 6 | 10 | kick |
| SPINNING KICK | 20 | 4 | 28 | 8 | 22 | kick, full turn |
| FLYING SIDE KICK | 12 | 5 | 16 | 0 | 0 | kick |

## 3. Sequences (chains)

A sequence starts with any normal strike. While the fighter is in the cancel window of the strike's recovery (and up to 5 frames earlier: input buffer), pressing punch or kick continues the sequence with the next move of the style's graph, without winding up and without returning to guard. Missing the window ends the sequence. Pressing grapple in the cancel window of the second step or later goes into the grapple.

| Style | After | punch continues with | kick continues with |
|---|---|---|---|
| Boxer | JAB | CROSS | LOW KICK |
| Boxer | CROSS | HOOK | FRONT KICK |
| Boxer | HOOK | UPPERCUT | LOW KICK |
| Boxer | UPPERCUT | CROSS | FRONT KICK |
| Kicker | FRONT KICK | CROSS | ROUNDHOUSE |
| Kicker | ROUNDHOUSE | JAB | SPINNING KICK |
| Kicker | SPINNING KICK | JAB | FRONT KICK |
| Kicker | JAB | CROSS | ROUNDHOUSE |
| Kicker | CROSS | JAB | ROUNDHOUSE |
| Grappler | JAB | HOOK | LOW KICK |
| Grappler | HOOK | OVERHAND | LOW KICK |
| Grappler | OVERHAND | JAB | LOW SWEEP |
| Grappler | LOW KICK | JAB | FRONT KICK |
| Grappler | FRONT KICK | HOOK | LOW SWEEP |

Named sequences shown on screen: Boxer 1-2 (JAB, CROSS), 1-2-3 (JAB, CROSS, HOOK), 1-2-3-4 (plus UPPERCUT); Kicker front-round-spin; Grappler jab-hook-overhand.

## 4. Footwork

Each move's lunge moves the body forward during the startup (eased), so a sequence advances the fighter and pushes the opponent back. In the pose the front foot steps out ahead of the body and the rear heel lifts on the pivot moves.
