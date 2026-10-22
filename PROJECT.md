# Study Together: Project Brief (v2, 3D)

**Status:** v1 fully specced. This document contains decisions, not options. It replaces
the v1 pixel-art brief (2026-10-04). Behaviour carries over from that brief unchanged; the
**visual direction is new** and is now the toon-shaded 3D diorama that exists in this
repository.

**Date:** 2026-10-22
**Target:** mobile-first web app, free, no accounts

---

## 0. How to use this document

This brief is written for the people and agents building the app. Every section is either
a **product rule** (what the app does) or a **build guide** (how to make a part so that it
matches everything else).

### 0.1 Read these first

Before any visual work, open these. They are the source of truth for appearance.

| Source | What it is | Status |
|---|---|---|
| `/dev/characters` (run `npm run dev`) | The live character gallery, rendered by the real builder: turnaround, hair, outfits, accessories, expressions, all 10 avatars, seated views | **Approved. This is the locked character look.** |
| `src/lib/avatars.ts` | Palettes, style lists, and the 10 avatar presets | Locked (§9.2) |
| `src/scene/characterBuild.ts`, `faceAtlas.ts`, `character.ts` | The character builder, face decals, and procedural animation | Locked construction (§9.3) |
| `docs/character-sheet.png` | The concept sheet the gallery was built from | Concept only. Never ship it, never trace pixels from it |
| `/room/<id>` in demo mode | The study hall diorama | Approved look (§10). Layout changes listed in §10.5 |

Where this brief and the running gallery disagree on **appearance**, the gallery wins.
Where they disagree on **behaviour**, this brief wins.

### 0.2 What changed from the v1 pixel brief

| Area | v1 pixel brief | v2 (this brief) |
|---|---|---|
| Rendering | 480×270 pixel art, `setPixelRatio(1)`, `image-rendering: pixelated` | Real-time 3D, toon-shaded, antialiased, DPR capped per quality tier |
| Art pipeline | Hand-authored pixel sprites | **Procedural geometry in code**: primitives merged with baked vertex colours |
| Characters | 2D paperdoll layers, ~30px, no faces | 3D clay-toy chibi, ~2.6 heads tall, **expressive face decals** |
| Time of day | Golden-hour afternoon | **Night**, warm lamplight inside, blue moonlight outside (clear 70%, rain 30%) |
| UI chrome | Pixel 9-slice frames, pixel font | Rounded opaque panels, Manrope, dark navy and amber |
| Palette | One 32-colour pixel palette | Locked scene, character, and UI palettes (§22) |
| Room | Individual desks in two rows | One long shared study table, 10 seats (§10.2) |

Everything else carries over: room pool, independent timers, status, break behaviour, chat
gating, audio licensing, abuse protection, analytics.

### 0.3 Technique reference

`nagomi` (github.com/msk1039/nagomi) is still the reference for two techniques: the
**fixed-timestep loop with a drift-free frame limiter** (§17.4) and the **`defaults ⊕ weather
⊕ edits` settings model** (§13.6). Its pixel-resolution techniques no longer apply.

⚠️ **It is PolyForm Noncommercial 1.0.0, © 2026 Mayank Kadam. Reimplement every technique.
Never copy its source** into this project. A paid tier is planned, and copying would violate
that licence permanently.

---

## 1. What this product is

A shared study room. Up to **10 strangers** sit at the same table in a cozy 3D study hall late in
the evening. Each one runs **their own independent Pomodoro timer**, and they work in
silence, together.

The product is **presence, not productivity tooling.** There are no accounts, no stats
pressure, no streaks, no leaderboards, and no chat for its own sake. The emotional pitch is:
*you open this and nine people are already working at the table, and you're one of them.*

Everything below serves that. Any feature that turns the room into a feed, or that makes a
stranger feel watched or exposed, is out.

---

## 2. v1 scope

### 2.1 In scope

- **Public room pool.** Rooms of 10, created on demand, assigned automatically.
- **Two responsive layouts:** mobile portrait (primary) and desktop/laptop/tablet landscape.
- **Per-user Pomodoro timer** with custom duration. Default 25/5.
- **Three-state participant status** (focusing / on break / away), shown in the scene.
- **Weather:** room baseline plus personal override.
- **Audio:** ambience loop, weather-tied rain, social cues, personal master mute.
- **Entrance animation:** walk in through the door and sit at a free seat.
- **Avatar builder** over the approved character axes (§9.2).
- **Break chat:** ephemeral, gated to people on break, side panel plus speech bubbles.
- **Analytics:** today / 7 days / 30 days of completed focus sessions.
- **Onboarding coach marks**, settings panel, reduced-motion support.

### 2.2 Out of scope for v1

- Accounts, passwords, email. (Supabase anonymous sign-in is allowed as plumbing. It is
  invisible to the user and is not an account. See §15.1.)
- Payments, subscriptions, any paid tier.
- Custom / private rooms. **This is the paid-tier feature, not v1.** See §3.
- Voice, video.
- Persistent chat history.
- Break streaks.
- More than one map. **The all-night café is map 2, not v1.** See §12.
- Music. **Deferred to the paid tier.** See §11.4.
- User-chosen facial expressions. Faces are system-driven (§9.5).
- Server-side moderation, kick, ban. See §20.3 and §3.3.
- Ads.

### 2.3 Scope risk: documented fallback order

The critical path is now **the walking/standing character** (§9.6) and **the per-seat status
lamps** (§6). The approved character itself is built. If the schedule runs long, cut features
in this order, and only in this order:

1. Music channel (already deferred)
2. 7-day and 30-day analytics charts (reduce to "today" only)
3. Speech bubbles (side panel chat carries the feature alone)
4. Avatar builder (ship the 10 approved presets in `AVATARS` as a picker, which already exists)

Never cut: the two layouts, the status system, the walk-to-break movement, the entrance
animation, break chat, or the room inventory.

---

## 3. Rooms

### 3.1 Public rooms

- A pool of rooms. Each holds **10 people**, one per seat at the table.
- When every room is full, the next arriving user causes **a new room to be created**. Rooms
  are never shown as unavailable.
- **A room is destroyed when it becomes empty.** No room persists.
- Assignment: **on entry, place the user in the fullest room that has space.** Density is the
  product, so maximise company and don't spread people thin.
- A **"move to another room"** control is always available. Arriving alone in a dead room with
  no way out is the worst state the app can produce.
- There is **no lobby and no room list** in v1. The user goes from the entry screen straight
  into a room.

### 3.2 Empty rooms are not blocked

An empty room renders normally and **the user can start a timer immediately.** Someone who
opens the app at 6am to do 25 minutes of work is never told they cannot start.

The room shows **one unobtrusive line** saying they are the only person here. No sad empty
state, no modal, no blocking. Every feature works alone.

### 3.3 Private rooms: designed, not built

v1 is strangers-only. **There is no way to be in the same room as a specific person.** This
is a deliberate v1 limitation. The paid custom-rooms feature resolves it.

When it is built, a private room will have a host who controls **map, weather, ambience,
music, and a banner message**; a shareable link; and **no moderation tooling** (no kick, no
ban).

### 3.4 Friends limitation

Rooms are destroyed when empty and v1 has no custom rooms. A returning user is reassigned
and may land in a fresh empty room. This is a known gap; §3.3 resolves it.

---

## 4. Rooms, weather, and audio ownership

Three distinct layers. Do not conflate them.

