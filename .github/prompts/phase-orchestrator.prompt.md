---
tools:
  - codebase
  - editFiles
  - runCommands
  - problems
  - new
description: >
  Orchestrates implementation of a Code-to-Figma plugin phase.
  Pass the phase number as input (0, 1, 2, 3, or 4).
---

# Phase Orchestrator — Code to Figma Plugin

You are implementing **Phase ${input:phase:Which phase to implement? (0, 1, 2, 3, or 4)}** of the Code to Figma Figma Plugin project.

## Before You Start

1. Read `code-to-figma-plan.md` fully — it is the source of truth for scope and architecture.
2. Read `.github/copilot-instructions.md` — it defines all Figma API rules, the two-pass Claude pipeline pattern, and which tasks are yours to implement vs. which should be delegated.
3. Check what already exists in the repo before creating anything.

## Your Responsibilities as Orchestrator

You implement tasks that require **multi-file edits** (files that must stay in sync with each other). For tasks explicitly marked as "Copilot coding agent" in the instructions, you must instead open a GitHub Issue with a precise specification so the coding agent can handle it autonomously.

Follow the phase-specific playbook below for Phase ${input:phase}.

---

## Phase 0 — Foundation & Prototype

> Implement only if Phase = 0

### What you implement directly (multi-file):

1. **Plugin scaffold** — create these files together so they are consistent:
   - `plugin/manifest.json` — name: "Code to Figma", permissions: `["currentpage"]`, ui: `"ui.html"`, api version: `"1.0.0"`
   - `plugin/src/code.ts` — entry point; listen for `figma.ui.onmessage`, wrap all logic in `(async () => {})()`, call `figma.closePlugin()` at end
   - `plugin/src/ui/App.tsx` — textarea for pasting code, "Convert" button, error display area, loading state
   - `plugin/src/ui/main.tsx` — Vite React entrypoint
   - `plugin/ui.html` — Vite-bundled single HTML file
   - `plugin/vite.config.ts` — output `ui.html` to plugin root; separate build for `code.ts`
   - `plugin/tsconfig.json` — target ES2017, lib includes `["dom", "es2017"]`
   - `plugin/package.json` — React, Vite, TypeScript, `@figma/plugin-typings`

2. **Claude API integration** (`plugin/src/claude.ts` + `plugin/src/code.ts` together):
   - Pass 1 prompt: extract component tree, fills, typography, spacing as structured JSON
   - Pass 2 prompt: generate async IIFE Figma plugin JS from Pass 1 JSON
   - Validate Pass 1 JSON before calling Pass 2
   - Return human-readable error to UI on any failure

3. **Auto Layout wiring** (`plugin/src/mapper.ts` + `plugin/src/code.ts` together):
   - Map `flex-col` → `layoutMode: "VERTICAL"`, `flex-row` → `layoutMode: "HORIZONTAL"`
   - Always set both `primaryAxisSizingMode` and `counterAxisSizingMode`
   - Map padding/gap values from Tailwind classes

### What you delegate — open GitHub Issues for these:

- **Issue: "Implement font name normalization table in fonts.ts"**
  Body: Create `plugin/src/fonts.ts` with a `normalizeFontStyle(weight: number, italic: boolean): string` function. Lookup table: 300→"Light", 400→"Regular", 500→"Medium", 600→"Semi Bold", 700→"Bold", 800→"Extra Bold", italic+700→"Bold Italic". Default unknown weights to "Regular". Export a `loadAllFonts(fonts: FontDescriptor[])` that awaits `figma.loadFontAsync` for each. Tests: verify "SemiBold" is never returned.

- **Issue: "Implement Tailwind → Figma pixel lookup table in mapper.ts"**
  Body: Create `plugin/src/mapper.ts` with a `tailwindToPixels(className: string): number | null` function. Cover: spacing (`p-1`=4px to `p-16`=64px), text sizes (`text-sm`=14, `text-base`=16, `text-xl`=20, `text-2xl`=24), border radius (`rounded`=4, `rounded-md`=6, `rounded-lg`=8, `rounded-full`=9999). Return null for unknown classes.

### Done when:
- [ ] Plugin loads in Figma without errors (test by running in Figma desktop app)
- [ ] Pasting a React/Tailwind button component produces a Figma frame with correct layout
- [ ] Font loading errors do not crash the plugin — they surface in the UI

---

## Phase 1 — MVP Plugin

> Implement only if Phase = 1

**Prerequisite:** Phase 0 must be complete.

### What you implement directly (multi-file):

1. **Plugin UI sidebar polish** (`plugin/src/ui/` files together):
   - Styled textarea with placeholder: "Paste your React, JSX, or Tailwind component here"
   - "Convert to Figma" primary button with loading spinner
   - Error banner with readable message (never raw stack traces)
   - Success state showing component name created

