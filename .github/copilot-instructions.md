# Copilot Instructions — Code to Figma Plugin

## Project Overview

This is a **Figma Plugin** that converts pasted React/JSX/Tailwind components into Figma nodes using a two-pass Claude API pipeline. The project is in early development (Phase 0). Full plan: `code-to-figma-plan.md`.

## Planned Repository Structure

```
/plugin                    # Figma Plugin root
  manifest.json            # Plugin config — name, permissions, UI size
  src/
    code.ts                # Main plugin thread — ALL figma.* API calls live here
    ui/                    # React sidebar UI (Vite-bundled)
    claude.ts              # Claude API wrapper + prompt templates
    mapper.ts              # CSS/Tailwind → Figma property mapping
    fonts.ts               # Font name normalization + loadFontAsync management
    tokens.ts              # Design token extractor
/web                       # Next.js web app (auth, dashboard, settings — Phase 2+)
  app/api/convert/         # API route: receive code → call Claude → return plugin JS
  app/api/sync/            # GitHub webhook handler (Phase 3)
/.github/workflows/        # CI: lint, type check, plugin build
/docs                      # ADRs, prompt templates
```

**Stack:** React + Vite (Plugin UI) · TypeScript · Claude API (Sonnet) · Figma Plugin API · Next.js + Supabase (web, Phase 2+)

## Core Architecture: Two-Pass Claude Pipeline

Every component conversion runs exactly two Claude calls:

1. **Pass 1 — Extract**: Claude reads the component code and outputs structured JSON: component tree, fills, typography, spacing, design tokens. Validate the JSON before proceeding.
2. **Pass 2 — Generate**: Claude takes the validated JSON and generates Figma Plugin JavaScript using exact Plugin API methods. Font names are normalized in this pass.

The generated JS is then executed inside Figma via the Plugin API.

## Critical Figma API Rules

These are hard constraints — violating them crashes the plugin at runtime:

### Font Loading (non-negotiable order)
```javascript
// 1. Load ALL fonts BEFORE creating any node — not just text nodes
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

// 2. Set fontName BEFORE characters — always
const text = figma.createText();
text.fontName = { family: "Inter", style: "Bold" }; // ← first
text.characters = "Hello";                           // ← second
```

### Async IIFE Wrapper (required for all generated code)
```javascript
(async () => {
  // all plugin logic here — top-level await is not supported in Figma plugins
})();
```

### Font Style Name Normalization
Figma uses different names than CSS. Map them exactly:

| CSS / Weight | Figma Style Name |
|---|---|
| 300 | `"Light"` |
| 400 | `"Regular"` |
| 500 | `"Medium"` |
| 600 | `"Semi Bold"` ← space required |
| 700 | `"Bold"` |
| 800 | `"Extra Bold"` ← space required |
| italic + 700 | `"Bold Italic"` |

Default to `"Regular"` for unknown weights. Never guess font family — fall back to Inter.

### Auto Layout Mapping
```javascript
frame.layoutMode = "VERTICAL";   // flex-col
frame.layoutMode = "HORIZONTAL"; // flex-row
// Always set BOTH sizing modes:
frame.primaryAxisSizingMode = "AUTO";  // or "FIXED"
frame.counterAxisSizingMode = "FIXED"; // or "AUTO"
```

### Common Gotchas
- **No Figma REST API for writing nodes** — the REST API is read-only for file structure. All node creation must happen inside the Plugin (via `code.ts`).
- Colors must be in RGB 0–1 range: `{ r: 0.9, g: 0.27, b: 0.37 }` — not hex, not 0–255.
- `figma.combineAsVariants()` is used for component variant sets (Phase 2).
- For nested components that already exist in Figma, use `figma.createInstance(componentId)` — never rebuild.

## Prompt Engineering Conventions

### Pass 1 Prompt Rules
- Always include design token / theme config alongside the component code when available
- Request structured JSON with an explicit schema — Claude must not invent fields
- Include ALL font weights used so Pass 2 can pre-load them
- Ask Claude to flag ambiguous or missing values explicitly

### Pass 2 Prompt Rules
- Enforce the async IIFE wrapper — it is non-negotiable
- Load every font listed in Pass 1 JSON before creating any node
- Set `fontName` before `characters` — always, without exception
- Use exact Figma font style names (see normalization table above)
- Always set both `primaryAxisSizingMode` and `counterAxisSizingMode`
- Default unknown fonts to Inter Regular — never guess

