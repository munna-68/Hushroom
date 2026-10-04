# Study Together — Project Brief

**Status:** v1 fully specced. This document contains decisions, not options. Where a
question was delegated to the planning agent, the decision is recorded here as final.

**Date:** 2026-10-04
**Target:** mobile-first web app, free, no accounts

---

## 0. Before you write any code

**Read the reference images in the repository root before starting any UI work.** They are
the visual and interaction source of truth for this project, and this brief does not
replace them.

Two things about them:

1. **They do not all depict the same UI.** One is the landscape / desktop composition with a
   right-hand rail. The other is a different, warmer interior at a different aspect ratio.
   Treat them as separate designs, not as two states of one screen.
2. **They are not final art.** They are the target aesthetic. Match the density, the
   lighting, the palette, and the composition language — not the specific pixels.

The room inventory, lighting model, UI layout, and status language in this brief are
transcribed from those images. Where the brief and an image disagree, the image wins on
appearance and this brief wins on behaviour.

---

## 1. What this product is

A shared study room. Up to **10 strangers** sit in the same pixel-art room, each running
their **own independent Pomodoro timer**, in silence, together.

The product is **presence, not productivity tooling.** There are no accounts, no stats
pressure, no streaks, no leaderboards, no chat for its own sake. The emotional pitch is:
*you open this and there are already nine people working, and you're one of them.*

Everything below serves that. Any feature that turns the room into a feed, or that makes a
stranger feel observed or exposed, is out.

---

## 2. v1 scope

### 2.1 In scope

- **Public room pool.** Rooms of 10, created on demand, assigned automatically.
- **Two responsive layouts** — mobile portrait (primary) and desktop/laptop/tablet
  landscape.
- **Per-user Pomodoro timer** with custom duration. Default 25/5.
- **Three-state participant status** — focusing / on break / away — rendered in-scene.
- **Weather** — room baseline plus personal override.
- **Audio** — ambience loop, weather-tied rain, social cues, personal master mute.
- **Entrance animation** — walk in through the door and sit at a free desk.
- **Avatar builder** — layered customization.
- **Break chat** — ephemeral, gated to people on break, side panel plus speech bubbles.
- **Analytics** — today / 7 days / 30 days of completed focus sessions.
- **Onboarding coach marks**, settings panel, reduced-motion support.

### 2.2 Out of scope for v1

- Accounts, authentication, passwords, email.
- Payments, subscriptions, any paid tier.
- Custom / private rooms. **This is the paid-tier feature, not v1.** See §3.
- Voice, video.
- Persistent chat history.
- Break streaks.
- Multiple maps beyond the library. **The all-night café is map 2, not v1.** See §12.1.
- Music. **Deferred to the paid tier.** See §11.4.
- Avatar facial features. See §9.3.
- Server-side moderation, kick, ban. See §8.3.

### 2.3 Scope risk — documented fallback order

This is a large v1 whose critical path is **hand-authored pixel art**, not code. The art
volume is the schedule risk. If it runs long, shed in this order, and only in this order:

1. Music channel (already deferred)
2. 7-day and 30-day analytics charts (reduce to "today" only)
3. Speech bubbles (side panel chat carries the feature alone)
4. Avatar builder (ship 2 default avatars + 4–6 whole-avatar presets)

Do not shed: the two layouts, the status system, the entrance animation, break chat, or the
room inventory.

---

## 3. Rooms

### 3.1 Public rooms

- A pool of rooms. Each holds **10 people**.
- When a room fills, the next arriving user causes **a new room to be created**. Rooms are
  never shown as unavailable.
- **A room is destroyed when it becomes empty.** No room persists.
- Assignment: **on entry, place the user in the fullest room that has space** — density is
  the product, so maximise company, don't spread people thin.
- A **"move to another room"** control is always available, because arriving alone in a dead
  room with no escape is the worst state the app can produce.

### 3.2 Empty rooms are not blocked

An empty room renders normally and **the user can start a timer immediately.** Someone
opening the app at 6am to do 25 minutes of work is never told they cannot start.

The room displays **one unobtrusive line** stating they are the only person present. No sad
empty state, no modal, no blocking. Every feature works alone.

### 3.3 Private rooms — designed, not built

v1 is strangers-only. **There is no way to be in the same room as a specific person.** This
is a deliberate v1 limitation, resolved by the paid custom-rooms feature.

When built, a private room will have: a host who controls **map, weather, ambience, music,
and a banner message**; a shareable link; and **no moderation tooling** (no kick, no ban).

### 3.4 Friends limitation

Because rooms are destroyed when empty and there are no custom rooms in v1, a returning
user is reassigned and may land in a fresh empty room. Record this as a known gap, resolved
by §3.3.

---

## 4. Rooms, weather, and audio ownership

