# Scene v2: study hall rebuild (plan and reference inventory)

Date: 2026-10-22. Scope: the 3D scene and its animation only. Everything else in the app keeps
its current behaviour.

The reference images are saved next to this file in `docs/reference/`:
`scene-current.png` (Image 1), `Golden Hour Library Study.png` (Image 2) and
`Rainy Day Library Study.png` (Image 3). All three reached me inline and I can see them.

---

## 1. Audit

### 1.1 How the scene is mounted today

- `src/components/StudyScene.tsx` lazy-imports `src/scene/index.ts` and calls
  `createStudyScene(container)`. The handle it uses is
  `setSeats((SeatOccupant | null)[])`, `setLabelsVisible(boolean)` and `dispose()`.
  `SeatOccupant = { userId, nickname, avatar, status: 'focusing' | 'break' | 'away', isMe }`.
- `src/screens/Room.tsx` builds a `ROOM_CAP` (= 10) long seat array from `assignSeats` and
  passes it in. Fill order puts people in app seat 8 as soon as 6 people are present, so the
  scene must accept app seat indices 8 and 9 and place them into its 8 slots.
- `src/components/useAvatarThumbs.ts` calls `renderAvatarThumbs()` from the same module.
- Vanilla three.js r169, no react-three-fiber. The scene chunk is already lazy-loaded.
- Name labels are DOM pills (`.scene-labels`, `.seat-label`, `.me`, `.away`) positioned from a
  projected head point every frame. The CSS stays as is.
- `src/dev/anim.ts` (`/dev/anim`) and `src/dev/gallery.ts` (`/dev/characters`) are dev-only
  pages behind `import.meta.env.DEV` in `src/main.tsx`. `/dev/anim` builds the old room.

### 1.2 Frozen files (treated as read-only)

| File | Why |
|---|---|
| `src/scene/characterBuild.ts` | Character geometry, rig (14 bones), materials, outline |
| `src/scene/character.ts` | Seated animation system (acts, IK, mug and page handling) |
| `src/scene/faceAtlas.ts` | Face decals and expressions |
| `src/lib/avatars.ts` | Palettes, specs, the 10 presets |
| `src/scene/toon.ts` | Not character code, but `GeoBuilder` and the primitives are what the character builder is made of, and `materials().toon` is the pen/phone material. Left untouched; the new environment uses its own builder |

Hooks planned in `character.ts` (additive, non-visual, listed again in the final report):
a public `quietUntil` time that stops *new* micro acts (sip, think, neck roll) and page turns
from starting, and a read-only `gesturing` getter that is true while a sip, page turn or held
mug is mid-gesture. Default values leave today's behaviour byte-for-byte identical. They let
the new behaviour layer start a stand-up or a new pose without cutting a sip in half.

The rig already has every joint the new work needs: `hips`, `hipL/R`, `kneeL/R` (legs for
walking and sitting), `torso`, `head`, both arm chains, and a `bag` bone. The character class
never writes the leg, hips or bag bones, so the new layer can drive them without conflict.

### 1.3 Rules from the brief (`PROJECT.md`) that shape the build

- **Lamp-as-status (§6) is explicit, not ambiguous:** focusing = lamp **on**; on break = lamp
  **off** (the person is visibly elsewhere in the room); away = lamp **off**, chair pushed back,
  mug and open book still on the table. Empty seat = off, no kit, chair pushed in. I implement
  that exactly and keep it in one table (`LAMP_LEVEL` in `src/scene/hall.ts`). Your fallback
  (break = dim glow) is one number away in the same table.
- Per-seat lamps are fake light (§10.3): no real light per seat.
- Characters: one body + one outline + one face draw, ~7.4k–12.6k triangles each (§9.3).
- Fixed 60 Hz simulation step and drift-free frame limiter (§17.4).
- Away is derived from presence; break means walking to a destination, never vanishing (§7).
- No post-processing pass (§10.3, §24). Glow is additive sprites; "post effects" in the tier
  table below means the fake-glow and light-shaft layers, not an `EffectComposer`.

### 1.4 Where this request overrides the brief (recorded, not silently)

