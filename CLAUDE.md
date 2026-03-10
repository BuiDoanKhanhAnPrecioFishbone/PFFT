# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Code to Figma** is a Figma Plugin that converts pasted React/JSX/Tailwind components into Figma nodes using a two-pass Claude API pipeline. Full plan: `code-to-figma-plan.md`. Currently in **Phase 0** (plugin scaffold + proof of concept).

## Target Stack

| Layer | Technology |
|-------|-----------|
| Plugin UI | React + Vite (bundled into single HTML) |
| Plugin Logic | TypeScript (`code.ts`) — Figma Plugin API |
| AI Core | Claude API (Sonnet) |
| Web App (Phase 2+) | Next.js + Supabase |
| Token Parsing (Phase 2+) | Style Dictionary |

## Planned Repository Structure

```
/plugin
  manifest.json        # Plugin config — name, permissions, UI size
  src/
    code.ts            # Main plugin thread — ALL figma.* API calls live here
    ui/                # React sidebar UI (Vite-bundled)
    claude.ts          # Claude API wrapper + prompt templates
    mapper.ts          # CSS/Tailwind → Figma property mapping
    fonts.ts           # Font name normalization + loadFontAsync management
    tokens.ts          # Design token extractor (Phase 2)
/web                   # Next.js web app (Phase 2+)
  app/api/convert/     # API route: code → Claude → plugin JS
  app/api/sync/        # GitHub webhook handler (Phase 3)
/.github/workflows/    # CI: lint, type check, plugin build
/docs                  # ADRs, prompt templates
```

## Development Commands (once scaffolded)

```bash
# Plugin development
cd plugin
npm install
npm run dev      # Vite dev build with watch
npm run build    # Production bundle for Figma

# Web app (Phase 2+)
cd web
npm install
npm run dev      # Next.js dev server
npm run build
npm run lint
npm run typecheck
```

To load the plugin in Figma: Plugins → Development → Import plugin from manifest → select `plugin/manifest.json`.

## Core Architecture: Two-Pass Claude Pipeline

Every component conversion runs exactly two Claude API calls:

1. **Pass 1 — Extract**: Reads component code → outputs validated JSON (component tree, fills, typography, spacing, design tokens). Include `tailwind.config.js` as context when available. Ask Claude to flag ambiguous values; do not let it invent JSON fields.
2. **Pass 2 — Generate**: Takes validated JSON → outputs Figma Plugin JavaScript. Apply all normalization (fonts, colors, layout) in this pass.

The generated JS executes inside Figma via `figma.ui.postMessage` → `code.ts`.

## Critical Figma Plugin Rules

Violating these crashes the plugin at runtime — no exceptions:

### Font Loading Order
```javascript
// Load ALL fonts BEFORE creating any node
await figma.loadFontAsync({ family: "Inter", style: "Regular" });

// Set fontName BEFORE characters — always
const text = figma.createText();
text.fontName = { family: "Inter", style: "Bold" }; // ← first
text.characters = "Hello";                           // ← second
```

### Async IIFE Wrapper (required — Figma plugins have no top-level await)
```javascript
(async () => {
  // all plugin logic here
})();
```

### Font Style Name Normalization

| CSS weight | Figma style name |
|-----------|-----------------|
| 300 | `"Light"` |
| 400 | `"Regular"` |
| 500 | `"Medium"` |
| 600 | `"Semi Bold"` ← space required |
| 700 | `"Bold"` |
| 800 | `"Extra Bold"` ← space required |
| italic + 700 | `"Bold Italic"` |

Unknown weight → fall back to `"Regular"`. Unknown font family → fall back to Inter. Never guess.

### Auto Layout
```javascript
frame.layoutMode = "VERTICAL";   // flex-col
frame.layoutMode = "HORIZONTAL"; // flex-row
// Always set BOTH:
frame.primaryAxisSizingMode = "AUTO";
frame.counterAxisSizingMode = "FIXED";
```

### Other Gotchas
- Figma REST API is **read-only** for file structure — all node creation must happen in `code.ts` via the Plugin API, never via REST.
- Colors must be in RGB 0–1 range: `{ r: 0.9, g: 0.27, b: 0.37 }` — not hex, not 0–255.
- For Tailwind responsive prefixes (`sm:`, `md:`, `lg:`): generate one labeled frame per breakpoint (Mobile / Tablet / Desktop).
- For nested components that already exist in Figma, use `figma.createInstance(componentId)` — never rebuild (Phase 2+).
- Component variant sets use `figma.combineAsVariants()` (Phase 2+).

## Phase Scope

- **Phase 0 (current):** Plugin scaffold, two-pass Claude pipeline, font normalization, basic Auto Layout, React/JSX/Tailwind input, copy-to-clipboard output.
- **Phase 1:** Full plugin UI sidebar, color/typography → Figma Styles, published to Figma Community.
- **Phase 2+:** GitHub sync, design tokens → Figma Variables, component variants, Supabase backend.