Three distinct layers. Do not conflate them.

| Layer | Scope | Exists in v1 |
|---|---|---|
| **Room baseline weather** | Everyone in the room sees the same weather | **Yes** |
| **Personal weather override** | Affects the user's own view only | **Yes** |
| **Personal audio mute / volume** | Affects the user's own device only | **Yes** |
| **Room-wide weather / ambience control** | Host-controlled, affects everyone | **No — paid tier** |

### 4.1 Public room baseline

- Assigned **when the room is created**, and it is that room's character for its lifetime.
- **Weighted random: 70% clear / 30% rain.** Rain should feel like an event; the clear
  golden-hour state is the app's signature look and must remain dominant.
- The baseline is shared by every occupant. It does not change while the room is alive
  except by a user leaving (which never changes it) — a room's weather is fixed at spawn.
- Because rooms are ephemeral, returning users get a new room with a new mood.

### 4.2 Personal override

- The user's weather control is a **three-state segmented control: `Room · Rain · Clear`.**
- "Room" means synced to the room baseline.
- "Rain" or "Clear" override the baseline **for that user only.** Other occupants are
  unaffected.
- Three labelled states rather than a binary toggle, because with 8 other people possibly
  looking at a rainy room, the user must be able to tell which they are currently seeing.

### 4.3 Private rooms (paid)

The host sets the room's weather, ambience, music, and map for everyone. Individual users
retain personal audio mute and volume.

---

## 5. Timers

- **Every user runs their own timer.** There is no shared room cycle. This is final.
- **Custom duration** per user. Default **25 / 5**.
- The **clock is local and authoritative for that user only.** It runs on wall-clock time,
  never on a server tick, and **survives page reloads.** It is the one value that must never
  lie to someone.
- The room has no aggregate timer. What the room shows is derived — see §8.2.
- A session is **completed** when the focus phase runs to zero. Leaving early does not
  record a session.

---

## 6. Status, and how it is shown without reading

The status signal must work at a glance, across the room, with zero reading. Primary
mechanism: **every desk has its own lamp.** The lamp is a diegetic status display.

| Status | Lamp | Avatar | Desk |
|---|---|---|---|
| **Focusing** | **On**, warm glow pool on the desk | Seated at the desk, cycling type / write / read | Personal items present, lamp lit |
| **On break** | **Off** | **Away from the desk** — at the sofa, the counter stools, a shelf, or standing with a mug | Items still present |
| **Away** | **Off** | Absent | **Seat empty, but their mug and open book are still on the table** |

The lamp-off state is disambiguated by **where the avatar is**, not by an extra icon.
"On break" means a visible person elsewhere in the room; "away" means an empty seat.

**The stowed belongings on an away desk are mandatory.** They cost one sprite and do more
emotional work than any status icon — they say *they were just here*.

### 6.1 Redundant, non-colour status coding

Status must never be encoded by hue alone. Green / amber / grey dots fail outright for
red-green colour vision deficiency, which affects roughly 8% of men, and would render the
app unusable to them.

- **In the scene:** lamp state + avatar posture carry status. No colour dependency.
- **In the participants panel:** status uses **shape as well as colour** — distinct icons,
  or filled / half / hollow indicators.

### 6.2 Away is derived, never self-reported

"Away" is not a status the user sets. It is derived from presence: a participant with no
live heartbeat for the away threshold is away. There is no "mark me away" button.

---

## 7. Break behaviour

- **Focusing:** seated. Animation set cycles through typing, writing, reading, with
  occasional tired animations — overhead stretch, hands behind head.
- **On break:** the avatar **stands up and relocates** to one of a small set of fixed
  destinations present in the room: the sofa nook, the counter stools along the window, or
  standing by a bookshelf. It adopts a break pose — leaning back, holding a mug.
- **On break end:** the avatar returns to its own desk and resumes.
- Destinations are **scripted, not free-roam.** A fixed set of walk paths, not pathfinding.
- **A person who vanishes or teleports does not read as "on a break."** A person who gets up
  and walks to the sofa does. This is the entire reason break has movement.

---

## 8. The room's response to its own occupancy

### 8.1 No shared rhythm

Because every timer is independent, the room will almost never breathe in sync. There is no
discrete room mood, no threshold, no state machine — a threshold produces a visible snap,
and a snap is exactly the wrong feedback in a calm app.

### 8.2 Continuous aggregate grade

A single scalar:

```
focusDensity = focusingCount / presentCount   (0.0 … 1.0)
```

drives three parameters:

| Parameter | focusDensity → 1.0 | focusDensity → 0.0 | Range |
|---|---|---|---|
| Light level | Shafts dim ~12% | Brighten ~8% | ±12% |
| Colour temperature | ~150K, cool | ~300K, warm | 150K–300K |
| Rain density / volume (personal audio) | Denser, quieter | Lighter | — |