| Brief says | This request says | What I do |
|---|---|---|
| One fixed time, night; day/night rejected (§10.3, §24) | `timeOfDay` day/night input, day look = Image 2 | Build both. The app keeps passing nothing, so the live app stays on its current night + rain look. Day is reachable from the Scene Lab and `?time=day` |
| 10 seats, 5 per side | 8 seats, 4 per side, `MAX_SLOTS = 8` | 8 in the scene. App code is untouched (see §9 for where 10 lives) |
| Toon ramp + `#171226` outline on room objects | No harsh black outlines on the environment, soft matte clay look | Environment uses a soft wrapped-Lambert material with baked AO and no outline. Characters keep their own outline exactly |
| Armchair, bed, arched window, fairy lights | Image 2/3 layout (window counter, sofa, door, balustrade) | Image 2/3 layout |
| Drag springs back to the default framing | Limited orbit with damping and `resetView()` | No spring-back; `resetView()` and the lab preset return to the default |

---

## 2. Image inventory (Images 2 and 3)

Both images show the same room from the same camera. Coordinates below are pixels in the
1672 × 941 image (x right, y down) and screen fractions in brackets.

### 2.1 Camera and room shape

- High three-quarter view, about 40° down, looking into a **corner**. Two walls are visible:
  the **left wall** (window, window counter, bookshelves) runs from the lower left up to the
  corner just right of the bookshelves (x ≈ 930, y ≈ 80–180); the **right wall** (teal, frames,
  door) runs from that corner down and to the right. The camera side and the right end are
  open, like a dollhouse; the bottom-right is a mezzanine edge with a balustrade.
- The long table's axis runs parallel to the right (door) wall and points at the left
  (bookshelf) wall: its far end is upper-left near the bookshelves, its near end lower-right
  near the balustrade. On screen it runs from about (450, 330) to (1410, 650).
- In world terms I place: table along +x, door wall at the back (−z), window/bookshelf wall at
  the left (−x), camera in the front-right quadrant (+x, +y, +z).

### 2.2 Left wall (window, counter, shelves)

| Item | Where | Colour / notes |
|---|---|---|
| Large multi-pane window | top-left, x 0–360, y 0–230 (0–0.22, 0–0.25) | Thick honey-oak frame and mullions, at least 4 panes wide × 3 tall. Day: soft green trees in warm sunlight, pale hazy buildings behind (cream `#e2bc94` sky haze). Night: blue-grey rain (`#5d7fa7` sky), dark tree silhouettes, buildings with a few lit windows, raindrops on the glass |
| Wall around the window | x 340–410 | Warm cream plaster (`#dea367` in sun); grey-cream at night |
| Built-in window counter | runs x 0–370, y 180–320, along the wall | Honey-oak top, deep teal panelled front (teal-green, warm-lit by day, `#1c2e31` at night) |
| Two potted plants on the counter | (30, 240) and (285, 150) | Terracotta pot (left), white pot (right), green leaves |
| Short stack of books on the counter | (240, 195) | Two closed books: pink/rose on top of teal-green |
| Tall wooden stools | (40, 400), (140, 340), (240, 320), (330, 290) | Four in Image 2 (one occupied); honey round seat, 4 legs with rungs. Request says three; I build three |
| Person on a stool | (130, 300) | Sits facing the window holding a mug (break pose) |
| Bookshelves | x 400–930, y 0–295 (0.24–0.56, 0–0.31) | Three bays, honey-oak frame (`#c67034` lit side, darker inner), 5–6 shelves per bay packed with spines: blue, green, teal, red, orange, purple, cream. Ivy trails from the top at (430, 40) and (720, 20) |
| Person at the bookshelf | (625, 160) | Standing, reading a book pulled from the shelf |
| Black cat | (888, 150), floor at the right end of the shelves | Sitting upright, facing the viewer, `#2f221d` / `#18191d` |

### 2.3 Right wall (door wall)

| Item | Where | Colour / notes |
|---|---|---|
| Wall | x 930–1672, y 0–330 | Deep teal upper wall (`#1d3437` at night, warmer olive-teal in the day) over a wooden wainscot (≈ a third of the wall height) with a top rail and baseboard (`#743e20` day, `#402b23` night) |
| Two framed landscape pictures | (1080, 35) and (1185, 60) | Light wood frames, cream mat, muted green/blue painted landscapes |
| Cream pilaster | (1290, 0–190) | A shallow cream column breaking the wall left of the plant |
| Tall plant, white pot | (1310, 150–260) | Floor plant, big leaves |
| Panelled door | x 1390–1560, y 0–300 | Wooden door (`#693517`) with 6 raised panels, wide wood casing, brass lever handle at (1525, 165) |
| Framed picture (far right) | (1655, 90) | Partly cropped |
| Plant, terracotta pot (far right) | (1620, 260) | Floor plant |

