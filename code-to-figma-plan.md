# Code to Figma — Project Plan & Technical Documentation
> Version: 1.0 | Status: In Progress | Type: Internal Planning Document

---

## MISSION
Help UI/UX teams save time by automatically converting vibe-coded components and design systems into Figma — keeping developers and designers in sync without manual work.

---

## 1. The Problem We're Solving

Vibe coding tools (Cursor, v0, Bolt, Lovable) let developers ship polished UI in hours. But this creates a painful gap: designers are left out. They must manually recreate components in Figma or work without an accurate source of truth.

### Pain Points
- Designers spend hours recreating components already built in code
- Design system gets out of sync with production codebase
- Handoff is inconsistent — Figma says one thing, code does another
- UI/UX teams can't iterate on top of vibe-coded output
- No audit trail between design decisions and implementation

### Opportunity
Position this tool as the sync layer between the codebase and the Figma design system — not just a one-time converter.

---

## 2. Product Vision

Code to Figma is a Figma Plugin that connects to a team's codebase (or accepts pasted code) and automatically generates accurate, editable Figma components — complete with Auto Layout, Figma Variables, component variants, and design tokens.

### Core Value Propositions
- Save 3–10 hours per sprint for every UI/UX designer on the team
- Keep Figma design system in sync with production components automatically
- Give designers a starting point they can iterate on, not recreate from scratch
- Eliminate handoff drift between design and engineering

### Target Users
- UI/UX designers at product companies using vibe coding tools
- Design system teams maintaining component libraries
- Startups (20–200 people) moving fast with Cursor/v0/Bolt
- Frontend leads who want design-engineer alignment

---

## 3. Phased Roadmap

| Phase | Name | Timeline | Status |
|-------|------|----------|--------|
| Phase 0 | Foundation & Prototype | Week 1–2 | In Progress |
| Phase 1 | MVP — Single Component | Week 3–6 | Planned |
| Phase 2 | Design System Aware | Week 7–12 | Planned |
| Phase 3 | Sync & Automation | Week 13–20 | Planned |
| Phase 4 | Team & Enterprise | Week 21+ | Future |

### Phase 0 — Foundation (Week 1–2)
Goal: Validate the core concept. Build a working proof of concept that converts a single pasted component to a Figma Plugin script.
- Figma Plugin scaffold (manifest.json + code.js + UI)
- Claude API integration with async font loading and error handling
- Support for React/JSX, HTML/CSS, Tailwind CSS input
- Basic Auto Layout mapping (flex/grid → Figma Layout)
- Font style name normalization (SemiBold → Semi Bold etc.)
- Copy-to-clipboard output with fallback for sandboxed iframes

### Phase 1 — MVP (Week 3–6)
Goal: A real Figma Plugin that designers can install and use in their daily workflow.
- Figma Plugin UI sidebar with paste-code input
- Two-pass Claude pipeline: extract JSON first, then generate plugin code
- Color extraction → Figma Styles (not raw hex values)
- Typography extraction → Figma Text Styles
- Component naming from code (not "Frame 47")
- Error handling: unknown fonts, missing values, malformed code
- Published to Figma Community (beta)

### Phase 2 — Design System Aware (Week 7–12)
Goal: Move from single components to full design system import. Handle real team codebases.
- GitHub / folder upload: scan entire component directory
- Design token extraction (tailwind.config.js, theme.ts, tokens.json)
- Figma Variables creation from color/spacing/radius tokens
- Component Variant detection (button primary/secondary/ghost etc.)
- Nested component awareness: detect child components, create instances
- Tailwind class lookup table with custom config support
- Batch processing: convert 10–50 components in one run

### Phase 3 — Sync & Automation (Week 13–20)
Goal: Make the tool proactive, not reactive. Components stay in sync automatically.
- GitHub Webhook integration: trigger sync on PR merge
- Drift detection: compare Figma component vs latest code, flag differences
- Changelog view: what changed between syncs
- Update mode: modify existing Figma components instead of creating duplicates
- Slack / email notifications when new components are available

### Phase 4 — Team & Enterprise (Week 21+)
Goal: Make this a team-level product with collaboration, permissions, and analytics.
- Multi-user Figma Plugin with shared workspace settings
- Usage analytics: which components are most synced, drift rate
- Role-based access: who can sync, who can approve
- Figma Organization support
- SSO / enterprise auth

---

## 4. Technical Architecture

### 4.1 Pipeline Overview

The tool runs a two-pass Claude pipeline to maximize accuracy and reliability.

| Pass | What Happens |
|------|-------------|
| Pass 1 — Extract | Claude reads the code and outputs structured JSON: component tree, fills, typography, spacing, design tokens. Validated before proceeding. |
| Pass 2 — Generate | Claude takes the validated JSON and generates Figma Plugin JavaScript using the exact Plugin API methods. Font names normalized. Async IIFE wrapper applied. |
| Execution | Plugin code runs inside Figma. Nodes appear on canvas with correct styles, auto layout, and naming. |