- **Maximum total shift ~12%.** Lerp between values over **2–3 seconds.**
- **No one should consciously notice this.** If a user can name what changed, it is too
  strong.

This is what recovers the collective feeling that dropping the shared clock gave up.

---

## 9. Avatars

### 9.1 Construction — layered paperdoll

Avatars are **composited from layers** at a shared anchor point, drawn once at load.
Never pre-baked per-avatar sprites; that is combinatorially unshippable.

| Layer | Count | Notes |
|---|---|---|
| Body base | **2** — women's, men's | Separate animation sets |
| Skin tone | **6** | Palette swap on one sprite; near-zero cost |
| Hairstyle | **8** | The expensive axis |
| Top | **6** | hoodie, sweater, tee, shirt, jacket, vest |
| Bottom | **4** | trousers, jeans, shorts, skirt |
| Accessory | **2** | glasses, headphones |

Composition is roughly 100 lines: a layer manifest plus one `drawImage` per layer at a
common anchor. There is no paperdoll library for this; build it.

### 9.2 Directional economy

**Hair and clothing layers are direction-agnostic.** Only legs, torso lean, and arms need
per-direction frames. This cuts avatar art roughly **4×** versus fully 8-directional sets
and is the single largest art saving in the project.

### 9.3 No face axis

**There is no face builder.** At 3/4 overhead with avatars ~30px, a face is about 6px of
hair and nothing else. Facial expression is not legible at this resolution, and the axis
invites a builder that produces meaningless choices. Personality is carried by hair,
clothing, silhouette, and animation timing instead.

### 9.4 Animation

**Two body bases, one shared animation set each.** No per-avatar unique animations.

Shared set per body base:

1. `enter_walk` — through the door to a free desk
2. `sit_down`
3. `typing`
4. `writing`
5. `reading`
6. `resting`
7. `tired_stretch` — overhead, hands behind head
8. `walk_break` — to a break destination
9. `return_to_seat`

**Free per-avatar variation, zero art cost:** differing typing speed, blink offsets, fidget
frequency, and animation phase. These make people read as individuals without a single extra
frame.

### 9.5 Entrance animation

On first join, and on return after an absence: the avatar **walks in through the door and
sits at a free desk**, then opens its laptop and begins. Any free desk, no preference.
Suppress entirely under reduced motion.

---

## 10. Scene — the library

### 10.1 Camera and view

- **3/4 overhead perspective**, not plan view. Walls have visible height. Bookshelves have
  real shelving depth. A stairwell railing is visible. This is richer and easier than true
  top-down, and it is what the reference art shows.
- **One master illustration. Two camera framings of that same master** — portrait and
  landscape. This is not two illustrations, and it must not be built as two.
- The portrait framing is a **narrower crop of the same master at a larger scale**, so the
  same room reads well in both.

### 10.2 Zoom

| Layout | Zoom |
|---|---|
| **Desktop / landscape** | **None.** Fixed framing. |
| **Mobile / portrait** | Clamped pan and pinch-zoom, with a **minimum and maximum zoom limit** — the user cannot zoom all the way in or all the way out. The default framing is the one that always looks correct. |

The portrait layout's default view is the canonical composition. Zoom exists for looking
closer, never as the primary way to see the room.

### 10.3 Lighting

**One fixed lighting state: warm afternoon, golden hour.** Sunlight enters from the upper
left at roughly 35° and casts parallelogram light pools across the wood floor. This is the
scene's signature effect and it is the reason the map is worth building.

- No day/night cycle. No sync to the user's local time — **explicitly rejected.**
- No time-of-day presets in v1. The architecture carries a lighting config object per map so
  presets are a data change later.
- Time-of-day was considered and rejected for v1 on the grounds that a second state means a
  second full set of shafts, shadow angles, and glow falloffs — roughly a second room's art
  for a feature nobody asked for.

### 10.4 Rain as a lighting state, not an overlay

Rain **replaces** the sun shafts. It is not particles drawn on top of clear-weather lighting.
Clear and rain are **two distinct lighting states.**

Rain state changes:
- Sun shafts dissolve; window light goes grey and diffuse
- Window gains rain streaks and running water
- A cooler overall grade
- Floor light pools lose their hard edges
- Rain particle layer renders **behind** furniture and **in front of** the far wall

The sun shafts remain the hero effect of the clear state and must not be reused in rain.

### 10.5 Room inventory

Transcribed from the reference. Author all of it.

**Furniture and fixtures**
- Six to seven individual wooden desks in two rows, each with a chair, a desk lamp, and a
  potted plant