2. **Color extraction pipeline** (`plugin/src/claude.ts` + `plugin/src/code.ts`):
   - Pass 1 JSON schema must include `fills: Array<{ hex: string, opacity?: number }>`
   - In `code.ts`: convert hex → `{ r, g, b }` in 0–1 range before setting `.fills`
   - Create Figma Paint Styles for extracted colors, not raw fills on nodes

3. **Typography → Figma Text Styles** (`plugin/src/claude.ts` + `plugin/src/fonts.ts` + `plugin/src/code.ts`):
   - Pass 1 JSON must include all font families, weights, and sizes used
   - Create named Figma Text Styles: `{ComponentName}/{role}` (e.g., `Button/Label`)
   - Apply styles to text nodes via `node.textStyleId`

4. **Component naming** (`plugin/src/claude.ts`):
   - Pass 1 JSON must include a `componentName` field inferred from the code (not "Frame")
   - Top-level frame gets this name; child frames get `{componentName}/{role}`

5. **Error handling hardening** (`plugin/src/claude.ts` + UI):
   - Unknown font → log substitution, fall back to Inter Regular, show warning banner listing substituted fonts
   - Malformed code → Pass 1 returns a validation error field; show it in UI before Pass 2 runs
   - API timeout → retry once, then show "Claude API unavailable" message

### What you delegate — open GitHub Issues for these:

- **Issue: "Add hex-to-figma-rgb conversion utility"**
  Body: In `plugin/src/mapper.ts`, add `hexToFigmaRgb(hex: string): RGB` that converts any 3- or 6-digit hex (with or without `#`) to `{ r, g, b }` in 0–1 range. Handle opacity via 8-digit hex. Throw a descriptive error on invalid input.

### Done when:
- [ ] Color and typography styles appear in Figma's local styles panel after conversion
- [ ] Component frame is named after the actual component, not "Frame N"
- [ ] All error states show readable messages in the sidebar

---

## Phase 2 — Design System Aware

> Implement only if Phase = 2

**Prerequisite:** Phase 1 must be complete.

### What you implement directly (multi-file):

1. **Design token extraction** (`plugin/src/tokens.ts` + `plugin/src/claude.ts` + Pass 1 prompt):
   - Parse `tailwind.config.js` theme values when provided alongside the component
   - Send parsed config as Claude context in Pass 1 so it uses actual project values
   - Pass 1 JSON schema extended with `tokens: { colors, spacing, radii, typography }`

2. **Figma Variables from tokens** (`plugin/src/tokens.ts` + `plugin/src/code.ts`):
   - Create a Figma Variable Collection named after the design system
   - Create variables for each color, spacing, and radius token
   - Bind variables to node properties using `node.setBoundVariable()`

3. **Component variant matrix** (`plugin/src/claude.ts` + `plugin/src/code.ts`):
   - Pass 1 must detect all prop combinations (e.g., `variant: primary|ghost`, `size: sm|lg`)
   - Pass 2 generates a `figma.combineAsVariants()` ComponentSet
   - Each variant is a child Component named with Figma's `Property=Value` convention

4. **Supabase component registry** (`/web/` API routes + Supabase schema):
   - Table: `components(id, figma_component_id, name, file_key, last_synced_at, source_hash)`
   - Before creating a node, check registry for existing component by name
   - If found, use `figma.createInstance(componentId)` instead of rebuilding

5. **Batch processing** (`plugin/src/claude.ts` + `plugin/src/code.ts`):
   - Accept array of component code strings
   - Run Pass 1 for all components, then Pass 2 in sequence
   - Place resulting frames in a grid on the canvas (auto-spacing)

### What you delegate — open GitHub Issues for these:

- **Issue: "Implement Tailwind config parser"**
  Body: In `plugin/src/tokens.ts`, add `parseTailwindConfig(configSource: string): DesignTokens`. Accept the raw JS/TS source of `tailwind.config.js` as a string. Extract `theme.colors`, `theme.spacing`, `theme.borderRadius`, `theme.fontFamily`. Return a typed `DesignTokens` object. Handle `extend` merging correctly. Use no Node.js file system APIs — the input is always a string.

- **Issue: "Create Supabase components table migration"**
  Body: Create `/web/supabase/migrations/001_components.sql`. Table: `components` with columns `id uuid primary key default uuid_generate_v4()`, `figma_component_id text not null`, `name text not null`, `file_key text not null`, `last_synced_at timestamptz`, `source_hash text`. Add index on `(file_key, name)`. Enable RLS. Policy: select/insert/update for authenticated users only.

