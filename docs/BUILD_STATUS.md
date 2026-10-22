# Build status

Last updated: 2026-10-22 (initial build session).

## How to run
- `npm install && npm run dev` → http://localhost:5173 (demo mode when no Supabase env vars).
- `npm run build` (runs `tsc -b` then `vite build`); `npm run typecheck`.
- Demo helpers: `?skip=<minutes>` on a room URL shifts the demo clock (preview breaks); `?quality=low|medium|high` forces a 3D tier.
- Real backend: follow `docs/SETUP.md`.

## Architecture (where things live)
- `src/lib/` timer derivation (`timer.ts`, phase = elapsed mod cycle), deterministic seat assignment (`seats.ts`), avatar variants (`avatars.ts`), localStorage helpers, tiny pushState router.
- `src/data/` one `Backend` interface (`types.ts`) with `demo.ts` (BroadcastChannel + deterministic bots) and `supabase.ts` (anon auth, RPCs, private Realtime channel with Presence + Broadcast). `index.ts` picks demo when env vars are missing. Supabase JS is lazy-loaded.
- `src/scene/` plain three.js, code-split (only imported by `components/StudyScene.tsx` and the avatar thumbnails hook).
  - `toon.ts` shared materials (one vertex-colour MeshToonMaterial, one normal-inflated outline shader, one unlit), `GeoBuilder` that merges primitives with baked colours.
  - `character.ts` chibi builder (geometry cached per variant, merged per bone), procedural animation with analytic 2-bone arm IK, status-driven acts.
  - `room.ts` diorama, per-seat props (different per seat), armchair reader, cat, lamps.
  - `ambient.ts` rain-window shader, GPU point sprites (motes, steam, fairy lights).
  - `index.ts` renderer, quality tiers + adaptive downgrade, camera framing/drift/parallax/drag, DOM name labels, avatar thumbnails.
- `src/screens/` Entry, Lobby, Room. `src/components/` panel, break overlay/interstitial, BreakAd placeholder, Turnstile, icons.
- `src/audio/engine.ts` WebAudio rain / room tone + vinyl crackle / chime; music from `public/music/manifest.json`.
- `supabase/migrations/` schema, RLS, RPCs, Realtime policies.

## Done
- Milestone 1: scaffold, tokens, data layer + demo, routing, timer.
- Milestone 2: scene (room, 10 seats, characters, ambient life, camera, tiers).
- Milestone 3: room UI (timer pill, control bar, combined people+chat panel, away/auto-away, break screen, interstitial with cap, first-break notice, ad-block note, report, kick).
- Milestone 4: Supabase implementation, migration, SETUP.md, Turnstile.
- Milestone 5: polish/perf pass (see below).

## Known issues / not verified
- Supabase path is written against supabase-js 2.45 and the documented `realtime.send` + Realtime Authorization APIs but has NOT been run against a live project yet. First thing to test after SETUP.md.
- Demo mode cap: bots + other tabs can exceed 10 locally; unseated people show in the list but not in the scene. The real cap is server-side.
- Bot chat/away in demo ignores `?skip`.
- Performance measured only on an M-series Mac (high tier ~185 draw calls incl. shadow pass). Not yet profiled on a real mid-range Android; adaptive downgrade should handle it.
- iOS gyro parallax is not enabled (it needs a permission prompt); pointer/drag still work.

## Next steps (suggested)
- Run SETUP.md end to end and test two browsers in one room.
- Profile on a mid-range Android; tune `TIER_CFG` in `src/scene/index.ts`.
- Add real music files and an ad network inside `BreakAd`.