- Some desks carry: mug, laptop, open book, water bottle
- Backpacks on the floor beside chairs
- Area rugs under each desk group
- A run of **bar stools** along the left window ledge
- A **sofa + round coffee table + rug** in the bottom-left nook
- **Bookshelves** on the top-left wall and bottom-right, with visible individual book spines
- **Framed pictures** on the walls
- A **door**, top-right
- A **pendant lamp**
- A **stairwell with railing**, bottom-right
- A **long window ledge** on the left
- **Wood plank floor** throughout

**Greenery**
- Potted plants scattered throughout, including trailing varieties on shelves and walls

**Animals — keep these**
- A ginger cat
- A black cat

Both are **ambient sprites** that occasionally stretch, walk a few tiles, and settle. This
is the highest charm-per-pixel-of-animation ratio in the scene and it must ship. The sofa
and the counter stools double as break destinations (§7), so the room's furniture and its
break behaviour reinforce each other.

### 10.6 Lamps and glow

- Each desk lamp has a **small warm glow pool** that is part of the lamp's on-state (§6).
- Lamp glow is **pre-baked**, never a per-frame blur.
- Glow composited with `globalCompositeOperation = 'lighter'`.

---

## 11. Audio

### 11.1 Licensing — CC0 only. Non-negotiable.

**Every audio file is CC0.** Freesound filtered to CC0, plus Kenney audio. No CC-BY, no
CC-BY-NC, no third-party music, no unlicensed loops.

Rationale: ambient rain and room tone are field recordings nobody owns. **No music ships in
v1** — looped music is the most copyright-liability-laden element in the app, since
Freesound and Pixabay licences complicate commercial use for exactly that case, and
registered music can generate Content ID claims even on a 30-second loop.

### 11.2 Provenance

Maintain `public/audio/CREDITS.md` recording every file's source URL, author, and licence
for **all** downloads, even though CC0 does not require attribution. This is the prerequisite
for adding licensed music later.

### 11.3 Architecture

- **One** `AudioContext` for the app. Created and `resume()`d on the first user gesture — iOS
  requirement.
- **Lazy decode on first play**, then cache the `AudioBuffer`. Never decode per interaction.
- Play via `AudioBufferSourceNode` with `loop = true` and explicit `loopStart` / `loopEnd`.
- Throttle ambience crossfades.
- **Synthesize UI chimes** — ~200ms sine/triangle envelopes, ~1KB, zero licence risk.
- **Off by default.** Prominent ambience toggle.
- **Format: MP3 or AAC-in-MP4. Not Opus** — Safari's Opus support is unreliable in `<audio>`.

### 11.4 Sound inventory

| Sound | Type | Length |
|---|---|---|
| Library room tone | loop | 8–12s |
| Rain on glass | loop | 10–15s |
| Distant traffic | loop | 8–12s |
| Café murmur | loop | 8–12s |
| Rain (weather state) | loop, tied to §10.4 | 10–15s |
| Thunder | one-shot | 2–4s |
| Page turn, chair creak, laptop open/close | one-shot | 0.2–1s |
| Join / leave / status-change cues | one-shot, synthesized | ~200ms |
| UI chimes | one-shot, synthesized | ~200ms |

**Four ambience loops is the full library.** That is enough to feel varied without building
a content pipeline.

### 11.5 Budget — hard limits

| Limit | Value |
|---|---|
| Audio files, total | **< 3 MB** |
| Decoded audio in memory | **< 40 MB** |

These are hard. A 4-minute stereo MP3 decodes to ~80MB and OOMs iOS Safari. Loops must be
short and mono. The audio pipeline will break iOS Safari long before the canvas ever
struggles.

### 11.6 Social cues

Soft cues on join, leave, and status change. Personal audio only — they are part of the user's
own ambience, not a room broadcast.

---

## 12. Maps

### 12.1 The library is the only map in v1

The all-night café is **map 2**. Two maps doubles the room art, and the room art is the
critical path.

The map system is designed as **data from day one** — a map is a master image plus a lighting
config plus a break-destination list plus a seat map. Adding the café is authoring work, not
re-engineering.

The second reference image depicts a **bed, floor cushions, and a wall of trailing plants** —
that is a dorm, not a library. Treat it as a distinct space and a natural map 3.

---

## 13. Interface

### 13.1 Art direction — pixel, no glass

**No glass. No `backdrop-filter`.** Blur over a large area is genuinely expensive on mobile
browsers, and it is rejected on both aesthetic and performance grounds.

- **Opaque pixel-framed panels.** Solid dark fill, chunky 1–2px pixel border drawn as a
  9-slice frame.
- **Pixel iconography** in the control bar.
- **Pixel typeface for the timer numerals and names.**
- Modern spacing, layout, and interaction. **Not a pure pixel UI** — chunky pixel chrome, not
  a pixel-art skeuomorph.

