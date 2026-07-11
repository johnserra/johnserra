---
task: "Editorial Terminal redesign — implement approved plan"
project: johnserra
effort: E3
effort_source: context-override
phase: execute
progress: 25/32
mode: interactive
started: 2026-07-11T07:40:00-04:00
updated: 2026-07-11T07:40:00-04:00
---

## Problem

johnserra.com wears IBM Carbon design language (Plex fonts, carbon blue #0f62fe, 2px corners) — functional but generic. John approved a full look-and-feel restyle to the "Editorial Terminal" aesthetic extracted from unlock-ai.natebjones.com, with three locked decisions: Anton display font, dark-only (light mode retired), 8px soft radius. Plan: `~/.claude/PAI/MEMORY/WORK/20260711-johnserra-redesign-plan/REDESIGN_PLAN.md`.

## Vision

John opens the preview URL and the site feels like an expensive print artifact rendered as a terminal — his name in enormous compressed poster type with SERRA in cyan, warm off-white ink on layered near-black, hairline panels, film grain. Unmistakably the same design family as the sample, unmistakably still his site.

## Out of Scope

- No content, copy, IA, route, or i18n changes (EN/TR preserved).
- No framework/infra changes — Next.js 16, Tailwind v4, Keystatic, Supabase, Vercel stay.
- No feature changes — chat widget, contact form, blog, projects behave identically.
- No production promotion and no git push without John's explicit approval.
- No light mode — retired per decision Q2.

## Constraints

- Tailwind v4 CSS-first theming: all tokens in `@theme` in `src/app/globals.css`.
- Fonts via `next/font/google` only: Geist, Geist Mono, Anton (Avenir is commercial — banned).
- All fonts must load `latin-ext` subset (Turkish diacritics).
- Colors flow through CSS custom properties — zero scattered hardcodes of new palette.
- Commit to `main` locally (single-author private repo policy); push only with approval.

## Goal

The deployed preview renders every route (home, blog, post, projects, project, about, contact) in the Editorial Terminal token system — new palette, Geist/Geist Mono/Anton, grain, hairline 8px panels, poster hero — with a clean build, zero legacy Carbon color references, and both locales intact.

## Criteria

Phase 1 — token layer:
- [x] ISC-1: globals.css @theme defines bg tokens #0c0c0e / #161618 / #1a1a1d / #1c1c1f / #222226
- [x] ISC-2: globals.css defines ink tokens #eae6df / #c2bfb8 / #88857f / #56554f
- [x] ISC-3: globals.css defines accent system #18c1e8 / #0f7e98 / #18c1e81f wash / #06232b on-accent
- [x] ISC-4: globals.css defines status tokens #3ae88d / #ffdf43 / #f2453d / #443bf4
- [x] ISC-5: globals.css defines hairline tokens #242528 / #2c2d31 / #3a3b41
- [x] ISC-6: radius tokens: 8px cards, 6px inputs, 99px pills; --radius-bento = 8px
- [x] ISC-7: [locale]/layout.tsx loads Geist, Geist Mono, Anton via next/font/google with latin-ext
- [x] ISC-8: Grain overlay element renders site-wide (pure CSS/SVG noise, no asset request)
- [x] ISC-9: Light-mode override block and theme-switch script removed; html locked dark
- [x] ISC-10: `next build` (via bun) exits 0 after Phase 1

Phases 2–3 — chrome and bento:
- [x] ISC-11: Header: hairline-bottom topbar, uppercase mono nav links, cyan active state
- [x] ISC-12: Footer: hairline-top, muted ink, mono metadata styling
- [x] ISC-13: HeroBox: uppercase Anton poster type, line-height ≤0.9, clamp()-scaled, scaleX compression
- [x] ISC-14: HeroBox: exactly one word/segment in cyan #18c1e8; gradient background removed
- [x] ISC-15: BentoBox: #1c1c1f panel, 1px #242528 hairline, 8px radius, hover hairline #3a3b41
- [x] ISC-16: All 7 bento components use new tokens (grep: no from-blue/to-purple/carbon- classes)
- [x] ISC-17: Bento box labels: uppercase, letter-spaced (≥.08em), Geist Mono

Phases 4–5 — UI kit and content surfaces:
- [x] ISC-18: Button: primary = cyan fill + #06232b text; secondary = hairline ghost; pill radius
- [x] ISC-19: Tag/FilterGroup: pill hairline chips, cyan active state
- [x] ISC-20: TextInput/TextArea: #161618 field, hairline border, cyan focus ring
- [x] ISC-21: Callout/InlineNotification: status colors from new palette on soft washes
- [x] ISC-22: IconButton: hairline ghost treatment, cyan hover
- [x] ISC-23: Blog index + post pages: panel cards, warm ink prose, mono uppercase metadata
- [x] ISC-24: Projects index + detail: same panel/prose treatment
- [x] ISC-25: ProseLayout: measure ~70ch, warm ink headings with -.02em tracking

Phase 6 — polish and verification:
- [ ] ISC-26: AIChatWidget: panel language, cyan-wash user bubbles, #1c1c1f assistant bubbles
- [ ] ISC-27: Grep across src/ returns zero #0f62fe, carbon-blue, carbon-gray, IBM_Plex references
- [ ] ISC-28: Interceptor screenshots verified: /en home, /tr home, /en/blog, one post, /en/contact
- [ ] ISC-29: Turkish locale renders correctly with new fonts (Interceptor /tr screenshot, diacritics intact)
- [ ] ISC-30: Vercel preview deployment live and verified via Interceptor at preview URL
- [ ] ISC-31: Anti: production domain johnserra.com unchanged (no promote, no push) until John approves
- [ ] ISC-32: Antecedent: four design pillars hold on every verified route — warm near-black ground, sparing cyan, poster display type, hairline panels

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| 1–7, 9 | code | tokens/fonts present in globals.css + layout.tsx | exact values | Grep/Read |
| 8 | ui | grain visible, no network request for texture | screenshot + network log | Interceptor |
| 10 | build | next build exit code | 0 | Bash |
| 11–26 | code+ui | new classes present, old classes absent, rendered correctly | grep + screenshot | Grep + Interceptor |
| 27 | regression | legacy token grep across src/ | 0 matches | Grep |
| 28–29 | ui | five routes + TR diacritics | visual pass | Interceptor |
| 30 | deploy | preview URL renders new design | screenshot at preview URL | Vercel MCP + Interceptor |
| 31 | anti | prod unchanged | old design still live on johnserra.com until approval | curl/Interceptor |
| 32 | antecedent | pillars on every screenshot | all four visible | Interceptor review |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| token-layer | globals.css @theme + fonts + grain + dark-only | ISC-1..10 | — | no (everything depends on it) |
| chrome | Header/Footer restyle | ISC-11..12 | token-layer | yes |
| bento-hero | 7 bento components + poster hero | ISC-13..17 | token-layer | yes |
| ui-kit | 10 ui components sweep (Forge) | ISC-18..22 | token-layer | yes (Forge, disjoint files) |
| content-surfaces | blog/projects/prose | ISC-23..25 | token-layer | yes |
| polish-verify | widget, grep sweep, screenshots, preview deploy | ISC-26..30 | all above | no |

## Decisions

- 2026-07-11T07:40 — Tier E3 via conversation-context override: classifier returned MINIMAL on "go" (too short); thread context = approval of multi-step plan. Doctrine's canonical override example.
- 2026-07-11T07:40 — ISA skill: Scaffold workflow loaded and executed earlier this session; project ISA written directly per that workflow rather than re-invoking the Skill tool for identical content (context economy).
- 2026-07-11T07:40 — Delegation: Forge gets ui-kit (10 disjoint files) AFTER token-layer lands, so it follows an established vocabulary. Second delegation slot relaxed, show-your-math: chrome/bento/content phases share the hero's taste-sensitive treatment decisions — single-hand consistency beats parallel speed; worktree isolation unnecessary (disjoint file sets).
- 2026-07-11T07:40 — Keep Tailwind utility-class idiom in components (match existing code style) rather than introducing CSS-module classes like the sample — the sample's look, this repo's idiom.