## Tailwind → Figma Mapping
- Build a base Tailwind-to-pixel lookup table for common utilities (`p-4`, `text-xl`, `rounded-lg`, etc.)
- Parse `tailwind.config.js` alongside components when available and send it as Claude context
- For responsive prefixes (`sm:`, `md:`, `lg:`): generate one labeled frame per breakpoint (Mobile / Tablet / Desktop)

## Error Handling Pattern
- Log every plugin runtime error back with the failing code section for Claude to self-correct
- Show human-readable error messages in the plugin sidebar — never raw JS stack traces
- For unknown fonts: normalize at extraction time, fall back to Inter Regular, and show a warning listing substituted fonts

## Phase Scope Reference
- **Phase 0 (now):** Plugin scaffold + Claude two-pass pipeline + font normalization + basic Auto Layout + React/JSX/Tailwind input
- **Phase 1:** Full plugin UI, color/typography → Figma Styles, published to Figma Community
- **Phase 2+:** GitHub sync, design tokens, component variants, Supabase backend

---

## Triggering the Phase Orchestrator

Prompt files live in `.github/prompts/`. They run in **agent mode** — Copilot reads the codebase, edits files, runs commands, and opens GitHub Issues for delegated tasks autonomously.

### How to invoke in VS Code

**Option A — Phase-specific shortcut (recommended):**
Open Copilot Chat, click the **paperclip / attach** icon → **Prompt...**, then select:

| Command | Phase |
|---|---|
| `implement-phase-0` | Foundation & Prototype |
| `implement-phase-1` | MVP Plugin |
| `implement-phase-2` | Design System Aware |
| `implement-phase-3` | Sync & Automation |
| `implement-phase-4` | Team & Enterprise |

**Option B — Generic orchestrator with input:**
Select `phase-orchestrator` from the prompt picker. Copilot will ask: *"Which phase to implement? (0, 1, 2, 3, or 4)"* — type the number and press Enter.

> **Requires:** VS Code with GitHub Copilot extension. Prompt files need the **agent mode** feature enabled (Copilot settings → Enable agent mode).

### What the orchestrator does

For each phase, the orchestrator:
1. Reads `code-to-figma-plan.md` and `copilot-instructions.md` for full context
2. **Implements** tasks that require multi-file edits directly (Copilot Edits mode)
3. **Delegates** isolated tasks by opening GitHub Issues with full specifications for the coding agent
4. Validates done criteria before finishing

### What gets implemented vs. delegated per phase

| Phase | Orchestrator implements | Coding agent issues opened |
|---|---|---|
| 0 | Plugin scaffold, Claude two-pass pipeline, Auto Layout mapping | `fonts.ts` normalization table, `mapper.ts` Tailwind lookup |
| 1 | Plugin UI, color/typography → Figma Styles, error handling | `hexToFigmaRgb` utility |
| 2 | Token extraction, Figma Variables, variant matrix, batch processing | Tailwind config parser, Supabase migration |
| 3 | Drift detection, update mode, changelog view | GitHub webhook handler, Slack notifications |
| 4 | RBAC + RLS policies, analytics instrumentation | SSO via Supabase Auth, Figma Org API |

---

## GitHub Copilot Agent Workflow by Phase

### Phase 0 — Foundation & Prototype

**Goal:** Plugin scaffold + two-pass Claude pipeline + font normalization working end-to-end.

| Task | Agent | Notes |
|---|---|---|
| Scaffold `manifest.json`, `code.ts`, Vite config, `ui/` | **Copilot Edits** | All files are interdependent — edit them together in one session |
| Implement `fonts.ts` normalization lookup table | **Copilot coding agent** | Well-scoped, zero dependencies — assign as a GitHub Issue |
| Implement `mapper.ts` Tailwind → Figma pixel map | **Copilot coding agent** | Same — isolated pure function, easy to verify |
| Write Pass 1 + Pass 2 prompt templates in `claude.ts` | **Copilot Chat** → **Copilot Edits** | Use Chat to iterate on prompts interactively, then Edits to write final versions to file |
| Debug plugin runtime errors from Figma console | **Copilot Chat** | Paste the error + failing code block; ask for root cause |
| Wire UI textarea → Claude call → plugin execution | **Copilot Edits** | Touches `ui/`, `claude.ts`, and `code.ts` simultaneously |