| Layer | Scope | Exists in v1 |
|---|---|---|
| **Room baseline weather** | Everyone in the room sees the same weather | **Yes** |
| **Personal weather override** | Affects the user's own view only | **Yes** |
| **Personal audio mute / volume** | Affects the user's own device only | **Yes** |
| **Room-wide weather / ambience control** | Host-controlled, affects everyone | **No: paid tier** |

### 4.1 Public room baseline

- Assigned **when the room is created**. It stays that room's character for its lifetime.
- **Weighted random: 70% clear night / 30% rain.** The clear moonlit night is the dominant
  everyday state. Rain should feel like an event: something you notice and enjoy when your
  room has it, not the default backdrop.
- Every occupant sees the same baseline. A room's weather is fixed at spawn and never
  changes while the room is alive.
- Rooms are ephemeral, so returning users get a new room with a new mood.

### 4.2 Personal override

- The user's weather control is a **three-state segmented control: `Room · Rain · Clear`.**
- "Room" means synced to the room baseline.
- "Rain" or "Clear" overrides the baseline **for that user only.** Other occupants are
  unaffected.
- The control has three labelled states rather than a binary toggle. With 8 other people
  possibly looking at a rainy room, the user must be able to tell which one they are seeing.

### 4.3 Private rooms (paid)

The host sets weather, ambience, music, and map for everyone. Each user keeps personal audio
mute and volume.

---

## 5. Timers

- **Every user runs their own timer.** There is no shared room cycle. This is final.
- **Custom duration** per user. Default **25 / 5**.
- The **clock is local and authoritative for that user only.** It runs on wall-clock time,
  never on a server tick, and **survives page reloads.** It is the one value that must never
  lie to someone.
- The room has no aggregate timer. What the room shows is derived (§8.2).
- A session is **completed** when the focus phase runs to zero. Leaving early does not record
  a session.

---

## 6. Status, and how it is shown without reading

The status signal must work at a glance, across the room, with zero reading. The primary
mechanism: **every seat has its own small reading lamp on the table.** The lamp is a
diegetic status display.

| Status | Seat lamp | Avatar | Seat |
|---|---|---|---|
| **Focusing** | **On**: warm glow pool on the table in front of them | Seated, cycling write / read / type, with sips from the mug | Their props out, lamp lit |
| **On break** | **Off** | **Away from the table**: in the armchair, at the window, by the bookshelf, or standing with a mug (§7) | Props still out |
| **Away** | **Off** | Absent | **Chair pushed back, empty, but their mug and open book are still on the table** |

"Lamp off" is disambiguated by **where the avatar is**, not by an extra icon. "On break" means
a visible person elsewhere in the room. "Away" means an empty chair.

**The belongings left on an away seat are mandatory.** They cost one prop set and do more
emotional work than any status icon. They say *they were just here*.

### 6.1 Redundant, non-colour status coding

Status must never be encoded by hue alone. Amber / teal / grey dots alone fail for colour
vision deficiency, which affects roughly 8% of men.

- **In the scene:** lamp state plus avatar position carry status. No colour dependency.
- **In the participants panel:** status uses **shape as well as colour**: filled dot for
  focusing, half-filled for on break, hollow ring for away, plus the text label.

### 6.2 Away is derived, never self-reported

"Away" is not a status the user sets. It is derived from presence: a participant with no live
heartbeat for the away threshold is away. **There is no "I'm away" toggle.**

---

## 7. Break behaviour

- **Focusing:** seated. Animation cycles through writing, reading, and typing, with occasional
  mug sips and tired moments (overhead stretch, hands behind head).
- **On break:** the avatar **stands up, pushes the chair back, and walks** to one of a fixed set
  of destinations in the room (§10.4): the armchair, the window, the bookshelf, the edge of the
  bed, or standing by the table with a mug. It adopts a break pose there: leaning back,
  holding a mug, scrolling a phone, looking out at the rain.
- **On break end:** the avatar walks back to its own seat, sits, and resumes.
- Destinations are **scripted, not free-roam.** A fixed set of walk paths, not pathfinding.
- **A person who vanishes or teleports does not read as "on a break."** A person who gets up and
  walks to the armchair does. That is the whole reason break has movement.
- Two avatars never share one destination slot. Each destination has a small fixed number of
  slots; overflow uses the "standing with a mug" spots.

---

## 8. The room's response to its own occupancy

### 8.1 No shared rhythm

Every timer is independent, so the room will almost never breathe in sync. There is no
discrete room mood, no threshold, no state machine. A threshold produces a visible snap, and a
snap is the wrong feedback in a calm app.

### 8.2 Continuous aggregate grade

A single scalar:

```
focusDensity = focusingCount / presentCount   (0.0 … 1.0)
```

drives three parameters:

| Parameter | focusDensity → 1.0 | focusDensity → 0.0 | Range |
|---|---|---|---|
| Room light (hemisphere + fill intensity) | Dims ~10% | Brightens ~8% | ±10% |
| Warm/cool balance | Slightly cooler moonlight share | Slightly warmer lamp share | small lerp of light colours |
| Rain loop volume (personal audio) | Quieter, denser | Lighter | n/a |

- **Maximum total shift ~10%.** Lerp over **2–3 seconds.**
- **No one should consciously notice this.** If a user can name what changed, it is too strong.
- Disabled under reduced motion: values jump without interpolation.

This is what recovers the collective feeling that dropping a shared clock gave up.

---

## 9. Characters

**The character look is approved and locked.** It is what `/dev/characters` renders today.
New work must match it. Do not restyle, re-proportion, or re-palette the characters without a
new decision recorded in this document.

### 9.1 The look, in words

A **matte clay-toy chibi**: a soft, rounded, slightly squashed big head on a small, stocky
body, roughly **2.6 heads tall**. Cozy, oversized student clothes. Chunky cream sneakers with
rolled trouser cuffs. Mitten-like rounded hands with a thumb nub. Small round ears. Hair is
built from **chunky, sculpted locks** with visible creases between them, not a smooth helmet.

The face is a **flat decal** on the front of the head: big dark oval eyes with a warm brown
iris glow in the lower half, a large catchlight upper-left and a small bounce light lower-right,
thin arched brows, a small mouth line, and soft pink blush on both cheeks. Expressions are made
with eyelids, brows, and mouth only. Faces are uniform across all avatars, so identity comes
from hair, skin, clothes, and accessories.

Shading is a **soft 5-step toon ramp** that reads as matte clay, with a thin outline that is a
**darker shade of each surface's own colour**. Outlines are never black.

### 9.2 Customisation axes (locked)

Source of truth: `src/lib/avatars.ts`.

| Axis | Options | Notes |
|---|---|---|
| Body | **1**, unisex | One shared body and animation set. Presentation comes from hair and clothes |
| Skin tone | **8** (`SKIN`) | Sampled from the concept sheet's swatches |
| Hair style | **6**: crop, swept, bob, ponytail, bun, curly | The most expensive axis to add to |
| Hair colour | **8** (`HAIR`) | Includes navy and ginger |
| Top | **6**: hoodie, sweater, cardigan, track jacket, sweatshirt, puffer vest | |
| Top colour | **8** (`OUTFIT`) | Cream, sage, teal, forest, rust, rose, denim blue, plum |
| Trousers | **5** (`PANTS`) | Denim, charcoal, beige, plum, navy |
| Accessories | **6**: glasses, headphones, beanie, hair clips, scarf, backpack | Up to 2 per avatar. Beanie hides clips. Backpack hangs on the chair back when seated |
| Resting face | focused or determined | The only face choice. Everything else is status-driven (§9.5) |