### 2.4 Centre: table, chairs, rug, pendant

| Item | Where | Colour / notes |
|---|---|---|
| Pendant lamp | (930, 0–60) | Large cream dome, lit warm underneath in both images |
| Rug | corners ≈ (250, 490), (1530, 575), runs past the bottom edge | Deep teal (`#2b4e52` at night), thin gold double border line inset from the edge |
| Long table | (450, 330)–(1410, 650) | Heavy honey-oak top (`#bc6732` lit, `#8d4923` shade), thick square legs, low and long. Looks slightly short for 4 chairs a side |
| Chairs | 4 per side | Wooden ladder-back chairs, green seat cushions. Near-side end chair (510, 470) and far-side end chair (1240, 470) are empty and pushed in |
| Far side (facing camera) | (770, 280), (890, 330), (1080, 400) occupied | Writing in a notebook; typing on a laptop; reading a red book |
| Near side (backs to camera) | (640, 490), (830, 580), (1000, 630) occupied | Typing on a laptop; writing; reading |

Desk props (Image 2 = Image 3):

| Prop | Where |
|---|---|
| Open notebooks | (760, 330), (880, 545), (1045, 600) |
| Open red book (being read) | (1060, 435) |
| Open book, unattended seat | (1280, 585) |
| Laptops (silver) | (690, 445) near side, (880, 395) far side |
| Mugs (white, white, teal) | (735, 350), (915, 565), (1310, 610) |
| Water bottles | small cream (735, 480), light blue (945, 495), grey (1090, 590) |
| Phone | (950, 405) |
| Sticky notes / small pad | (950, 435) |
| Dark pencil case / box with a handle | (630, 380) |
| Backpacks on the floor, leaning on chairs | navy (565, 545), charcoal (720, 625), black (1075, 750) |

Table lamps (eight, all different):

| # | Lamp | Where | Image 2 (day) | Image 3 (night) |
|---|---|---|---|---|
| 1 | Green glass banker's lamp, brass base | (690, 300) | off | off (shade reads bright green, no pool) |
| 2 | Brass swing-arm, small cone shade | (840, 350) | faint | **lit**, pool on the far-side laptop |
| 3 | Amber glass mushroom | (1010, 400) | **lit** | **lit**, strongest pool |
| 4 | Cream tapered drum on ceramic base | (740, 420) | soft | **lit** |
| 5 | Slate-grey cone/dome, thin stem | (545, 350) | off | off |
| 6 | Matte black gooseneck with a hood, arc stand | (1130, 490) | off | off |
| 7 | Teal stem, cream dome mushroom | (1335, 560) | off | off |
| 8 | Small slate dome desk lamp | (1145, 650) | off | off |

### 2.5 Bottom left: lounge

| Item | Where | Colour / notes |
|---|---|---|
| Long sofa | x 0–370, y 540–941 | Terracotta (`#b45c31` lit, `#673b2c` night), rounded arms, two or three seat cushions; the long axis reads parallel to the table |
| Teal cushion | (190, 570) | Against the back at the head end |
| Cream knit throw | (90, 700) | Draped over the arm/back |
| Orange tabby cat | (240, 610) | Curled asleep on the seat |
| Person lying on the sofa | (100–230, 560–700) | Head on the arm, holding a mug |
| Round wooden coffee table | (340, 760) | Honey oak, small potted plant and a closed teal book on top |
| Round rug | centre (330, 790), radius ≈ 180 px | Cream with a teal border ring |
| Plant at the far left | (20, 770) | Terracotta pot |

### 2.6 Bottom right: mezzanine edge

| Item | Where | Colour / notes |
|---|---|---|
| Wooden balustrade | x 1390–1672, y 520–941 | Honey-oak handrail and square balusters; an L-shaped run around a stairwell opening |
| Stairwell void | inside the rails | Dark teal (`#162120` at night) |
| Potted plant | (1400, 860) | White/cream pot, light green leaves |

### 2.7 Floor

Wide oak planks with visible seams running parallel to the table. Day: warm honey
(`#d27a3c` in sun, `#a05528` out of it). Night: chocolate-plum (`#48322e`–`#654231`).

