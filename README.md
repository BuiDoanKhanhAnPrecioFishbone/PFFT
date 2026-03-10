# Code to Figma

A Figma plugin that converts React/JSX/Tailwind components into real Figma nodes using a two-pass Claude AI pipeline.

Upload a folder of components, the plugin classifies them, merges co-located style files, and generates a fully-structured Figma frame or **ComponentSet with all variants** for each file.

![Demo screenshot placeholder](https://placehold.co/800x400?text=Code+to+Figma)

---

## Features

- **Folder upload** — drop an entire component library in one go
- **Auto-classification** — Claude Haiku sorts files into Tokens / Atoms / Molecules / Organisms / Pages / Skip
- **SCSS/CSS pairing** — co-located style files (e.g. `Button.module.scss`) are automatically merged with the component before analysis
- **Design tokens** — extracts colors, spacing, border-radius, and font families into Figma Local Variables
- **Named styles** — creates Figma Paint Styles and Text Styles from every unique color and typography treatment
- **Variant ComponentSets** — components with prop variants (e.g. `variant`, `size`, `disabled`) are rendered as a full Figma ComponentSet with one frame per combination
- **Per-file plan** — review and run (or skip) each file individually before committing to the canvas
- **Two-pass Claude pipeline** — Pass 1 extracts a validated JSON tree; Pass 2 generates executable Figma Plugin JS from it

---

## Requirements

- [Figma Desktop](https://www.figma.com/downloads/) (the plugin runs in the Figma app, not the browser)
- An [Anthropic API key](https://console.anthropic.com/) — the plugin calls Claude Sonnet (Pass 1 + Pass 2) and Claude Haiku (classification + token extraction)
- No server, no backend, no account — just the API key

---

## Installation

### Step 1 — Download the plugin files

Download and unzip [`code-to-figma.zip`](../../releases/latest). You should have three files:

```
manifest.json
code.js
ui.html
```

Keep all three in the **same folder**.

---

### Step 2 — Import into Figma Desktop

> ⚠️ This must be done in the **Figma Desktop app**, not the browser.  
> Download it at [figma.com/downloads](https://www.figma.com/downloads/).

1. Open any Figma file in the desktop app
2. Click the **Figma logo** (top-left) → **Plugins** → **Development** → **Import plugin from manifest...**

   ![Menu path](https://placehold.co/600x200?text=Figma+menu+%E2%86%92+Plugins+%E2%86%92+Development+%E2%86%92+Import+plugin+from+manifest)

3. In the file picker, navigate to the unzipped folder and select **`manifest.json`**
4. Click **Open**

The plugin is now installed. To open it any time:  
**Right-click the canvas → Plugins → Development → Code to Figma**  
or  
**Figma logo → Plugins → Development → Code to Figma**

---

### Step 3 — Enter your API key

On first launch the plugin will ask for an **Anthropic API key**.  
Get one at [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create key.

The key is saved locally in Figma's storage — it is never sent anywhere except directly to `api.anthropic.com`.

> **Cost estimate:** a typical component costs ~$0.01–0.03 in API credits (Claude Sonnet for conversion, Haiku for classification).

---

### Option B — Build from source

```bash
git clone https://github.com/BuiDoanKhanhAnPrecioFishbone/PFFT.git
cd PFFT/plugin
npm install
npm run build        # produces code.js and ui.html
```

Then follow Step 2 above pointing at `plugin/manifest.json`.



## Usage

1. **Open the plugin** — Plugins → Development → Code to Figma
2. **Enter your Anthropic API key** — saved locally in Figma's `clientStorage`, never sent anywhere except Anthropic
3. **Upload a folder** — click "Choose folder" and select your component library root
4. *(Optional)* **Add Tailwind config** — paste the contents of your `tailwind.config.js` for accurate token extraction
5. **Review the plan** — the plugin shows one row per component file with its category and estimated token cost
6. **Run steps** — click **Run** on individual files or **Run All** to process everything
7. **Check the canvas** — each component appears as a named frame or ComponentSet

### SCSS/CSS pairing

If a style file shares the same base name as a component (e.g. `Button.module.scss` next to `Button.tsx`), it is automatically included as context for Claude. A colored badge appears in the plan row to confirm the pairing.

### Variants

If a component has TypeScript union props (`variant: 'primary' | 'ghost'`, `size: 'sm' | 'md' | 'lg'`), the plugin generates a Figma **ComponentSet** with one component per combination — viewable in the Variants panel.

---

## Project Structure

```
/plugin
  manifest.json        # Figma plugin config — name, permissions, API domains
  code.js              # Built plugin main thread (committed for easy install)
  ui.html              # Built plugin UI (committed for easy install)
  src/
    code.ts            # Figma main thread — all figma.* API calls live here
    claude.ts          # Two-pass Claude pipeline + prompt templates
    figmaApiRef.ts     # Authoritative Figma API reference embedded into Pass 2 prompt
    fonts.ts           # Font name normalisation (CSS weight → Figma style string)
    mapper.ts          # Tailwind utility → pixel value lookup table
    tokens.ts          # Design token extractor + Figma Variables creator
    ui/
      App.tsx           # Root UI component
      PlanView.tsx      # Per-file plan grid
      planStore.ts      # Plan state types
      folderScanner.ts  # Browser File API folder reader
      index.css         # Plugin UI styles
```

---

## How the pipeline works

```
Component code (.tsx)
  + Co-located style (.scss) [optional]
  + Tailwind config [optional]
       │
       ▼
  ┌─────────────┐
  │   Pass 1    │  Claude Sonnet
  │  (Extract)  │  → validated JSON tree:
  └─────────────┘    componentName, fonts[], colorStyles[],
                     typographyStyles[], tokens{}, variants[], tree{}
       │
       ▼  (JSON validated — bad output is caught before touching Figma)
       │
  ┌─────────────┐
  │   Pass 2    │  Claude Sonnet + Figma API Reference
  │  (Generate) │  → executable Figma Plugin JavaScript
  └─────────────┘
       │
       ▼
  figma.createFrame() / figma.combineAsVariants()
  + figma.createPaintStyle() / figma.createTextStyle()
  + figma.createVariable() (design tokens)
```

---

## Development

```bash
cd plugin
npm run dev      # Vite watch build for the UI
npm run build    # Production build (both UI and plugin main thread)
```

After every build, **reload the plugin in Figma**: right-click the plugin → Reload Plugin.

---

## Limitations (current phase)

- Responsive breakpoints are not yet supported (only the base styles are used)
- Complex CSS-in-JS (styled-components, Emotion) is partially supported — Tailwind and plain SCSS work best
- Non-Inter fonts must be installed in your Figma workspace for text to render correctly (Inter is always available)
- Maximum ~20 variant combinations per component (capped to keep prompts practical)

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Plugin scaffold, two-pass pipeline, font normalisation, Auto Layout |
| 1 | ✅ Done | Full UI, named Paint/Text Styles, variant ComponentSets, folder upload |
| 2 | 🔶 Partial | Design tokens → Figma Variables, SCSS pairing |
| 3 | Planned | GitHub sync, drift detection, update mode |
| 4 | Planned | Team features, SSO, Figma Org API |

---

## License

MIT