The **10 presets** in `AVATARS` are the approved example cast and the fallback picker
(§2.3). Avatar selection is stored as a full `CharacterSpec` in the profile, not as a preset
index, once the builder ships.

### 9.3 Construction (how a character is built)

Follow this exactly when adding hair, clothes, or accessories.

- **All geometry is procedural, in code.** Primitives (rounded boxes, spheres, capsules,
  cylinders, tori, lathes, tubes, and sculpted shell geometry for hair) are added to a
  per-bone `GeoBuilder` with a **baked vertex colour** and a transform.
- **One skinned mesh per character.** Every part belongs rigidly to one of 14 bones
  (`hips, torso, head, shoulderL/R, elbowL/R, handL/R, hipL/R, kneeL/R, bag`) with weight 1.
  All parts merge into **one geometry**. A character is **one body draw + one outline draw +
  one face decal draw** (+1 for a held item when shown).
- **Geometry is cached per spec** (`specKey`) and shared between instances. An instance owns
  only its bones. Seated and standing are separate cache entries (they differ only in where the
  backpack hangs).
- **Materials are shared by every character:** one `MeshToonMaterial` with vertex colours and
  the clay ramp `[138, 176, 214, 240, 255]` (linear filter), and one outline shader that
  inflates along the normal by `0.0085` and tints each vertex `colour × 0.42`, skinned like the
  body. Parts too small to outline (drawstrings, buttons, glasses rims) pass `outline = 0`.
- **Faces** come from one procedurally drawn **canvas atlas** (4×2 cells, 256px each, one cell
  per expression) mapped onto a thin sphere patch on the head bone. Changing expression or
  blinking only swaps which pre-built material (same image, different UV offset) is on the
  patch. The GPU holds one face texture for the whole app.
- **Key proportions** (scene units). Change these only with a new decision.

| Constant | Value |
|---|---|
| Head radius / scale | `0.31`, scaled `[1.1, 0.9, 0.97]` |
| Head height above torso | `0.75` |
| Torso height above hips | `0.2` |
| Upper / lower arm | `0.25` / `0.25` |
| Thigh | `0.24` |
| Root height, standing | `STAND_ROOT_Y` (soles on the floor) |
| Root height, seated | `0.17` (feet on the floor from a chair) |
| Table top | `0.69` |

- **Budget per character:** 3–4 draw calls, **≤ 13,000 triangles** (today: 7.4k–12.6k across the
  10 presets). The gallery header prints these numbers. Check it after every change.

### 9.4 Adding a new part (guide)

1. Add the option to the type and list in `src/lib/avatars.ts`. Use colours from the locked
   palettes (§22.2); new fixed accessory colours go in the `ACC` table.
2. Build it in `bodyGeometry` on the correct bone, from the existing primitive helpers. Keep it
   chunky: smallest feature about `0.01` units, rounded corners everywhere.
3. Hair must cover the scalp from every angle (front, 3/4, side, back, high angle from behind)
   and must leave room for headphones and the beanie. Use `hairAt()` so accessories sit on the
   surface.
4. Add it to the gallery section it belongs to in `src/dev/gallery.ts`, then review all views.
   Check the "seated from behind" row too, because that is how most people see each other.
5. Check the triangle budget in the gallery header.
6. Never add textures to characters other than the face atlas.

### 9.5 Expressions (system-driven)

The 8 expressions in the atlas are: focused, smile, sleepy, blink, surprised, annoyed,
exhausted, determined. **Users never pick an expression** except the resting face. The system
chooses:

| Situation | Expression |
|---|---|
| Focusing | Resting face (focused or determined) |
| On break, chatting or idle | smile |
| On break, leaning back or drinking | sleepy |
| Every 2–6.5s, ~0.14s | blink |
| Overhead stretch | blink (eyes closed) |
| Long focus (> 45 min into a session), during `tired_stretch` | exhausted |
| A focus phase just ended, for ~1s | surprised |
| Never shown automatically | annoyed |

`annoyed` exists in the atlas but the system never shows it. A stranger appearing annoyed in a
shared room reads as directed at other people.

### 9.6 Animation: procedural, seeded

All motion is procedural, driven by code on the bones. There are no keyframed clips and no
animation files.

**Seated (built):** a pose system sets hand targets, torso lean, sway, and head pitch/yaw/roll,
all damped toward targets each frame. Arms are solved with **analytic two-bone IK** with the
elbows pulled toward an outward/down pole. Acts: `write` (pen visible), `read` (page turns
that rotate the actual book page), `type`, `sip` (the table mug moves into the hand), plus
breathing (`torso.scale.y` ±1.2%), idle head tilts, and blinks.

**To build:**

1. `sit_down` / `stand_up`: chair slides back, hips/knees blend between seated and standing
   bone angles, root height blends between `0.17` and `STAND_ROOT_Y`.
2. `walk`: a **procedural gait on the leg bones**. Hip and knee angles follow a gait wave whose
   **phase is locked to distance travelled, not time**, so feet never skate. Add a small body
   bob, opposite arm swing (IK hand targets), and a slight lean into acceleration.
3. Steering: paths come from **weighted steering intents**: follow the waypoint path, avoid
   furniture, avoid other avatars, stay in the room. Combine them and change speed and heading
   gradually. Instant changes make a figure slide.
4. Break poses at each destination: `lean` (armchair), `drink` (standing with mug), `phone`,
   `look_out` (at the window), `browse` (bookshelf, hand raised to a spine).
5. `tired_stretch`: overhead stretch and hands-behind-head, occasionally while focusing.

**Per-avatar variation, at zero art cost:** typing speed, blink timing, fidget frequency,
animation phase, gait length, and walking speed, all **seeded from the device UUID** so a
returning regular moves the same way every session.

**Hard rule:** no per-frame allocation. Scratch vectors and matrices are module-level and
reused (see `character.ts`).

### 9.7 Entrance

On first join, and on return after an absence: the avatar **walks in through the door, crosses
to its seat, pulls the chair out, sits, and starts.** Any free seat. Under reduced motion, the
avatar simply appears seated.

---

## 10. Scene: the study hall

### 10.1 Camera and view

- **A perspective camera orbiting a 3D diorama**, looking down at about 25–30° on the long
  table. The room is cut away on the camera side like a dollhouse: back wall and left wall
  visible, no front or right wall.
- Framing **adapts to aspect ratio** continuously. Portrait uses a wider FOV (≈40°), a steeper
  angle, and a camera swung further round the table. Landscape uses ≈30° and a flatter angle.
  The camera distance is solved so the table and seats always fit.
- **Ambient camera life:** a very slow drift (a few hundredths of a radian), mouse parallax on
  desktop. All of it is disabled under reduced motion.
- **Drag to look around**, clamped (±0.45 rad horizontally, −0.15…+0.22 vertically), springing
  back to the default framing a few seconds after release. The default framing is the one that
  always looks correct; dragging exists to look closer, never as the main way to see the room.
- **Pinch to zoom on portrait**, clamped to a minimum and maximum. No zoom on landscape.

### 10.2 Layout

