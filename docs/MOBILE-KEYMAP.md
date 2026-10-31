# Mobile key map (v2, revision 2)

Rule for every entry: **the limb moves the way the finger moves.** A stroke is never given a meaning that goes against its direction (round 1 had "shove" on an inward stroke, which pushed the opponent away from the finger; removed).
Directions are relative to the way the fighter faces. The four segments are not the same size: forward and back are 100 degrees, up and down 80 degrees.

## Built now

| Finger travels | Hand circle | Leg circle |
|---|---|---|
| Forward, short and fast | JAB | FRONT KICK |
| Forward, normal | CROSS | FRONT KICK |
| Forward, long and slow | HEAVY PUNCH | HEAVY KICK (Kicker: spinning kick) |
| Up | UPPERCUT | RISING KICK |
| Down | OVERHAND | LOW KICK |
| Back (a straight pull, 9 mm or more) | GRAB, then throw | TRIP (leg hook, the same grapple) |
| Curve, up and over | HEAD HOOK | ROUNDHOUSE |
| Curve, low | BODY HOOK | LOW SWEEP |
| Tap | JAB | FRONT KICK |

The wind-up starts when the finger lands; the stroke decides the move. A grab cancels a wind-up that is under 0.3 s old (DEF-025).

## Proposed next (each needs new moves, frame data, poses and tests)

Doubling without contradiction: the second variant comes from **where the stroke starts**, never from reversing its direction.
A stroke that starts on the far (back) half of the circle and travels forward uses the **rear** hand or leg: longer travel, more power, slower. A stroke that starts at the centre or the front half uses the **lead** hand or leg: quick.

| Finger travels | Lead (starts at centre) | Rear (starts on the back half) |
|---|---|---|
| Forward | JAB / lead front kick | CROSS / rear power kick |
| Up | lead uppercut / lead rising kick | rear uppercut / rear high kick |
| Down | short overhand / lead low kick | heavy overhand / rear low kick |
| Curve | lead hook / lead roundhouse | rear hook / rear roundhouse |
| Over the top, ending low | hammer fist | AXE KICK (new) |

Modifiers, all consistent with the finger direction:
- **In the air** (stick up): forward kick is FLYING SIDE KICK, forward punch is JUMP PUNCH, up punch is LEAPING UPPERCUT (all exist); down with the leg is a STOMP / DROP KICK (new); a curve with the leg is a FLYING ROUNDHOUSE (new).
- **Sprinting:** forward punch is a LUNGE PUNCH (the lunge exists in the frame table); forward kick is a SLIDE KICK (new).
- **Crouching:** forward kick is the LOW SWEEP (exists).
- **Stroke from one circle into the other:** the two-move sequence from the sequence graph (punch then kick, or kick then punch).
