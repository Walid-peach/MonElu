# MonÉlu Frontend Design System

This document describes the visual language of the MonÉlu frontend as it exists in code today.
The design is civic and editorial: a navy/red/white palette with a typographic system that pairs editorial serifs for headings against a clean sans for the interface.

The canonical sources of truth are `tailwind.config.ts` (colors, font roles, type scale) and `src/app/globals.css` (base element styles and utilities).
This document is descriptive - if it ever disagrees with those files, the config wins, and this document should be corrected.
Architecture and data concerns are out of scope; see [`../CLAUDE.md`](../CLAUDE.md) and [`../docs/decisions.md`](../docs/decisions.md).

## Color palette

Defined under `theme.extend.colors` in `tailwind.config.ts`.

| Token | Value | Role |
|-------|-------|------|
| `navy` (DEFAULT) | `#0D1F3C` | Primary brand navy; default text color |
| `navy.light` | `#1A3258` | Lighter navy for hover states |
| `navy.muted` | `rgba(13,31,60,0.06)` | 6% navy tint for subtle backgrounds |
| `red.civic` | `#C9302C` | Primary accent / CTA red |
| `red.light` | `#E8413D` | Lighter red for hover states |
| `gray.off` | `#F8F7F4` | Off-white page background (`body` uses `bg-gray-off`) |
| `gray.light` | `#EDECEA` | Light gray surfaces and dividers |
| `gray.mid` | `#8A8885` | Medium gray for muted/secondary text |
| `gray.border` | `#E0DED9` | Border stroke color |

The mobile browser chrome theme color is `#0D1F3C` (navy), set via `viewport.themeColor` in `layout.tsx`.

### Semantic badge classes

Defined in the `@layer utilities` block of `globals.css`.

| Class | Use | Style |
|-------|-----|-------|
| `.badge-adopte` | Vote passed | Emerald background, emerald text and border |
| `.badge-rejete` | Vote rejected | Red-50 background, `red-civic` text, red border |
| `.badge-party` | Party label | `navy-muted` background, navy text |

All three share `text-xs font-medium px-2 py-0.5 rounded`.

## Typography

The system uses four font roles with explicit responsibilities.
This contract is documented at the top of `tailwind.config.ts` and must be respected when building new UI.

| Role | Font | Use case |
|------|------|----------|
| `font-serif` | DM Serif Display | Landing page hero `h1` only |
| `font-newsreader` | Newsreader | Editorial headings (`h1`/`h2`/`h3`) on all data pages |
| `font-sans` | DM Sans | Body copy, UI labels, navigation, buttons |
| `font-mono` | System monospace | Numbers, dates, metadata, code blocks |

### Font loading

Fonts are loaded via `next/font/google` in `layout.tsx` with `display: 'swap'` so fallback fonts render immediately.
Each exposes a CSS variable consumed by the Tailwind `fontFamily` config.

| Font | CSS variable | Weights | Styles |
|------|--------------|---------|--------|
| DM Serif Display | `--font-serif` | 400 | normal, italic |
| Newsreader | `--font-newsreader` | 400, 500, 600, 700 | normal, italic |
| DM Sans | `--font-sans` | 400, 500, 600 | normal |

`font-mono` is a pure system stack (`ui-monospace`, `SFMono-Regular`, `Menlo`, monospace) and loads no web font.
Fallback chains: serif and newsreader fall back to `Georgia, serif`; sans falls back to `system-ui, sans-serif`.

### Base element defaults

From the `@layer base` block in `globals.css`:

- `body` defaults to `font-sans` with navy text (`text-navy`).
- `h1`, `h2`, `h3` default to `font-newsreader`.

### Exception

`AssemblyScrollExperience` (the cinematic landing scroll) uses inline styles rather than these tokens, because its colors, opacities, and sizes are computed dynamically per scroll position.
This is the one intentional departure from the system.

## Type scale

Named heading sizes defined under `theme.extend.fontSize` in `tailwind.config.ts`.
Use these classes on headings instead of inline `fontSize` - this is the convention unified by MON-72 (commit `6b31959`).

| Class | Size | px | Line height | Intended use |
|-------|------|-----|-------------|--------------|
| `text-headline` | `3.25rem` | 52 | 1.06 | Hero `h1` |
| `text-display` | `3rem` | 48 | 1.1 | List page `h1` (sets `fontWeight: 400`) |
| `text-title` | `2.75rem` | 44 | 1.05 | Detail page `h1` |
| `text-section-lg` | `2.625rem` | 42 | 1.1 | Major section `h2`, stat numbers |
| `text-section` | `2.375rem` | 38 | 1.1 | Section `h2` |
| `text-section-sm` | `1.875rem` | 30 | 1.1 | Sub-section `h2` |
| `text-display-sm` | `2rem` | 32 | 1.15 | Legacy alias |

Note: `text-display` carries an explicit `fontWeight: 400` so the list-page heading stays regular weight.

## Spacing and layout

- Spacing follows an 8px base unit; common Tailwind steps are `px-4`/`px-8` (mobile/desktop padding), `py-4`/`py-8`/`py-16`, `gap-2`/`gap-8`, and `mt-6`/`mt-8` between sections.
- Container widths: `max-w-7xl` (1280px) for main content, `max-w-xl` for the hero text column.
- Navigation height is fixed at `NAV_HEIGHT_PX = 64`, defined in `src/components/Nav.tsx`.
- Layout is mobile-first; the `md:` breakpoint (768px) is the desktop threshold and switches the header navigation and grid layouts.
- A representative two-column desktop grid uses `md:grid-cols-[1fr_0.76fr]`.
- The `.sp` utility in `globals.css` provides a thin (9px), semi-transparent scrollbar for the cinematic scroll container.

## Components

Reusable components live in `src/components/`.

| Component | Role |
|-----------|------|
| `Nav` | Desktop header navigation (64px height) |
| `BottomNav` | Mobile footer navigation |
| `MonEluLogo` | Responsive logo with configurable size and variant |
| `DeputyAvatar` | Avatar with four sizes (sm/lg/xl/2xl) and initials fallback |
| `HeroSearch` | Search form with postal-code resolution |
| `ChatRedirectInput` | Chat entry input |
| `PageTransition` | Framer Motion page-transition wrapper |
| `ShareButton` | Native share API with clipboard fallback |

Subfolders group page-specific pieces: `home/` (landing components such as `AssemblyScrollExperience`, `LiveAssemblyPulse`, `TrustRow`) and `chat/` (chat UI).

### Server/client split

Pages follow the Next.js App Router convention of a server component that renders a client island named `*Client.tsx` (for example `DeputiesClient.tsx`, `VotesClient.tsx`, `VoteDetailClient.tsx`).
Interactive search, filtering, and stateful UI live in the client island; data fetching and static generation stay on the server.

## Conventions

- Mobile-first responsive design with a single `md:` (768px) desktop threshold.
- French locale throughout (`lang="fr"`, French copy).
- Accessibility: ARIA labels, `sr-only` helper text, and semantic HTML.
- PWA support via service-worker caching and a web manifest.