### 2.8 Light: Image 2 (day, clear)

- Low golden sun through the big window. Bright, warm, slightly hazy. The window frame's
  inner edges glow; the cream wall beside it is sunlit.
- Window-grid shaped light patches (stretched parallelograms with mullion gaps) lie across the
  floor: by the stools and lounge (lower left) and in a big band on the floor between the table
  and the door wall (right), also catching the table's edge. Everything outside the patches is
  still warm (strong warm ambient), never dark.
- Lamps are secondary by day: amber mushroom clearly lit, cream drum faintly.
- Pendant on, but weak against the daylight.
- Overall grade: orange/honey, low contrast, soft shadows.

### 2.9 Light: Image 3 (night, rain)

- Dim blue-teal ambient everywhere; walls go deep teal, floor goes dark plum-brown.
- Warm lamp pools carry the table: three lit lamps (swing-arm, drum, amber mushroom) light the
  table top, notebooks and the faces/hands of the people around them. The far ends of the room
  stay cool and dark.
- Pendant on and warm, lighting the table centre from above.
- Window: cool blue-grey, rain streaks and droplets, cool light on the counter top.
- No sun patches.

### 2.10 Things in the references I will not copy

- The characters (faces, hair, clothes): the approved character builder is the only source.
- Nine people: our room seats eight, and the stool/sofa/shelf people are break visits.
- The table's uneven right end (a generation artefact).

---

## 3. Layout (world units; the character's seated table top is 0.69)

Measured from the existing seated pose: root 0.17 on a chair, cushion top 0.27, hands rest at
0.735, character root 0.30 behind the table edge, reach 0.5 from the shoulder. The furniture is
built around those numbers.

| Element | Value |
|---|---|
| Table | centre (0, 0, 0), 5.6 long × 1.36 deep, top 0.69 |
| Seats | 4 per side at x = ±0.69, ±2.07 (1.38 apart), z = ±0.98; slots 0–3 on the back side (face +z, toward the camera), 4–7 on the front side |
| Chair | home (occupied) at the seat; pushed in +0.16 when the seat is empty; pushed back −0.38 with a ±0.22 rad twist when the person is up |
| Left wall (window, shelves) | x = −5.6, facing +x |
| Back wall (door) | z = −3.8, facing +z |
| Bookshelves | 3 bays × 1.0, z ∈ [−3.6, −0.6], 2.7 tall |
| Window | z ∈ [0.0, 3.2], y ∈ [1.05, 3.75], 4 × 3 panes; counter top 0.95 |
| Stools | 3, seat 0.56 |
| Door | x ≈ 3.0 on the back wall, 1.05 × 2.25 |
| Sofa | near-left lounge, terracotta, seat 0.32 |
| Balustrade | near-right stairwell |
| Pendant | above the table's far half |

Final positions are tuned against screenshots of the references.

---

## 4. Architecture

All new code is plain three.js in `src/scene/`, matching the current style (imperative, no
per-frame allocation, module-level scratch objects, seeded RNG).

| Module | Job |
|---|---|
| `hall.ts` | The map as data: `MAX_SLOTS`, seat transforms, seat kits, lamp designs per slot, `LAMP_LEVEL`, break destinations with capacities, waypoint graph, camera framing. One place to edit the layout |
| `envMaterial.ts` | Shared soft environment material (vertex colour + baked AO, wrapped Lambert, sway and emissive attributes) and the lighting injection shared with the character materials: fake lamp pools, window-shaped sun/moon light, table occluder |
| `envGeo.ts` | `EnvBuilder`: like `GeoBuilder` but bakes AO, sway weight and lamp index attributes |
| `room.ts` | Builds the static room (shell + furniture merged), instanced books, chairs, lamps, glow, pendant, window layers, door, balustrade, plants |
| `props.ts` | Seat kits (8 different), lamps (8 designs), mugs, held items |
| `window.ts` | Canvas-painted layered backdrop (sky, city, trees) and the glass shader (rain, droplets, running drops, twinkling city lights) |
| `atmosphere.ts` | `timeOfDay` × `weather` → one interpolated parameter set (2.5 s crossfade), applied to lights, uniforms and particles |
| `quality.ts` | `getTier`, `setTier`, `subscribe`; auto probe + p95 frame-time monitor with hysteresis; persisted choice; per-tier settings table |
| `camera.ts` | Limited orbit/zoom with damping, aspect-aware framing sized to the container, pointer/touch/wheel input on the canvas only, `resetView()` |
| `rigPose.ts` | Standing/walking/sitting poses on the existing rig: two-bone IK with a pole, gait locked to distance, per-bone blend with the existing seated system |
| `agents.ts` | Per-slot behaviour state machine (seated, stand up, walk, destination enter/loop/exit, sit down, door), seeded per person, interruptible |
| `nav.ts` | Waypoint graph, shortest path, path following with yielding/queueing |
| `cats.ts` | Orange tabby and black cat (skinned, character materials), idle life and reactions |
| `ambient.ts` | Particles: dust motes in the beam, mug steam (kept/extended from today) |
| `index.ts` | `createStudyScene` (old handle kept + new methods), fixed-step loop, labels, debug hooks |
| `src/dev/sceneLab.ts` | Dev-only `/scene-lab` |