### 4.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| AI Core | Claude API (Sonnet) | Best code understanding + structured output |
| Figma Integration | Figma Plugin API | Only reliable way to write nodes to Figma canvas |
| Plugin UI | React + Vite | Fast dev cycle, familiar for frontend teams |
| Backend / Auth | Next.js + Supabase | Auth, token storage, team workspaces |
| GitHub Sync | GitHub Webhooks + Octokit | Trigger on PR merge / push to main |
| Token Parsing | Style Dictionary | Industry standard for design token extraction |
| Tailwind Parsing | tailwind-merge + config reader | Handle custom Tailwind configs accurately |
| Plugin Distribution | Figma Community | Primary discovery channel for designers |

### 4.3 Figma Plugin File Structure

| File | Purpose |
|------|---------|
| manifest.json | Plugin metadata, permissions, UI dimensions |
| code.js | Main plugin logic — all figma.* API calls run here |
| ui.html | Plugin sidebar UI (React app bundled into single HTML) |
| src/claude.ts | Claude API calls, prompt management, response parsing |
| src/mapper.ts | CSS/Tailwind → Figma property mapping logic |
| src/fonts.ts | Font name normalization + loadFontAsync management |
| src/tokens.ts | Design token extraction from theme files |

---

## 5. Key Technical Challenges & Solutions

### Challenge 1: Font Name Normalization
Figma uses different font style names than CSS. "SemiBold" crashes the plugin; it must be "Semi Bold".

**Solution:** Maintain a normalization lookup table:
```
fontWeight 300 → "Light"
fontWeight 400 → "Regular"
fontWeight 500 → "Medium"
fontWeight 600 → "Semi Bold"   ← space required
fontWeight 700 → "Bold"
fontWeight 800 → "Extra Bold"  ← space required
italic + 700   → "Bold Italic"
```
Default to "Regular" or "Bold" for unknown weights. Always await `figma.loadFontAsync()` before setting `.characters`.

### Challenge 2: Tailwind → Figma Mapping
Tailwind utility classes like `p-4`, `text-xl`, `rounded-lg` need exact pixel values. Custom Tailwind configs override defaults.

**Solution:** Build a base Tailwind-to-pixel lookup table. Parse `tailwind.config.js` alongside components when available. Send the config as context to Claude so it knows the actual values in use.

### Challenge 3: Component Variants
A Button may have `variant="primary"`, `variant="ghost"`, `size="sm"`, `size="lg"`. In Figma these need to be a single Component Set with Variants — not separate frames.

**Solution:** In Pass 1, ask Claude to identify all prop combinations and generate a variant matrix. In Pass 2, generate a ComponentSet with each variant as a child Component using `figma.combineAsVariants()`.

### Challenge 4: Nested Components
A Card contains a Button, which contains an Icon. If Button already exists in Figma, the tool should create an instance — not rebuild it from scratch.

**Solution:** Maintain a component registry (Supabase). On each sync, check if a child component exists by name. If found, call `figma.createInstance(componentId)` instead of recreating.

### Challenge 5: Responsive / Breakpoints
Tailwind has `sm:`, `md:`, `lg:` responsive prefixes. Figma has no native breakpoint support.

**Solution:** Generate one frame per breakpoint (Mobile, Tablet, Desktop) labeled clearly. Designers choose which to use and can merge manually.

---

## 6. What to Build First — Sprint 1

### In Scope (Must Have)
1. Figma Plugin scaffolding — manifest.json, code.js, ui.html
2. Plugin UI sidebar with textarea for pasting code
3. Claude API integration (two-pass: extract JSON → generate plugin code)
4. Async IIFE wrapper + font loading before all text nodes
5. Font name normalization table
6. Auto Layout mapping: flex-col → VERTICAL, flex-row → HORIZONTAL
7. Color extraction: hex/rgba → Figma SOLID fill (RGB 0–1 range)
8. Basic error handling with human-readable messages in sidebar
9. Support React/JSX and Tailwind CSS input
10. "Run in Figma" one-click button in sidebar

### Out of Scope for Sprint 1
- GitHub integration
- Design tokens / Figma Variables
- Component variants
- Nested component registry
- User auth / backend

---

## 7. Recommended Project Structure

| Path | Description |
|------|-------------|
| /plugin | Figma Plugin root (manifest, code.js, ui) |
| /plugin/manifest.json | Plugin config — name, permissions, ui size |
| /plugin/src/code.ts | Plugin main thread — all figma.* calls |
| /plugin/src/ui/ | React sidebar UI |
| /plugin/src/claude.ts | Claude API wrapper + prompt templates |
| /plugin/src/mapper.ts | CSS/Tailwind → Figma property map |
| /plugin/src/fonts.ts | Font normalization + async loader |
| /plugin/src/tokens.ts | Design token extractor |
| /web | Next.js web app (auth, dashboard, settings) |
| /web/app/api/convert | API route: receives code, calls Claude, returns plugin JS |
| /web/app/api/sync | API route: GitHub webhook handler |
| /.github/workflows | CI: lint, type check, plugin build |
| /docs | Internal documentation, ADRs, prompt templates |