The glass treatment visible in the reference is explicitly **not** the target.

### 13.2 Theme

**Dark theme only in v1.** The scene is a warm amber room in late light; a light theme would
require a second palette pass over every panel, and a light UI over a dark scene reads cheap.

### 13.3 Controls, from the reference

**Top centre:** timer pill — large numerals, phase label, a phase indicator dot.

**Bottom centre:** control pill —
- Ambience (dropdown, 4 loops + off)
- Weather — `Room · Rain · Clear` segmented control (§4.2)
- Master mute toggle
- Hide UI toggle — full-bleed scene, chrome fades away
- Expand / fullscreen
- Participant count, tapping through to the panel

**Mobile portrait:** the reference's control bar **cannot fit 390px.** The mobile set is
Ambience, Weather, Mute, Hide UI. Expand and the participant count move into the sheet.

### 13.4 Side panel

Right rail on landscape; **bottom sheet** on mobile portrait, drag-up, ~55% height.

Two tabs:
- **Chat** — message list with avatar, name, timestamp, and an input row
- **Participants** — `N online`, then a row per person: avatar, name, and status coded by
  shape as well as colour (§6.1)

### 13.5 Reduced motion

Honour the OS setting. Disables entrance walk-ins, the panel transitions, and aggregate-grade
interpolation. **This is an accessibility requirement, not an option.**

---

## 14. Chat

### 14.1 Gating

- **Only participants on break may post and read.**
- While focusing, the message list is empty and the input is disabled.
- An **unread badge appears the instant you enter a break.** This is the reward for coming
  back.

### 14.2 Speech bubbles

- Bubbles render **above the avatar's head, visible to everyone** — including people who are
  focusing and cannot read them. Locked content is visibly locked.
- Rationale: a moving room reads as alive. Hiding all chat from focusing participants makes
  the room feel dead to the majority of the people in it.

### 14.3 Storage — ephemeral

- In memory only. **Last 100 messages.**
- **Wiped when the room empties.**
- Never written to the database. No user-generated content is ever persisted.
- This removes essentially the entire moderation burden from a solo operator running a
  stranger room on a free tier.

Persistent chat is a separate future decision requiring its own moderation design. It must not
creep into v1.

### 14.4 Local safety controls

- **Mute** and **block**, persisted locally. No server-side enforcement — block is
  client-side plus hide-from-view.
- Fast exit and rejoin is the primary safety mechanism, not reporting.

### 14.5 Message constraints

Server-side: character cap, token-bucket rate limit per session, link blocking in the first N
messages. See §17.

---

## 15. Identity

### 15.1 No accounts

Auto-generated display name, editable inline. A `device UUID` in local storage is the only
identifier. **No email, no password, no authentication of any kind.**

### 15.2 Onboarding

**Drop the user straight into the room.** No pre-room explainer screen.

3–4 **skippable coach marks** anchored to the actual UI explain:
1. Your timer, and that it is yours alone
2. **The lamp-as-status mechanic** — the one thing a user must understand or the entire room
   is decoration
3. Break chat — you can only talk on your break
4. Ambience and weather controls

### 15.3 Fields

| Field | Requirement |
|---|---|
| Display name | **Required.** Auto-generated, editable. |
| Country | **Required.** Selected from a picker. |
| City | **Optional.** Free text. |

### 15.4 Name policy

1–20 characters. No newlines. No emoji spam. A blocklist covering impersonation and badge
characters. **Names are rendered over avatars and in a public list, so this is enforced
server-side.**

### 15.5 Country, not free-text origin

Country comes from a picker. **Free-text city is optional and never rendered over the
avatar** — a flag over someone's head in a pixel room is visual noise at this scale. Full
profile detail is a paid-tier feature.

---

## 16. Analytics

- **Server-side**, keyed to the device UUID. Survives reinstall and clearing local storage.
- This is required, not optional: the paid feature "see how many times others have studied"
  is **permanently impossible** without server-side history.
- **Completed focus sessions only** — a timer that ran to zero. Early exits do not record.
- **No streak counter.** Streaks punish people for having one bad day, which is the wrong
  thing to attach to a calm app.
- **90-day retention cap**, then prune.
- Views: **today**, **7 days**, **30 days**.

---

## 17. Technical architecture

### 17.1 Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15, App Router, TypeScript** |
| Styling | **Tailwind v4** |
| Scene | **Canvas 2D** — one `<canvas>` |
| Hosting | **Vercel** |
| Backend | **Supabase** — Postgres + Realtime |
| Realtime transport | **Supabase Realtime Broadcast** |