Public handle (old methods keep working; new ones added):
`setSeats`, `setLabelsVisible`, `setParticipants`, `setTimeOfDay`, `setWeather`, `setQuality`,
`resetView`, `dispose`. `StudyScene.tsx` needs no changes. App seat indices above 7 are mapped
to free slots by a sticky adapter so nobody teleports.

### 4.1 Lamp status table (one place)

```ts
export const LAMP_LEVEL: Record<SlotStatus, number> = { focus: 1, break: 0, away: 0, empty: 0 };
```

The lamp follows the person: it fades up as they settle into the chair while focusing and
fades down when they stand up. Fade ≈ 0.5 s.

### 4.2 Lighting

Real lights: hemisphere, sun/moon directional (shadow caster on high only), a warm fill
directional. **Zero** point lights on every tier: the 8 seat lamps and the pendant are a uniform
array evaluated in the environment and character shaders (falloff, downward bias, wrap), plus
an emissive shade, an additive glow sprite and the pool that falls out of the shader.
The sun/moon only reaches the room through the window: the directional light is masked by
an analytic window projection (pane grid, mullions, soft edge) with the table and counter as
analytic occluders, so window-grid patches land on the floor, table edge and people on every
tier without a shadow map.

### 4.3 Quality tiers (starting values, tuned after measuring)

| | High | Medium | Low |
|---|---|---|---|
| DPR cap | 2 | 1.5 | 1 |
| Shadow map | 2048, PCF soft | off | off |
| Light shaft + glow sprites | yes | glow only | glow (smaller) |
| Dust motes | 90 | 45 | 0 |
| Steam per mug | 6 | 4 | 2 |
| Rain | full procedural glass | full | scrolling texture |
| Micro-behaviours | all | fewer | existing acts only |
| Character pose update | every frame | every frame | far half at 30 Hz |
| Frame cap | native | native | 30 |

### 4.4 Behaviour per slot

States: `empty → (door) → seated ⇄ standUp/sitDown ⇄ walking ⇄ atDestination(enter/loop/exit)`,
`→ leaving (door) → away`. Any goal change is applied from where the person is: mid-walk they
turn round and re-path; mid-stand they sit back down; at a destination they play a short exit.
Destinations hold reservations (bookshelf 2, window 2, sofa 2, in-place spots unlimited).

---

## 5. Order of work

- **P0** room geometry and materials, both lighting looks, 8 seats + 8 lamps + kits, camera,
  quality tiers, Scene Lab, three screenshot comparison passes. Checkpoint.
- **P1** chairs, walking, bookshelf/window/sofa/in-place breaks, seated pose variety, cats,
  ambient life.
- **P2** door entry and exit, polish.

---

## 6. Where the number 10 is still hard-coded

| Where | What |
|---|---|
| `src/lib/seats.ts` | `ROOM_CAP = 10` and the 10-long `SEAT_FILL_ORDER` |
| `src/screens/Room.tsx` | seat array sized by `ROOM_CAP` |
| `src/screens/Lobby.tsx`, `src/components/SidePanel.tsx` | "n/10" from `ROOM_CAP` |
| `src/screens/Entry.tsx` | copy "for up to 10 people" |
| `supabase/migrations/20261022000000_study_together.sql` | `< 10` (quick join) and `>= 10` (room full) |
| `src/data/demo.ts` | the "Med prep" demo room seeds 9 bots |
| `PROJECT.md` | §1, §3.1, §10.2 |