---

### Phase 1 — MVP Plugin

**Goal:** Full plugin UI, Figma Styles output, published to Figma Community.

| Task | Agent | Notes |
|---|---|---|
| Build React sidebar UI (paste input, run button, error display) | **Copilot Edits** | Keep `ui/` components and their types in the same edit session |
| Color extraction → Figma SOLID fills | **Copilot coding agent** | Assign as issue: "parse hex/rgba from Pass 1 JSON and output `{ type: 'SOLID', color: { r, g, b } }`" |
| Typography extraction → Figma Text Styles | **Copilot coding agent** | Depends on font normalization from Phase 0 being done first |
| Component naming logic (not "Frame 47") | **Copilot Chat** | Discuss heuristics first, then implement with Edits |
| Error handling — unknown fonts, malformed code | **Copilot Edits** | Touches `claude.ts`, `fonts.ts`, and the UI error display together |
| PR review before Figma Community submission | **Copilot for PRs** | Run on the final PR — catches API misuse and plugin gotchas |

---

### Phase 2 — Design System Aware

**Goal:** Batch processing, design tokens → Figma Variables, component variants.

| Task | Agent | Notes |
|---|---|---|
| Parse `tailwind.config.js` and merge with base lookup table | **Copilot coding agent** | Assign as isolated issue; input/output is clear |
| Design token extraction (`tokens.ts`) via Style Dictionary | **Copilot Edits** | Will touch `tokens.ts`, Pass 1 prompt, and mapper simultaneously |
| Figma Variables creation from color/spacing tokens | **Copilot Edits** | Complex Figma API surface — keep `code.ts` and `tokens.ts` in the same session |
| Component variant detection + `figma.combineAsVariants()` | **Copilot Chat** first | Variant matrix logic is subtle — design the schema in Chat before writing code |
| Supabase schema + component registry (for nested instances) | **Copilot coding agent** | Well-scoped DB task: "create a components table with figmaId, name, lastSyncedAt" |
| GitHub / folder upload scan | **Copilot Edits** | Touches web API route + plugin trigger together |
| Batch processing (10–50 components) | **Copilot Edits** | Modify `claude.ts` (batching) and `code.ts` (placement grid) together |

---

### Phase 3 — Sync & Automation

**Goal:** GitHub Webhooks, drift detection, update mode.

| Task | Agent | Notes |
|---|---|---|
| GitHub Webhook handler (`/web/app/api/sync`) | **Copilot coding agent** | Assign as issue with the payload schema and expected behavior |
| Drift detection logic (Figma state vs latest code) | **Copilot Chat** → **Copilot Edits** | Algorithm needs discussion first; the implementation touches multiple files |
| Update mode — modify existing nodes vs create duplicates | **Copilot Edits** | Requires changes to `code.ts` registry lookup and the sync API route |
| Slack / email notification integration | **Copilot coding agent** | Isolated integration — assignable as a standalone issue |
| Changelog view between syncs | **Copilot Edits** | UI + backend diff logic together |
| Review webhook security (signature validation) | **Copilot for PRs** | Must not be merged without review — flag this in the PR |

---

### Phase 4 — Team & Enterprise

**Goal:** Multi-user, SSO, analytics, Figma Organization support.

| Task | Agent | Notes |
|---|---|---|
| SSO / enterprise auth integration | **Copilot coding agent** | Well-defined scope; use Supabase Auth providers |
| Usage analytics instrumentation | **Copilot coding agent** | Assign with clear event schema: which events, what properties |
| Role-based access control | **Copilot Edits** | Touches Supabase RLS policies + API middleware + UI gating together |
| Figma Organization API integration | **Copilot Chat** first | Org-level API has different auth scopes — verify in Chat before coding |

---

### General Agent Rules for This Project

- **Always use Copilot Edits** when a change touches `code.ts` + any other file — the Figma Plugin main thread and its callers must stay in sync.
- **Use coding agent for `fonts.ts` and `mapper.ts` tasks** — they are pure functions with clear inputs/outputs and no side effects, making them ideal for autonomous implementation.
- **Never use coding agent for Pass 1/Pass 2 prompt changes** — prompt engineering requires tight iteration; use Chat interactively instead.
- **Always run Copilot for PRs** before any release to Figma Community or any change to the webhook handler.