**No game engine. No PixiJS. No Phaser.** Ten avatars is nothing for a game engine to earn
its keep. Canvas 2D gives correct depth compositing — rain behind furniture, glow over
everything — with zero dependency weight and no WebGL context-loss failures on cheap
Androids. Revisit only if the scene grows heavy post-processing.

**React renders the chrome only. It is never in the scene's render loop.**

### 17.2 Canvas and scaling

```
dpr   = Math.min(devicePixelRatio, 2)
scale = Math.max(1, Math.floor(cssWidth / internalWidth))   // integer only
canvas.width  = internalWidth  * scale * dpr
canvas.height = internalHeight * scale * dpr
canvas.style.width  = (internalWidth  * scale) + 'px'
canvas.style.height = (internalHeight * scale) + 'px'
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
ctx.imageSmoothingEnabled = false
```

- **Integer scale only.** A non-integer scale produces uneven pixel widths and destroys the
  aesthetic.
- **DPR capped at 2.** Never render the scene at native 3× resolution.
- `imageSmoothingEnabled = false` applies to the **context**, not the canvas. Reset it if a
  second context is ever created.
- Re-derive scale on both `resize` and `orientationchange`, releasing old offscreen canvases
  when you do.

**Render ladder** — choose the largest step that fits the scene area:

| Layout | Ladder |
|---|---|
| Landscape | `1920×1080` → `960×540` → `480×270` |
| Portrait | `720×1560` → `360×780` → `240×520` |

- **Room master art: one 1920×1080 image per map per weather state** — two images for the
  library (clear, rain).
- **Avatars are never resampled.** They are authored at their natural art-pixel size and
  blitted at the current integer step, so they stay crisp at every step.
- At lower steps the room background is nearest-neighbour downsampled. This is acceptable
  because the composition is designed to survive it. If it does not, author a second
  lower-detail **room only** — it is one image, and it is cheap relative to the avatars.

### 17.3 Render architecture

1. **Pre-baked room layer** — floor, walls, shelves, static furniture. One `drawImage`.
   This is the largest win available: it converts hundreds of tile blits into one.
2. **Pre-baked lighting layer** — lamp glow and light shafts, composited with `'lighter'`.
3. Rain particles, drawn in depth order relative to furniture.
4. Avatars, drawn in seat order.

### 17.4 Performance prohibitions

**These are hard rules for the render loop:**

- **Never use `shadowBlur`.** Chrome forces an offscreen render-target pass; WebKit allocates
  a temporary `ImageBuffer` per shadowed operation. **Pre-bake every glow into an offscreen
  canvas and `drawImage` it.** Identical visuals, a fraction of the cost.
- **Never use `ctx.filter`.** Same family, worse. Pre-bake.
- **No per-frame allocation.** No `new Array()`, no object literals, no string building in
  the hot loop. Use typed arrays (`Float32Array` for rain x/y/vx/vy/opacity) and pre-allocated
  pools.
- **No `getImageData` on large regions.** The per-canvas read limit applies to reads, not
  just drawing. Pre-bake at load.
- **One `fillRect` over the frame**, not tiled `clearRect`. If a full opaque room
  background is blitted, skip the clear entirely.
- Suspend the `requestAnimationFrame` loop entirely on `visibilitychange`.
- Free offscreen canvases on resize rather than leaking them.

### 17.5 Realtime

- **Supabase Realtime Broadcast** for status changes, timer updates, and chat.
  **Client-side Broadcast only — it is never written to Postgres.**
- **The member roster is a Postgres table with `postgres_changes`** for join and leave.
  **Not Supabase Presence** — Presence is limited to 20 messages/sec project-wide and 5
  calls per client per 30s, tight enough that ordinary application code can throttle the
  room. A table also gives write-rate-limit control, and a crashed client leaves a reapable
  stale row instead of a ghost.
- A scheduled job reaps roster rows with no heartbeat past the away threshold.
- **`profiles` table** for name, country, city, and avatar selections, keyed to the device
  UUID.
- **Sessions table** for analytics.

### 17.6 The 7-day pause problem

**Supabase free projects pause after 7 days of low database activity and return HTTP 540
"project paused," with no auto-wake.** Restoration is manual from the dashboard.

Mitigation, all required:
- A **daily keep-alive request** from a scheduled CI job — Supabase's own documentation names
  "a few user requests to the database each day over the previous week" as the pause
  criterion.
- **Every Supabase call wrapped in retry with backoff.**
- **HTTP 540 is handled as a user-facing "retry in about 60 seconds," never as a crash.**

The app is meant to be alive at 3am. This is the one piece of operational fragility in the
architecture and it must not be skipped.

---

## 18. Performance contract

### 18.1 Frame rate

**60fps sustained, mid-range and above.** The reference floor is **iPhone 12 / Snapdragon
778G class.** Not low-end hardware.

**Effects degrade; frame rate never does.** If a device struggles, the order is:

1. Rain density
2. Glow quality
3. Never the frame budget

Because the scene renders at a fixed internal resolution with integer scaling, **device
resolution, DPR, and screen size have essentially zero effect on render cost.** A $300 phone
and a $1400 phone do identical work. The only things that can threaten 60fps are effects.

### 18.2 Load and weight

| Metric | Target |
|---|---|
| Interactive, cold cache, throttled Slow 4G | **< 2.5s** |
| JS, gzipped | **< 200 KB** |
| Total transfer including art and audio | **< 1.5 MB** |
| Audio files | **< 3 MB** (§11.5) |
| Steady-state memory | **< 60 MB** |

### 18.3 Idle

A two-hour session must not cook the battery. The render loop suspends on
`visibilitychange`. No work occurs while hidden.

---

## 19. Network failure

The app's value is other people being there, so connection loss is the failure the product
most needs to handle well.

- **Your timer keeps running** on local wall-clock time and survives reloads. It is the only
  value that must never lie.
- **Other participants grey out** with a small reconnect indicator.
- **Your own presence dot goes hollow.**
- The app **never invents presence it cannot verify.** A visible "reconnecting" state is
  mandatory.
- On reconnect, the room repopulates from the roster table.

---

## 20. Abuse protection

All layers are free. All are required.

### 20.1 Premise corrections

- **Cloudflare Tunnel is not used.** It protects origins you host privately. There is no
  origin to hide — Vercel's edge and Supabase's endpoints are already public and
  firewalled. Deploying it adds a VPS, a single point of failure, and latency, and still
  does not protect Realtime.
- **Cloudflare is not placed in front of Vercel.** Free Cloudflare offers 5 WAF rules and
  one rate-limit rule that can only match on path, over a 10-second window, with a 10-second
  penalty. In exchange, Vercel documents that a reverse proxy **breaks** its DDoS mitigation
  and bot protection, and Cloudflare's proxy interferes with ACME certificate renewal. Free
  Cloudflare also requires a domain you own; you cannot proxy `*.vercel.app`.
- **No domain purchase is required for v1.**

### 20.2 Vercel — enable these

- **Bot Protection managed ruleset** → `challenge`. Free, **off by default — turn it on.**
- **AI bots managed ruleset** → `deny`. Stops crawlers harvesting names and avatars.
- **One WAF rate limit rule**, keyed on IP + JA4, on the most abusable route. Counters are
  per-region, so set the number 3–5× tighter than intended.
- **BotID Basic** → free, invisible, on exactly two routes: **chat send** and **join /
  identity create**. No checkbox, no puzzle, no login, no keys.
  - Test from a page in the app. Local development always returns `isBot: false`.
  - Known limitation: **will not stop Playwright/Puppeteer.** Catching browser automation is
    Pro-only. Accepted for v1 — the room is ephemeral and names are the only thing worth
    scraping.

### 20.3 Application layer

- **Token bucket** message caps per session — **not** a fixed window. Chat is bursty; a
  fixed window rejects normal behaviour.
- A **separate content-normalised bucket** alongside the per-identity one, to catch copypasta
  spam across rotating identities.
- **A few seconds' delay** before the first message can send.
- Server-side character caps. **Link blocking** in the first N messages.
- **Honeypot field** on any form.
- **Degrade, don't block.** Suspicious behaviour is slowed and cooled down, never hard-errored.
  With no accounts, false positives are guaranteed; make them survivable.

### 20.4 Keep limiters independent

**Never concatenate IP and session ID into one rate-limit key.** An attacker rotating the
session ID mints unlimited buckets against a combined key. Run them as two independent
limiters and AND them.

### 20.5 Realtime discipline

Supabase's Realtime quotas are **project-wide, not per-client.** A script opening 200
connections evicts every real user, and bot traffic is a documented trigger for
`RealtimeDisabledForTenant` — a total outage.

- Set internal client caps **well below** Supabase's ceilings.
- **Coalesce presence and status updates.** Do not re-announce on every render.
- **Back off exponentially on reconnect.** Reconnection loops are a documented cause of
  project suspension.

### 20.6 The real risks

1. **Vercel Hobby Terms authorise shutting down a deployment** if a malicious attack causes
   "delays or performance problems." Anti-abuse on Hobby is how the deployment survives.
2. **Exceeding most Hobby quotas locks the feature for 30 days.** Overage protection is
   mandatory, not optional.
3. **Shared free infrastructure is the real tail risk.** Supabase has documented regional
   network blocks where one abusive project affected every customer on the platform.
4. **Hobby is non-commercial only.** A free app with no payments, ads, or affiliate links is
   within "personal, non-commercial use." **If anyone is ever paid to build this — client,
   employer, or contractor — Hobby becomes non-compliant and requires Pro.**