### Done when:
- [ ] Figma Variables panel shows tokens after conversion of a component with a Tailwind config
- [ ] A Button with `variant` and `size` props produces a Figma Component Set
- [ ] Second conversion of same component uses instance, not a duplicate frame

---

## Phase 3 — Sync & Automation

> Implement only if Phase = 3

**Prerequisite:** Phase 2 must be complete.

### What you implement directly (multi-file):

1. **Drift detection** (`/web/app/api/drift/` + Supabase query):
   - Hash current component source code; compare with `source_hash` in registry
   - Query Figma API for current component properties; diff against stored Pass 1 JSON
   - Return structured diff: `{ added, removed, changed }` fields

2. **Update mode** (`plugin/src/code.ts` + `/web/app/api/convert/`):
   - Accept optional `existingNodeId` parameter
   - If provided, update node properties in-place instead of creating new frame
   - Preserve node position and parent on update

3. **Changelog view** (`/web/` UI + drift API):
   - Display per-component diff between last sync and current code
   - Show property-level changes: fill changed from X to Y, text changed, padding changed

### What you delegate — open GitHub Issues for these:

- **Issue: "Implement GitHub Webhook handler at /web/app/api/sync"**
  Body: POST handler for GitHub `push` and `pull_request` (closed + merged) events. Validate `X-Hub-Signature-256` header using `GITHUB_WEBHOOK_SECRET` env var — reject unsigned requests with 401. On valid push to main branch, extract list of changed `.tsx`/`.jsx` files. Trigger conversion pipeline for each. Store results in Supabase `sync_runs` table with `status`, `triggered_by`, `files_changed`, `created_at`. Return 200 immediately; processing is async.

- **Issue: "Implement Slack notification on sync complete"**
  Body: In `/web/lib/notifications.ts`, add `sendSlackNotification(webhookUrl: string, summary: SyncSummary)`. `SyncSummary`: `{ componentsAdded: number, componentsUpdated: number, errors: string[], figmaFileUrl: string }`. Format as a Slack Block Kit message. Called after each sync run completes.

### Done when:
- [ ] Merging a PR that changes a component file triggers an automatic Figma update
- [ ] Drift is detected and shown in the changelog when code changes without a sync
- [ ] Webhook rejects requests with invalid signatures

---

## Phase 4 — Team & Enterprise

> Implement only if Phase = 4

**Prerequisite:** Phase 3 must be complete.

### What you implement directly (multi-file):

1. **Role-based access control** (`/web/` middleware + Supabase RLS + UI gating):
   - Roles: `viewer`, `editor`, `admin`
   - Supabase RLS policies per role on `components`, `sync_runs` tables
   - Middleware: check role before any sync or conversion API call
   - UI: disable "Convert" and "Sync" buttons for `viewer` role

2. **Usage analytics instrumentation** (`/web/lib/analytics.ts` + event calls throughout):
   - Events: `conversion_started`, `conversion_succeeded`, `conversion_failed`, `sync_triggered`, `drift_detected`
   - Properties on each: `componentName`, `phase`, `durationMs`, `errorCode` (if applicable)
   - Write to Supabase `analytics_events` table; aggregate in a dashboard query

### What you delegate — open GitHub Issues for these:

- **Issue: "Add SSO via Supabase Auth providers"**
  Body: Configure Google and GitHub OAuth providers in Supabase Auth. Add `/web/app/auth/callback/route.ts` to handle the OAuth redirect. Store `provider` and `provider_user_id` in the `profiles` table. Protect all API routes with `supabase.auth.getUser()` check. Return 401 with `{ error: "Unauthorized" }` if no valid session.

- **Issue: "Create Figma Organization API integration"**
  Body: In `/web/lib/figma-org.ts`, add `getOrgComponents(orgId: string, token: string)` using Figma REST API `GET /v1/teams/{org_id}/components`. Handle pagination. Return typed `FigmaComponent[]`. Note: Org API requires an Organization plan token — document this requirement in a README note.

### Done when:
- [ ] Viewer-role users cannot trigger conversions or syncs
- [ ] Analytics dashboard shows weekly conversion and sync counts
- [ ] SSO login works end-to-end in production

---

## Rules for All Phases

- **Never skip the two-pass pipeline.** Do not generate Figma code directly from raw component source — always Pass 1 JSON first.
- **Never set `node.characters` before `node.fontName`.** This crashes Figma.
- **Never write to Figma via the REST API.** All node creation must happen inside `code.ts` via the Plugin API.
- **All generated plugin code must be wrapped in `(async () => { })()`.** No exceptions.
- **Font style names must use spaces:** `"Semi Bold"` not `"SemiBold"`, `"Extra Bold"` not `"ExtraBold"`.
- When creating GitHub Issues for the coding agent, write the full specification in the issue body — the agent has no other context.