---

## 8. Prompt Engineering Strategy

### Pass 1 — Extraction Prompt Rules
- Always include design tokens / theme config alongside component code
- Ask Claude to reason about the component intent first, then extract
- Request structured JSON with explicit schema — do not let Claude invent fields
- Include ALL font weights used so Pass 2 can pre-load them all
- Ask Claude to flag any ambiguous or missing values explicitly

### Pass 2 — Code Generation Prompt Rules
- Enforce async IIFE wrapper — non-negotiable for await to work
- Load every font listed in Pass 1 JSON before creating any node
- Set `fontName` before `characters` — always, without exception
- Use exact Figma font style names: "Semi Bold" not "SemiBold"
- Always set both `primaryAxisSizingMode` and `counterAxisSizingMode`
- Default unknown fonts to Inter Regular — do not guess

### Pass 2 — Required Code Template
```javascript
(async () => {
  // 1. Load ALL fonts first — before any node creation
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  // 2. Create frames
  const frame = figma.createFrame();
  frame.name = "ComponentName";
  frame.resize(320, 200);
  frame.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.18 } }];
  frame.cornerRadius = 16;
  frame.layoutMode = "VERTICAL";
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.itemSpacing = 16;
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";

  // 3. Create text ONLY after fonts are loaded
  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Bold" }; // fontName BEFORE characters
  title.characters = "Welcome Back";                    // characters AFTER fontName
  title.fontSize = 24;
  title.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.27, b: 0.37 } }];
  frame.appendChild(title);

  figma.currentPage.appendChild(frame);
  figma.notify("Component created! ✓");
  figma.closePlugin();
})();
```

### Iterative Improvement
- Log every plugin error back to Claude with the failing code section
- Build a regression test suite: 10 known components with expected Figma output
- Run evals on each prompt change — measure node accuracy, not just "did it run"

---

## 9. Known Figma API Gotchas

| Issue | Wrong | Correct |
|-------|-------|---------|
| Font style names | "SemiBold" | "Semi Bold" |
| Font style names | "ExtraBold" | "Extra Bold" |
| Writing nodes via REST | POST /v1/files/:key/nodes | ❌ Does not exist — use Plugin API |
| Text before font load | node.characters = "x" | await loadFontAsync() first |
| Property order on text | characters then fontName | fontName then characters |
| Async in plugins | No top-level await | Wrap in (async () => {})() |

---

## 10. Success Metrics

| Metric | Target (Phase 1) | Target (Phase 2) | Measurement |
|--------|-----------------|-----------------|-------------|
| Component accuracy | 80% visually correct | 90% visually correct | Designer rating 1–5 |
| Conversion time | < 10s per component | < 30s for 10 components | API response time |
| Plugin error rate | < 10% of runs fail | < 5% of runs fail | Error logs |
| Designer time saved | 2hr/sprint | 5hr/sprint | Team survey |
| Weekly active users | 10 (internal) | 50 (beta) | Plugin analytics |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Figma Plugin API changes or deprecates methods | Pin Plugin API version in manifest. Monitor Figma changelog. Abstract API calls behind a mapper layer. |
| Claude API cost at scale | Cache Pass 1 JSON — only regenerate if code changes. Batch multiple components in one API call. |
| Font not available in Figma | Normalize all fonts at extraction time. Fallback to Inter Regular. Show warning listing substituted fonts. |
| Pixel-perfect expectation from designers | Set clear expectation: 90% accurate starting point. Frame as "accelerator" not "replacer". |
| Competitor releases similar feature | Differentiate on Claude's component intent understanding, design token accuracy, and GitHub sync speed. |

---

## 12. Immediate Next Steps

### This Week
1. Set up Figma Plugin project scaffolding (manifest.json + Vite + React)
2. Build the two-pass Claude pipeline (extract JSON → generate code)
3. Implement font normalization table and async loading wrapper
4. Test with 5 real components from a vibe-coded project
5. Document all errors found and refine prompts

### Next Week
1. Polish plugin UI sidebar (paste input, run button, error display)
2. Add Tailwind class lookup table for common utilities
3. Test with a real team's design system (5–10 components)
4. Measure accuracy, collect designer feedback
5. Decide scope for Phase 1 based on feedback

---

## NORTH STAR
> The best version of this tool feels invisible — a designer sees a new component in their Figma library and doesn't even think about how it got there. That's the goal.

---

*Code to Figma — Internal Planning Document — 2025*