---

## 21. Art pipeline

### 21.1 The core constraint

**Aesthetic quality is the top priority and optimization comes later — but the art volume is
the schedule.** Density is free at runtime; every art pixel is one someone has to draw by
hand.

### 21.2 What AI can and cannot do here

- **The room is a static image.** It can be AI-generated at high resolution, then snapped to
  the locked palette. This is the cheap path.
- **Avatars cannot.** Frame-to-frame identity consistency is not a capability any
  general-purpose image model has. Prompt-to-spritesheet output has unreliable frame counts,
  grid alignment, and inter-frame palette consistency. Every serious tool in this space ships
  a retry loop to compensate.
- **Layered avatar parts cannot.** Generating a consistent set of hair layers that register
  pixel-perfectly with each other is *harder* than a consistent walk cycle.

**Therefore: AI for concept exploration, hand-authoring for the shipped sprites.**

### 21.3 Workflow

1. Generate concepts for palette, silhouette, and wardrobe. Do not ship free-tier AI output.
2. Snap to the locked palette; extract **one shared palette across the entire sheet** —
   per-frame quantisation flickers.
3. Hand-author the shipped frames.
4. **Derive idle animations by pixel-shifting one drawn frame** — the frames are the same
   pixels moved, so identity drift is zero.

### 21.4 Licensing

**CC0 only** for any asset used in the app. Kenney is CC0 and safe. **Avoid CC-BY-SA and
GPL** — ShareAlike forces you to publish derivatives of the art under the same licence, and
GPL/CC-BY-SA carry an anti-DRM clause that conflicts with app distribution.

**itch.io "free" does not mean commercial.** Check each pack's licence individually.

Maintain `CREDITS.md` for art provenance alongside the audio credits (§11.2).

---

## 22. Palette

**One locked 32-colour palette**, derived from the reference:

| Family | Use |
|---|---|
| Warm amber / brass | Lamplight, sun shafts, warm floor |
| Deep teal-green | Shadow, rugs, upholstery |
| Muted sage | Mid-tone furniture, foliage |
| Clay / terracotta | Accents, clothing, book spines |

**Every sprite is drawn against this palette.** Palette consistency is the single
highest-leverage decision for the art looking coherent across independently authored
sprites.

---

## 23. Paid tier — designed, not shipped

The visibility rules are designed and implemented now, gated by a single `tier` column that
always reads `free` in v1. Adding payments later is flipping one flag, not an architectural
change.

**Committed but unshipped:**
- Custom private rooms with shareable links — host controls map, weather, ambience, music,
  banner message. **No moderation.**
- See other participants' **exact remaining timer** and elapsed time
- See other participants' **completed session counts**
- Full profile detail including city

**Not in v1 and not designed:** accounts, authentication, payment processing.

**Shipping payments requires authentication**, because an anonymous device UUID cannot be
charged — there is nothing to bill, no way to recover access if storage is cleared, and it
invites trivial sharing. Auth is its own project and it directly undermines the no-account
entry that is the core pitch. It is out.

---

## 24. Decisions explicitly rejected

Recorded so they are not silently re-litigated.

| Rejected | Why |
|---|---|
| A shared room Pomodoro cycle | Users rejected it; autonomy wins. Collective feeling is re-synthesised from `focusDensity` instead. |
| Sync to the user's local time | Rejected outright. |
| Multiple time-of-day presets in v1 | Would double the lighting art for a feature nobody asked for. |
| A full day/night cycle | Doubles every lighting state; screenshots become non-deterministic. |
| Glass / `backdrop-filter` UI | Rejected on aesthetics **and** measured mobile performance. |
| A light theme | Second palette pass over every panel for a cheap-looking result. |
| An avatar face builder | Not legible at ~30px. A builder of meaningless choices. |
| Per-avatar unique animations | Complexity the project does not need. Two shared sets, varied by timing. |
| Free-roam movement | Destroys "where is everyone" legibility. Scripted destinations only. |
| Persistent chat | Moderation burden and UGC storage, for a study app. Ephemeral only. |
| Break streaks | Punishes people for one bad day. Wrong thing to attach to a calm app. |
| Free-text city over the avatar | Visual noise at this scale, and a self-identification risk. |
| A pre-room onboarding screen | Friction before the reward. Coach marks over the live room instead. |
| A delayed chat transport | Delays cost the same transport and make the feature worse. Chat is real-time **and free** — client-side Broadcast is never written to Postgres. |
| PixiJS / a game engine | Ten sprites is not the workload they exist for. |
| Cloudflare in any form | Makes protection worse, requires a domain, and does not cover Realtime. |
| A CAPTCHA with user interaction | Turnstile and BotID invisible modes are genuinely zero-friction. |