- **One long shared study table** in the centre, **10 seats, 5 per side**, each with a wooden
  chair and a coloured seat pad (each seat's pad colour is different).
- **Seat fill order is from the middle outward** (`SEAT_FILL_ORDER`), so small rooms look
  gathered, not scattered.
- Each seat has its **own prop set** that differs from the others (§10.4) and its **own
  reading lamp** (§10.3).
- Room layout is **data**: seat positions, prop sets, break destinations, and walk waypoints
  live in a map definition (§12), not hard-coded across files.

### 10.3 Lighting

**One fixed time: night.** Warm light inside, cool blue outside. There is no day/night cycle,
no sync to local time, and no time-of-day presets in v1.

- **Hemisphere light**: cool blue sky (`#6d82c4`), dark plum ground (`#2a1d26`).
- **Moonlight**: a cool directional light (`#9cb8ff`) from behind the window, upper left. It is
  the only shadow caster, and only on the high tier.
- **Warm fill** (`#ffd9b0`) from the front right.
- **A small number of real point lights** (today: two shared table lamps and the floor lamp)
  for the warm pools. **Never one real light per seat.**
- **Per-seat status lamps are fake light:** an unlit shade mesh, an additive glow sprite, and an
  additive light-pool decal on the table, all using the one shared pre-baked radial glow
  texture. Turning a lamp off hides those three. They cost no lighting.
- Lamps flicker very slightly (intensity noise of a few percent).
- **No post-processing** in v1: no bloom, no SSAO, no `EffectComposer`. The glow is faked with
  additive sprites and the outline is geometry.

### 10.4 Rain and clear are two lighting states

Weather is not particles drawn on top. Rain and clear are **two distinct states** of the window
shader and the lights.

| | Rain (30%, the event) | Clear (70%, the default) |
|---|---|---|
| Window | Rain streaks outside, droplets running down the glass, moon haze behind cloud | Moon disc sharp, stars, no streaks or droplets |
| Moonlight | Dimmer, softer | Brighter, crisper shadows on high tier |
| Overall grade | Cooler, bluer | Slightly more neutral |
| Audio | Rain loop available and tied to state | Rain loop off |

The weather crossfade lasts about 3 seconds (instant under reduced motion).

### 10.5 Room inventory

Transcribed from the approved scene. Build every item.

**Shell**
- Wood plank floor with a large rug under the table and a dotted border trim
- Back wall with a **large arched window** (rain shader pane, frame, mullions, sill)
- Curtains gathered at both sides of the window, and **fairy lights** strung around the arch
- Left wall with wainscot and trims
- **A door** (to build; the entrance walk starts here)

**Furniture**
- The long study table with 10 chairs and coloured seat pads
- 10 per-seat reading lamps (to build; replace the two shared lamps' status role)
- A tall **bookshelf** on the left wall with individually varied, coloured book spines, some
  leaning
- A **terracotta armchair** with a **floor lamp** beside it (front left)
- A **bed** in the back-right corner with a striped blanket and pillows
- A **corkboard** with coloured sticky notes, and framed pictures on the left wall

**Per-seat props** (different per seat): open notebook with written lines, open book with a
turnable page, laptop (light or dark), mug (each a different colour) with rising steam, pen,
backpack hung on the chair back for avatars that wear one.

**Greenery:** a big leafy plant by the window, sill plants, a trailing plant and jar on top of
the bookshelf.

**Ambient life:** floating warm dust motes (high and medium tiers), steam rising from each
occupied seat's mug, twinkling fairy lights.

**Animals: keep these**
- A **ginger cat** and a **black cat**, built in the same toon/outline style. Today there is one
  cat asleep on the bed. Ship both. They occasionally stretch, walk a few steps along fixed
  paths, and settle again. This has the highest charm-per-effort ratio in the scene and must
  ship.

**Break destinations** (with slot counts): armchair (1), window (2 standing), bookshelf (2
standing), edge of the bed (2 seated), standing by the table end with a mug (3).

**Removed from the current scene:** the **always-present armchair reader**. A human figure that
is not a real participant breaks §19 ("never invent presence"). The armchair becomes a break
destination. Cats are fine, because nobody mistakes a cat for a participant.

### 10.6 Adding a prop or furniture piece (guide)

1. Build it from primitives in a `GeoBuilder` with baked colours from the scene palette
   (§22.1). Round every corner (`roundedBox` with a radius). Nothing should look CAD-sharp.
2. Static pieces **merge into the room's static mesh**. Never add a separate mesh per static
   prop.
3. Use the room toon material (5-step ramp, nearest filter) and the shared fixed-colour outline
   (`#171226`). Turn outlines off on tiny or flat details.
4. Ground it with a `blobShadow` (soft dark radial decal) instead of relying on the shadow map,
   which is off on medium and low tiers.
5. Anything that glows is an unlit material plus a `glowSprite` and/or `lightPool`, never a new
   real light.
6. Moving parts (a page, a mug) are separate small meshes that are reused. Never allocate
   them per frame.

---

## 11. Audio

### 11.1 Licensing: CC0 only. Non-negotiable.

**Every audio file is CC0.** Freesound filtered to CC0, plus Kenney audio. No CC-BY, no
CC-BY-NC, no third-party music, no unlicensed loops.

Ambient rain and room tone are field recordings nobody owns. **No music ships in v1.** Looped
music carries the most copyright liability of anything in the app, and registered music can
trigger Content ID claims even on a 30-second loop.

### 11.2 Provenance

Maintain `public/audio/CREDITS.md` recording every file's source URL, author, and licence for
**all** downloads, even though CC0 does not require attribution. This is the prerequisite for
adding licensed music later.

### 11.3 Architecture

- **One** `AudioContext` for the app, created and `resume()`d on the first user gesture (an iOS
  requirement).
- **Lazy decode on first play**, then cache the `AudioBuffer`. Never decode per interaction.
- Play via `AudioBufferSourceNode` with `loop = true` and explicit `loopStart` / `loopEnd`.
- Throttle ambience crossfades.
- **Synthesize UI chimes**: ~200ms sine/triangle envelopes, zero licence risk.
- Synthesized rain and room tone (as today in `src/audio/engine.ts`) are acceptable stand-ins
  until CC0 loops are sourced.
- **Off by default.** Prominent ambience toggle.
- **Format: MP3 or AAC-in-MP4. Not Opus.** Safari's Opus support is unreliable.

### 11.4 Sound inventory

| Sound | Type | Length |
|---|---|---|
| Library room tone | loop | 8–12s |
| Rain on glass | loop, tied to §10.4 | 10–15s |
| Distant traffic | loop | 8–12s |
| Café murmur | loop | 8–12s |
| Thunder | one-shot, rain state only, rare | 2–4s |
| Page turn, chair creak, laptop open/close, chair slide | one-shot | 0.2–1s |
| Join / leave / status-change cues | one-shot, synthesized | ~200ms |
| UI chimes | one-shot, synthesized | ~200ms |

Four ambience loops is the full library.

### 11.5 Budget: hard limits

| Limit | Value |
|---|---|
| Audio files, total | **< 3 MB** |
| Decoded audio in memory | **< 40 MB** |

A 4-minute stereo MP3 decodes to ~80MB and crashes iOS Safari. Loops must be short and mono.

### 11.6 Social cues

Soft cues on join, leave, and status change. Personal audio only: they are part of the user's
own ambience, not a room broadcast.

---

## 12. Maps

### 12.1 The study hall is the only map in v1

The all-night café is **map 2**. The dorm (bed, floor cushions, a wall of trailing plants) is a
natural **map 3**.

The map system is **data from day one**. A map is:

- a static geometry builder (shell, furniture, greenery),
- a **seat map** (10 seat transforms, each with a prop-set id),
- a **lighting config** per weather state (light colours and intensities, window shader
  uniforms),
- a **break-destination list** with slot transforms and a pose per slot,
- a **waypoint graph** (door → seats, seats → destinations),
- camera framing parameters for portrait and landscape.

Adding the café is authoring work, not re-engineering.

---

## 13. Interface

### 13.1 Art direction

The interface is **modern, rounded, and quiet**. It is chrome around the scene, not part of it.

- **Opaque surfaces.** Panels are solid or near-solid dark navy (`rgba(15, 23, 41, 0.9)` or
  `#131e35`) with a hairline warm border (`rgba(255, 238, 214, 0.1)`) and a soft drop shadow.
- **No glass. No `backdrop-filter` anywhere.** Blur over a 3D canvas is expensive on mobile and
  is rejected.
- **Rounded geometry:** fully rounded pills for the timer and control dock, 22px corners on
  sheets, 14px on cards and inputs, 10px on small elements.
- **Typeface: Manrope** (400–800). Timer numerals use tabular figures.
- **Line icons** at 20–24px with a consistent stroke, in `src/components/Icon.tsx`.
- **Colour roles:** amber = focus, teal = break and "you", muted grey = away. Every colour role
  also has a shape or label (§6.1).
- **Name labels** float above each head as small dark pills; your own label is teal.
- Touch targets are at least **44px**. Respect safe-area insets.

### 13.2 Theme

**Dark theme only in v1.** The scene is a warm room on a dark night; a light UI over it looks
cheap. The UI palette is in §22.3.

### 13.3 Controls

**Top centre:** timer pill: large numerals, phase label ("focus" / "break"), and a thin progress
bar along the bottom in the phase colour.

**Top left:** back / leave, and the "move to another room" action.

**Bottom centre:** control dock:
- Ambience (menu: 4 loops + off)
- Weather: `Room · Rain · Clear` segmented control (§4.2)
- Master mute and volume
- Hide UI: full-bleed scene, chrome fades away (shortcut H)
- Fullscreen
- Participant count, opening the panel
- **Frame-rate cap** (native / 60 / 30 / 20), §17.4

**Mobile portrait:** the dock holds Ambience, Weather, Mute, and Hide UI. Fullscreen,
participant count, and the frame cap move into the sheet.

There is **no away toggle** (§6.2).

### 13.4 Side panel

Right rail on landscape; **bottom sheet** on mobile portrait, dragged up to ~55% height.

Two tabs:
- **Chat**: message list with avatar thumbnail, name, timestamp, and an input row.
- **Participants**: `N online`, then one row per person: avatar thumbnail, name, status with
  shape and label (§6.1), and a local mute/block menu.

Avatar thumbnails are rendered **by the same character builder** as the scene
(`renderAvatarThumbs`), never as separate artwork.

### 13.5 Reduced motion

Honour the OS setting. It disables entrance walks (avatars appear seated), break walks (avatars
appear at their destination), camera drift and parallax, panel transitions, and grade
interpolation. Ambient shader motion slows to 30%. **This is an accessibility requirement, not
an option.**

### 13.6 Settings architecture

Settings are **schema-driven**. Every setting is declared once with its default, valid range,
control kind, and which subsystem it affects. The control UI is **generated from that schema**.

**Precedence is `defaults ⊕ weather ⊕ user edits`**, resolved into a single live object that the
scene reads every frame without knowing a settings UI exists.

- A **weather preset** writes only the fields it owns (window shader uniforms, moonlight,
  grade). It does not touch the user's volume.
- A **user edit** persists and overrides the preset for that field **until the user touches that
  same field again**, which hands control back. This is exactly how `Room · Rain · Clear` behaves.
- **Persistence is sparse:** only the user's edits are stored, never a full snapshot.
- Performance preferences (frame cap, quality tier override) live in a **separate store**: not
  undoable, not affected by weather, not cleared by "reset all".

Per-section reset, versioning, and rejection of unknown values on load are all required.

---

## 14. Chat

### 14.1 Gating

- **Only participants on break may post and read.**
- While focusing, the message list is empty and the input is disabled with a short line
  explaining why.
- An **unread badge appears the moment you enter a break.** That is the reward for coming back.

### 14.2 Speech bubbles

- Bubbles render **above the avatar's head, visible to everyone**, including people who are
  focusing and cannot read them. For them, the bubble shows a soft "…" pill: locked content is
  visibly locked.
- Bubbles are DOM elements positioned from the projected head position, like name labels.
  They are not 3D text.
- A room in motion reads as alive. Hiding all chat from focusing participants would make the
  room feel dead to most people in it.

### 14.3 Storage: ephemeral

- In memory only. **Last 100 messages.**
- **Wiped when the room empties.**
- Never written to the database. No user-generated content is ever persisted.

### 14.4 Local safety controls

- **Mute** and **block**, persisted locally. Block is client-side: their messages and bubbles
  are hidden.
- Fast exit and rejoin is the primary safety mechanism, not reporting.

### 14.5 Message constraints

Server-side: character cap (280), token-bucket rate limit per session, link blocking in the
first N messages. See §20.

---

## 15. Identity

### 15.1 No accounts

Auto-generated display name, editable inline. A **device UUID** in local storage is the
identifier. No email, no password, no sign-up. Supabase anonymous sign-in may back the device
identity for RLS, as long as the user never sees an account.

### 15.2 Onboarding

The entry screen is one card: name, character picker (or builder), and one button. No
explainer screens.

Then **drop the user straight into a room.** 3–4 **skippable coach marks** anchored to the real
UI explain:
1. Your timer, and that it is yours alone
2. **The seat lamp shows status.** This is the one thing a user must understand, or the room is
   decoration
3. Break chat: you can only talk on your break
4. Ambience and weather controls

### 15.3 Fields

| Field | Requirement |
|---|---|
| Display name | **Required.** Auto-generated, editable. |
| Country | **Required.** Picked from a list. |
| City | **Optional.** Free text. |
| Character | **Required.** Defaults to a random approved preset. |

### 15.4 Name policy

1–20 characters. No newlines. No emoji spam. A blocklist covering impersonation and badge
characters. **Names are rendered over avatars and in a public list, so this is enforced
server-side.**

### 15.5 Country, not free-text origin

Country comes from a picker. **City is never rendered over the avatar.** Full profile detail is a
paid-tier feature.

---

## 16. Analytics

- **Server-side**, keyed to the device UUID.
- Required: the paid feature "see how many times others have studied" is **impossible** without
  server-side history.
- **Completed focus sessions only.** Early exits do not record.
- **No streak counter.**
- **90-day retention cap**, then prune.
- Views: **today**, **7 days**, **30 days**.

---

## 17. Technical architecture

### 17.1 Stack

| Layer | Choice |
|---|---|
| Build | **Vite** |
| UI | **React + TypeScript** |
| Styling | Plain CSS with design tokens (`src/styles/tokens.css`) |
| Scene | **three.js (WebGL)**, plain and imperative, one `<canvas>`, code-split |
| Hosting | **Cloudflare Workers** (static assets, `wrangler.jsonc`) |
| Backend | **Supabase**: Postgres + Realtime |
| Realtime transport | **Supabase Realtime Broadcast** |
| Tests | **Vitest**: simulation math only (timer, seats, gait, steering), never rendering |

**React renders the chrome only. It is never in the scene's render loop.** The scene module
exposes a small imperative handle (`setSeats`, `setWeather`, `setLabelsVisible`, `dispose`), and
React calls it.

The scene chunk (three.js + `src/scene/`) is **lazy-loaded** so the entry screen never waits on
it.

### 17.2 Rendering and quality tiers

The 3D scene renders at device resolution, **capped per quality tier**:

| Tier | DPR cap | Antialias | Shadow map | Dust motes | Default frame cap |
|---|---|---|---|---|---|
| **High** | 2 | Yes | Yes (moonlight, 1024², PCF soft) | Yes | 60 |
| **Medium** | 1.5 | Yes | No (blob shadows only) | Yes | 60 |
| **Low** | 1 | No | No | No | 30 |

- **Detection:** desktop with ≥ 8 cores starts on high, other desktops on medium, phones with
  ≥ 8 cores and ≥ 6 GB start on medium, other phones on low. `?quality=` overrides it for
  testing.
- **Adaptive downgrade:** every 90 frames, if the average frame time exceeds the tier's limit
  (1/45 s on high, 1/32 s on medium) after the first 4 seconds, drop one tier. Never upgrade
  automatically mid-session.
- `outputColorSpace = SRGBColorSpace`, `toneMapping = NoToneMapping`. Colours in code are the
  colours on screen.
- Recompute size on a `ResizeObserver`. Reframe the camera on every resize.

### 17.3 Draw order and materials

There are no intermediate render targets in v1. The frame is one forward pass:

1. Static room (one merged mesh + its outline mesh)
2. Seat props (merged per seat; moving parts are small separate meshes)
3. Characters (body, outline, face decal each)
4. Window pane (rain/clear shader)
5. Additive glow: lamp sprites, light pools, fairy lights, steam, motes (`depthWrite: false`,
   `AdditiveBlending`, `renderOrder` 1–2)
6. DOM overlay: name labels and speech bubbles

**Shared materials:** one room toon material, one room outline, one unlit material, one
character toon, one character outline, the face materials, one glow texture. No other
materials without a recorded reason.

### 17.4 The loop: fixed simulation step, decoupled render

**The simulation steps at a fixed 60Hz**, independent of display refresh:

```
accumulator += min((now - previousTime) / 1000, 0.1)
while (accumulator >= FIXED_STEP) { world.update(FIXED_STEP, t); accumulator -= FIXED_STEP }
```

Movement, gait, and animation stay identical at 30, 60, or 120Hz. Clamp the accumulator at
100ms so a backgrounded tab does not spiral.

**Frame limiting:** the rAF loop keeps running and the limiter decides whether to render:

- Skip the tick if less than `1000 / cap` ms has elapsed, with **1ms early tolerance**.
- **Advance `lastRender` along the ideal schedule** (`lastRender += steps * interval`), never
  snapping to `now`, so jitter never builds into drift.
- If a gap exceeds **250ms**, the tab was hidden or the thread stalled: reset rather than
  fast-forward.
- `previousTime` advances **only on rendered frames**.

**User-selectable frame cap:** `native · 60 · 30 · 20`, persisted locally. The tier sets the
default; the user's explicit pick always wins.

### 17.5 Performance prohibitions

**Hard rules for the render loop:**

- **No per-frame allocation.** Reuse geometry, materials, vectors, matrices. Scratch objects are
  module-level.
- **Never create a geometry, material, texture, or light in the frame loop.** Character
  geometry is cached per spec; disposing a character releases only its skeleton.
- **Merge static geometry.** Vertex colours, not textures. Instanced or merged meshes for
  repeated items (books, chairs, plants).
- **Fixed pools with hard caps** for particles (motes, steam, rain splashes). Exceeding the cap
  drops the oldest; pools never grow.
- **Ambient motion lives in shaders** (window rain, motes, steam, fairy lights), driven by one
  `uTime` uniform.
- **Seeded RNG everywhere**, so room variation and character personality are stable across
  reloads.
- No `getImageData` readbacks, no `toDataURL` in the room (thumbnails are rendered once, off the
  loop).
- **Stop the rAF loop entirely** on `visibilitychange` → hidden.
- Dispose everything on unmount: renderer, geometries, materials, textures, observers,
  listeners.

### 17.6 Realtime

- **Supabase Realtime Broadcast** for status changes and chat. **Client-side Broadcast only:
  never written to Postgres.**
- **The member roster is a Postgres table with `postgres_changes`** for join and leave. **Not
  Supabase Presence.** Presence quotas are tight enough that ordinary application code can
  throttle the room, and a table leaves a reapable stale row instead of a ghost.
- A scheduled job reaps roster rows with no heartbeat past the away threshold.
- **`profiles` table** for name, country, city, and the `CharacterSpec`, keyed to the device UUID.
- **Sessions table** for analytics.
- **Seat assignment is deterministic** on every client from the roster (`assignSeats`): earlier
  joiners keep their seat; later conflicting joiners take the next seat in fill order.

### 17.7 The 7-day pause problem

**Supabase free projects pause after 7 days of low database activity and return HTTP 540, with
no auto-wake.**

Mitigation, all required:
- A **daily keep-alive request** from a scheduled CI job.
- **Every Supabase call wrapped in retry with backoff.**
- **HTTP 540 handled as a user-facing "retry in about 60 seconds"**, never as a crash.

---

## 18. Performance contract

### 18.1 Frame rate

**60fps sustained on mid-range and above.** The reference floor is **iPhone 12 / Snapdragon 778G
class.**

Render cost now scales with resolution, which is why DPR is capped per tier (§17.2). The
degradation order when frames are slow is:

1. Shadow map off (high → medium)
2. DPR cap 2 → 1.5 → 1
3. Dust motes off, antialias off (→ low)
4. Frame cap to 30
5. **Never** the simulation step, and never silently below the user's explicit cap

**Scene budgets** (measure on the high tier, including the shadow pass):

| Metric | Budget |
|---|---|
| Draw calls, full room with 10 people | **≤ 200** (today ~185, measured on an M-series Mac) |
| Triangles per character | **≤ 13,000** |
| Triangles, full room with 10 people | **≤ 250,000** |
| Real lights | **≤ 4** (hemisphere, moon, fill, plus point lamps) |
| Textures | Face atlas, glow texture, shadow map, nothing else |

### 18.2 Load and weight

| Metric | Target |
|---|---|
| Interactive entry screen, cold cache, throttled Slow 4G | **< 2.5s** |
| Entry JS (without three.js), gzipped | **< 120 KB** |
| Scene chunk (three.js + scene), gzipped | **< 250 KB** |
| Total transfer including audio | **< 1.5 MB** |
| Audio files | **< 3 MB** (§11.5) |
| Steady-state memory | **< 120 MB** |

There are no image or model assets for the scene; everything is built in code at load. Keep it
that way.

### 18.3 Idle

A two-hour session must not drain the battery. The render loop stops on `visibilitychange`; no
work happens while hidden; `previousTime` resets on resume so the hidden interval is never
fast-forwarded. In hide-UI ("ambient") mode, the frame cap drops to 30 unless the user picked
one.

---

## 19. Network failure

The app's value is other people being there, so connection loss is the failure it most needs to
handle well.

- **Your timer keeps running** on local wall-clock time and survives reloads.
- **Other participants grey out** (desaturated, lamps dimmed) with a small reconnect indicator.
- **Your own status in the panel becomes a hollow ring.**
- The app **never invents presence it cannot verify.** A visible "reconnecting" state is
  mandatory. No NPC people (§10.5).
- On reconnect, the room repopulates from the roster table.
- **Demo mode** (no Supabase env vars) uses friendly bots for local development only. It must be
  labelled as demo mode and must never run in production.

---

## 20. Abuse protection

All layers are free. All are required.

### 20.1 Premise corrections

- **Cloudflare Tunnel is not used.** There is no origin to hide.
- **Cloudflare's free WAF is not the primary defence.** Turnstile, the Workers rate-limiting
  binding, and the application layer are.
- **No domain purchase is required.** Turnstile works on a `workers.dev` hostname.

### 20.2 Cloudflare: enable these

- **Turnstile in Managed mode** on exactly two routes: **chat send** and **join / identity
  create**.
  - Siteverify server-side is **mandatory**. Tokens are **single-use** and **expire after 300
    seconds**: auto-refresh, and re-verify safely with an idempotency key after a network
    failure.
  - Verify **before** doing any work, and **fail closed** on a bot verdict.
- **Workers Rate Limiting binding** for per-IP and per-session limits.
- **Bot Fight Mode** stays **off**: it cannot be scoped and may challenge real mobile traffic.

### 20.3 Application layer

- **Token bucket** message caps per session, **not** a fixed window.
- A **separate content-normalised bucket** to catch copypasta across rotating identities.
- **A few seconds' delay** before a session's first message can send.
- Server-side character caps. **Link blocking** in the first N messages.
- **Honeypot field** on any form.
- **Degrade, don't block.** Suspicious behaviour is slowed and cooled down, never hard-errored.
- **No kick, no ban, no report queue in v1.** Local mute/block plus fast exit (§14.4).

### 20.4 Keep limiters independent

**Never concatenate IP and session ID into one rate-limit key.** Run two independent limiters
and AND them.

### 20.5 Realtime discipline

Supabase's Realtime quotas are **project-wide**. A script opening 200 connections can evict every
real user, and bot traffic can trigger `RealtimeDisabledForTenant`, which is a total outage.
**Cloudflare does not protect Realtime at all.**

- Set internal client caps **well below** Supabase's ceilings.
- **Coalesce status updates.** Do not re-announce on every render.
- **Back off exponentially on reconnect.**

### 20.6 The real risks

1. Realtime is the real attack surface and it bypasses Cloudflare entirely.
2. Determined browser automation will not be stopped on free tiers. Accepted: rooms are
   ephemeral and chat is never persisted.
3. Shared free infrastructure is the tail risk.
4. Revisit this section if auth and payments are added.

---

## 21. Art pipeline

### 21.1 Everything is built in code

**There are no sprite sheets, no texture atlases (except the face atlas), and no model files.**
Every object in the scene (room, furniture, props, characters, cats) is built at load time from
code primitives with baked vertex colours, then merged.

That gives us:
- one consistent look, because everything shares the same two toon ramps and outline rule;
- near-zero asset weight;
- parametric variation (seat props, book spines, plant leaves) from a seeded RNG;
- characters that are fully combinatorial with no per-avatar art.

### 21.2 Authored vs. procedural

| Element | Method |
|---|---|
| Room shell, furniture, props, plants, cats | **Code-authored geometry** (primitives + baked colour), merged |
| Book spines, plant leaves, prop variety per seat | **Seeded procedural variation** on authored builders |
| Room layout, seats, destinations, waypoints | **Map data** (§12) |
| Rain, window, motes, steam, fairy lights | **Shaders and GPU points** |
| Character identity (hair, clothes, accessories) | **Code-authored parts** on the skinned body (§9.3) |
| Faces | **Procedurally drawn canvas atlas** (§9.3) |
| All motion | **Procedural** (IK, gait, steering), seeded |

### 21.3 What AI can and cannot do

- **Concepts and exploration only.** `docs/character-sheet.png` is a concept. It was used to pick
  proportions, styles, and swatch colours, and it is never shipped.
- Snap any colour taken from a concept to the locked palettes (§22).
- **Never ship AI-generated images or models** in the app.

### 21.4 Third-party assets

If a third-party asset is ever needed: **CC0 only** (Kenney is safe). **Avoid CC-BY-SA and GPL.**
**itch.io "free" does not mean commercial use**; check each licence. Record everything in
`CREDITS.md` next to the audio credits.

---

## 22. Palettes (locked)

Every colour in the scene and UI comes from these lists. Add a colour only by adding it here.

### 22.1 Scene

| Family | Values | Use |
|---|---|---|
| Night | `#0b1322` (background), sky `#1c3360`→`#060d24`, hemisphere `#6d82c4` / `#2a1d26`, moon `#9cb8ff` | Everything outside, the void around the diorama |
| Lamplight | `#ffcf86`, `#fff0c8`, `#ffd79a`, `#ffd9a0`, fairy `#ffc46b`, fill `#ffd9b0` | Lamp shades, glows, light pools, motes |
| Wood | `#9a6440`, dark `#6e4430`, table `#b97c4c` / `#8f5a36`, shelf back `#4a3027` | Floor, table, chairs, shelves |
| Cream | `#e7d9bd`, `#efe4cf`, `#f6efe0`, `#f3ead7` | Lamp bases, bedding, pages |
| Greenery | `#3f7d55`, `#5a9a64`, `#4f8f5e`, `#3f6b3f`, pot `#c7653f` | Plants |
| Accent textiles | armchair `#b85f45` / `#a5523b` / `#d0735a`, blanket `#4f6fa0`, `#e3a948` | Upholstery and bedding |
| Seat pads (10) | `#d9a441 #c96f6a #3f8f8a #e7d9bd #8a6aa8 #d4844e #5d8fb8 #b9c27a #c75b78 #4a9b7f` | One per seat |
| Mugs (10) | `#f4efe4 #3f8f8a #d97a76 #e3a948 #33507a #f4efe4 #9a86c4 #c96f4a #7fa38a #2f3d4f` | One per seat |
| Book spines (12) | `#b6584a #3f6b8a #d9a441 #4f7d5c #8a6aa8 #c97a4a #2f4a6b #e2c79a #6e3d5c #3f8f8a #a8473f #d6cbb0` | Shelves and desk books |
| Outline | `#171226` | Room objects only |

### 22.2 Characters

From `src/lib/avatars.ts`, sampled from the concept sheet's swatches.

| Axis | Values |
|---|---|
| Skin `SKIN` | `#f1c6a5 #e2b18f #d59f7d #c68a65 #b87c57 #a56c52 #6e4430 #482e24` |
| Hair `HAIR` | `#4a3329 #51362a #754934 #946140 #d9b38e #a68169 #3b424f #c0624b` |
| Tops `OUTFIT` | `#ebd4b9 #798475 #456360 #3f4e44 #b76548 #c87966 #617b92 #6a495d` |
| Trousers `PANTS` | `#55627a #49454b #d8c7a8 #64434e #3f4a5c` |
| Fixed accessories | glasses `#523e30`, headphones `#4c5448`, beanie `#8a4630`, clips `#dda063` / `#6f7a70`, scarf `#3c5350`, bag `#646f62`, strap `#7a5236` |
| Shoes | upper `#efe7da`, sole `#d6c9b4`; drawstrings `#f2ead8` |
| Face ink | eyes `#261a15`, iris `#5a3a28`, brows `#3a2820`, mouth `#6e3226`, blush `rgb(240,138,116)` |
| Outline | each vertex's own colour × 0.42 |

### 22.3 Interface

From `src/styles/tokens.css`.

| Token | Value | Use |
|---|---|---|
| `--bg` / `--bg-2` | `#0b1322` / `#0f1a2e` | Page background |
| `--surface` / `--surface-2` / `--surface-solid` | `rgba(15,23,41,.9)` / `rgba(28,40,66,.92)` / `#131e35` | Panels, dock, sheets |
| `--line` / `--line-2` | warm white at 10% / 18% | Hairline borders |
| `--text` / `--text-2` / `--text-3` | `#f5eddf` / `#c2bbae` / `#9198ab` | Text |
| `--amber` / `--amber-2` | `#f2b45a` / `#ffcf86` | Focus, primary buttons, focus rings |
| `--teal` | `#62d3c3` | Break, "you" |
| `--rose` | `#ef8f8f` | Errors |
| `--away` | `#8b93a7` | Away |
| Radii | pill / 22 / 14 / 10px | |
| Font | Manrope 400–800 | |

---

## 23. Paid tier: designed, not shipped

The visibility rules are designed and implemented now, gated by a single `tier` column that
always reads `free` in v1.

**Committed but unshipped:**
- Custom private rooms with shareable links: host controls map, weather, ambience, music, and a
  banner message. **No moderation.**
- See other participants' **exact remaining timer** and elapsed time.
- See other participants' **completed session counts**.
- Full profile detail including city.
- Additional maps (café, dorm) and possibly additional character parts.

**Shipping payments requires authentication**, because an anonymous device UUID cannot be
billed or recovered. Auth is its own project and conflicts with the no-account pitch. It is out.

---

## 24. Decisions explicitly rejected

Recorded so they are not re-argued.

| Rejected | Why |
|---|---|
| The v1 pixel-art direction | Replaced by the approved 3D toon diorama. The 3D characters can show expression, posture, and walking at a readable size, which the pixel avatars could not. |
| A shared room Pomodoro cycle | Users rejected it; autonomy wins. Collective feeling comes from `focusDensity` instead. |
| A lobby / room list / user-created public rooms | Spreads people thin. Density is the product; assignment is automatic. |
| Sync to the user's local time, day/night cycle, time-of-day presets | Rejected outright. One fixed night. |
| Glass / `backdrop-filter` UI | Expensive over a WebGL canvas on mobile, and not the look. |
| A light theme | A light UI over a night scene looks cheap. |
| Post-processing (bloom, SSAO, DOF) | Costs a full-screen pass for something additive sprites already fake well. |
| One real light per seat | Ten point lights wreck mobile performance. Seat lamps are faked (§10.3). |
| GLTF models / external 3D assets | Breaks palette and style consistency and adds weight. Everything is built in code. |
| PBR materials (`MeshStandardMaterial`) | Wrong look and more expensive. Toon ramps only. |
| Two body bases / gendered bodies | One unisex chibi body. Presentation comes from hair and clothes. |
| User-chosen facial expressions | Faces are system-driven so they always mean something (§9.5). |
| Showing `annoyed` automatically | Reads as hostile in a room of strangers. |
| Keyframed animation clips | Motion is procedural and seeded, which already makes every avatar different. |
| Free-roam movement | Destroys "where is everyone" legibility. Scripted destinations only. |
| An always-present NPC reader | Invents presence (§19). |
| A manual "I'm away" toggle | Away is derived from presence (§6.2). |
| Persistent chat | Moderation burden and UGC storage, for a study app. Ephemeral only. |
| Kick / ban / report queue in v1 | No moderation tooling; local mute/block and fast exit instead. |
| Ads | Not part of v1. Revisit with the paid tier. |
| Break streaks | Punishes people for one bad day. |
| Free-text city over the avatar | Visual noise, and a self-identification risk. |
| A pre-room onboarding screen | Friction before the reward. Coach marks over the live room instead. |
| Cloudflare Tunnel / a reverse proxy | No origin to hide, and it does not reach Realtime. |
| Copying nagomi's source | PolyForm Noncommercial. Reimplement the technique. |

---

## Appendix A: Current code vs. this brief

The repository was built before this brief was finalised. The **visuals match**; several
**behaviours do not**. Work through these as separate tasks. Each item says what to change.

| # | Area | Current code | This brief requires |
|---|---|---|---|
| A1 | Timer | Room-wide cycle from `rooms.startedAt` (`src/lib/timer.ts`), "Everyone shares one timer" | Per-user local timer surviving reloads (§5) |
| A2 | Rooms | Lobby with room list, named rooms, create-your-own, 25/5 and 50/10 room presets | Auto-assigned pool, fullest room first, "move room" control, no lobby (§3) |
| A3 | Away | Manual "I'm away" toggle plus auto-away on hidden tab | Derived from heartbeat only, no toggle (§6.2) |
| A4 | Status lamps | Two shared table lamps; status shown only by hiding the avatar | One faked lamp per seat; lamp on = focusing (§6, §10.3) |
| A5 | Break | Avatar stays seated and does break acts in the chair | Stand up, walk to a destination, walk back (§7, §9.6) |
| A6 | Entrance | Avatar appears seated | Walk in through a door (§9.7); the door doesn't exist yet |
| A7 | Chat | Open to everyone at all times, persisted in a `messages` table | Break-only, in-memory Broadcast, last 100, never persisted (§14) |
| A8 | Moderation | Report and kick RPCs, `room_bans`, `reports` tables | None in v1; local mute/block (§14.4, §20.3) |
| A9 | Realtime | Supabase Presence for the roster | Roster table + `postgres_changes`, Broadcast for status (§17.6) |
| A10 | Weather | Always raining; rain/room toggles are audio only | Room baseline 70% clear / 30% rain + `Room · Rain · Clear` override; build the clear state of the window shader (moon, stars, no streaks) (§4, §10.4) |
| A11 | Loop | Variable `dt` clamped to 0.1s, tier fps cap | Fixed 60Hz step + drift-free limiter + user frame cap (§17.4) |
| A12 | NPC | Always-present armchair reader | Remove; armchair becomes a break destination (§10.5) |
| A13 | Cats | One sleeping cat | Ginger and black cats with idle walks (§10.5) |
| A14 | Avatar | 10-preset picker; profile stores a preset index | Builder over the §9.2 axes; profile stores `CharacterSpec` |
| A15 | Panel status | Colour dot (amber) for focusing; hollow ring for away | Filled / half / hollow shapes + labels (§6.1) |
| A16 | Music, ads | Music manifest and button; `BreakAd` and interstitial | Remove for v1 (§2.2, §11.1) |
| A17 | Hosting | Vercel (`vercel.json`) | Cloudflare Workers (§17.1) |
| A18 | Identity fields | Nickname only | Name + country (required) + city (optional) (§15.3) |
| A19 | Focus density | Not implemented | Continuous light grade (§8.2) |
| A20 | Settings | Ad hoc prefs in the audio engine | Schema-driven `defaults ⊕ weather ⊕ edits` (§13.6) |
| A21 | Analytics | Not implemented | Sessions table, today / 7d / 30d (§16) |
| A22 | Onboarding | Not implemented | 3–4 coach marks (§15.2) |
| A23 | Copy | Entry tagline "Study with strangers on a rainy night", meta description "rainy-night study hall" | Night copy that doesn't promise rain, since most rooms are clear (§4.1) |

## Appendix B: Checklist for any visual change

Before calling a visual change done:

- [ ] Viewed in `/dev/characters` (for characters) or a demo room (for the scene) at **phone
      portrait (375×812)** and **desktop landscape**.
- [ ] Checked from behind and at the high angle. That is how most people see each other at the
      table.
- [ ] Colours come from §22. No new materials, textures, or lights without a recorded reason.
- [ ] Gallery triangle and draw-call numbers are within §9.3 and §18.1.
- [ ] Nothing allocates in the frame loop; everything created is disposed on unmount.
- [ ] Works on `?quality=low` (no shadows, DPR 1, 30fps) and still reads clearly.
- [ ] Reduced motion respected.
