# AGENTS.md

Working notes for coding agents on this repository.

## Project

**Study Together** — a mobile-first web app. A shared study room where people sit
in the same pixel-art room, each running their own independent Pomodoro timer.

Full product and technical specification: `docs/PROJECT_BRIEF.md`. It is the
source of truth for behaviour — read it before building anything beyond
scaffolding.

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16**, App Router, `src/` layout |
| Language | **TypeScript**, `strict: true` |
| UI | **React 19** |
| Styling | **Vanilla CSS** — global stylesheet at `src/app/globals.css`, CSS custom properties for tokens |
| Scene | **Three.js** (`three` + `@types/three`), isolated in `src/scene` |
| Package manager | npm |

## Rules

### Vanilla CSS, minimal dependencies

No CSS framework, no CSS-in-JS, no preprocessor, no UI component library. Style
with plain CSS and the custom properties on `:root`. Every added dependency must
earn its place — the shipped JS budget is small and this app is
mobile-performance-sensitive, so "we could add a package for that" is not a
reason. Prefer solving it in the platform.

### Do not edit `src/scene` unless the task says so

`src/scene` is owned by the separate Three.js build. Do not create, modify, move
or delete anything inside it, and do not import from it, unless the task
explicitly directs work on the scene build. If app-side work seems to need a
change there, stop and raise it.

### Never commit, push or deploy — the owner handles git

Do not run `git commit`, `git push`, `git tag`, or any deploy. Do not modify git
configuration or bypass hooks. Leave changes in the working tree for the owner to
review and commit. Read-only git commands (`status`, `diff`, `log`) are fine.