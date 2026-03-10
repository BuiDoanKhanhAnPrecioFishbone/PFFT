(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/figmaApiRef.ts
  var FIGMA_API_REF = `
# Figma Plugin API Reference

## Execution wrapper \u2014 MANDATORY
All plugin code must run inside an async IIFE. Top-level await is not supported.
\`\`\`js
(async () => {
  // all code here
})();
\`\`\`

## Font loading \u2014 MANDATORY ORDER
1. Load ALL fonts before creating any node or text style \u2014 even if the node is not text.
2. Set fontName BEFORE characters. Violating either rule throws at runtime.
\`\`\`js
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const t = figma.createText();
t.fontName = { family: "Inter", style: "Bold" }; // \u2190 FIRST
t.characters = "Hello";                           // \u2190 SECOND
\`\`\`

## Font style name mapping (CSS weight \u2192 Figma style string)
| CSS weight | italic | Figma style string |
|---|---|---|
| 100 | no | "Thin" |
| 200 | no | "Extra Light" |
| 300 | no | "Light" |
| 400 | no | "Regular" |
| 500 | no | "Medium" |
| 600 | no | "Semi Bold" |
| 700 | no | "Bold" |
| 800 | no | "Extra Bold" |
| 900 | no | "Black" |
| 400 | yes | "Italic" |
| 700 | yes | "Bold Italic" |
Rules: spaces are required ("Semi Bold" not "SemiBold"). Unknown weight \u2192 "Regular". Unknown family \u2192 "Inter". Never guess.

## Colours \u2014 ALWAYS 0\u20131 RGB, NEVER hex or 0\u2013255
\`\`\`js
// hex #2563EB  \u2192  r=0x25/255, g=0x63/255, b=0xEB/255
const color = { r: 0x25 / 255, g: 0x63 / 255, b: 0xEB / 255 };
node.fills = [{ type: "SOLID", color, opacity: 1 }];
\`\`\`

## Node creation
\`\`\`js
const frame = figma.createFrame();
const rect  = figma.createRectangle();
const text  = figma.createText();
const comp  = figma.createComponent();   // for variant members
const ellip = figma.createEllipse();
const group = figma.group(children, parent);
parent.appendChild(child);              // add child into a frame/component
\`\`\`

## Auto Layout \u2014 always set BOTH axis modes
\`\`\`js
frame.layoutMode = "HORIZONTAL";          // or "VERTICAL"
frame.primaryAxisSizingMode = "AUTO";     // or "FIXED"
frame.counterAxisSizingMode = "FIXED";    // or "AUTO"
frame.primaryAxisAlignItems  = "CENTER";  // MIN | CENTER | MAX | SPACE_BETWEEN
frame.counterAxisAlignItems  = "CENTER";  // MIN | CENTER | MAX | BASELINE
frame.itemSpacing   = 8;
frame.paddingTop    = 12;
frame.paddingBottom = 12;
frame.paddingLeft   = 16;
frame.paddingRight  = 16;
\`\`\`

## Sizing individual children inside Auto Layout
\`\`\`js
child.layoutGrow = 1;          // flex: 1  (fill available space)
child.layoutAlign = "STRETCH"; // align-self: stretch
\`\`\`

## Corner radius
\`\`\`js
node.cornerRadius = 8;                    // uniform
node.topLeftRadius = 8; node.topRightRadius = 8;
node.bottomLeftRadius = 0; node.bottomRightRadius = 0;
\`\`\`

## Strokes
\`\`\`js
node.strokes = [{ type: "SOLID", color: { r, g, b } }];
node.strokeWeight = 1;
node.strokeAlign  = "INSIDE";   // or "OUTSIDE" | "CENTER"
\`\`\`

## Opacity / visibility
\`\`\`js
node.opacity = 0.4;   // 0\u20131
node.visible = false;
\`\`\`

## Named Paint Styles (local Figma styles)
\`\`\`js
const ps = figma.createPaintStyle();
ps.name   = "Button/Background";
ps.paints = [{ type: "SOLID", color: { r, g, b }, opacity: 1 }];
node.fillStyleId = ps.id;  // apply to a node
\`\`\`

## Named Text Styles
\`\`\`js
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" }); // must be loaded first
const ts = figma.createTextStyle();
ts.name         = "Button/Label";
ts.fontName     = { family: "Inter", style: "Semi Bold" };
ts.fontSize     = 14;
ts.lineHeight   = { value: 20, unit: "PIXELS" };  // or { unit: "AUTO" }
ts.letterSpacing = { value: 0.2, unit: "PIXELS" };
textNode.textStyleId = ts.id;   // apply BEFORE setting characters
\`\`\`

## ComponentSet (Variants)
Use this when the component has props with multiple values (variant, size, state, etc.).
\`\`\`js
// 1. Create one figma.createComponent() per variant combination.
//    Name each with the pattern:  Prop1=value1, Prop2=value2
const btnPrimary = figma.createComponent();
btnPrimary.name = "variant=primary, size=md";
// ... build child nodes inside btnPrimary ...

const btnGhost = figma.createComponent();
btnGhost.name = "variant=ghost, size=md";
// ...

// 2. Combine into a ComponentSet \u2014 this appends to the page automatically.
const set = figma.combineAsVariants([btnPrimary, btnGhost], figma.currentPage);
set.name = "Button";   // displayed as the component name

// 3. Auto Layout on the set for a tidy grid (optional but recommended):
set.layoutMode = "HORIZONTAL";
set.itemSpacing = 24;
set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
set.primaryAxisSizingMode = "AUTO";
set.counterAxisSizingMode = "AUTO";

// DO NOT call figma.currentPage.appendChild after combineAsVariants.
\`\`\`

## Single frame (no variants)
\`\`\`js
const root = figma.createFrame();
root.name = "MyComponent";
// ... build child tree ...
figma.currentPage.appendChild(root);
\`\`\`

## Finalise plugin
\`\`\`js
figma.notify("Component created \u2713");
figma.closePlugin();
\`\`\`

## Common mistakes that crash plugins at runtime
- Using hex strings or 0\u2013255 numbers for colours instead of 0\u20131 floats.
- Setting node.characters before node.fontName.
- Creating text nodes before the font is loaded with loadFontAsync.
- Using "SemiBold" instead of "Semi Bold" (space is required).
- Calling figma.currentPage.appendChild after figma.combineAsVariants.
- Missing primaryAxisSizingMode or counterAxisSizingMode when layoutMode is set.
- Using await outside the async IIFE.
`;

  // src/claude.ts
  function buildPass1Prompt(componentCode, tailwindConfig) {
    return `You are a design-system analyser. Your job is to read a React/JSX/Tailwind component and output a precise structural JSON that a Figma plugin will use to:
1. Create named local Figma Paint Styles and Text Styles.
2. Extract design tokens for Figma Variables.
3. Detect component prop variants to generate a Figma ComponentSet.

## Component Code
\`\`\`
${componentCode}
\`\`\`
${tailwindConfig ? `
## Tailwind Config (project-specific values)
\`\`\`
${tailwindConfig}
\`\`\`
` : ""}

## Output Requirements

Return ONLY valid JSON \xE2\u20AC\u201D no markdown, no explanation, no trailing text. The JSON must conform exactly to this schema:

{
  "componentName": string,           // inferred from the component name, NOT "Frame"
  "description": string,             // 1-sentence description of the component
  "fonts": [                         // ALL font families + weights used
    { "family": string, "weight": number, "italic": boolean }
  ],
  "colorStyles": [                   // ALL unique fills as named Figma Paint Styles
    {
      "styleName": string,           // e.g. "Button/Background", "Brand/Primary"
      "hex": string,                 // 6-digit hex, e.g. "#2563EB"
      "opacity": number              // 0\xE2\u20AC\u201C1
    }
  ],
  "typographyStyles": [             // ALL unique text treatments as named Figma Text Styles
    {
      "styleName": string,          // e.g. "Button/Label", "Heading/H1"
      "family": string,
      "weight": number,
      "italic": boolean,
      "sizePx": number,
      "lineHeightPx": number | null,
      "letterSpacingPx": number | null
    }
  ],
  "tokens": {                        // design tokens for Figma Variables (Phase 2)
    "colors": { "tokenName": "#hexValue" },         // e.g. { "primary": "#2563EB" }
    "spacing": { "tokenName": pixelValue },          // e.g. { "4": 16, "card-padding": 24 }
    "borderRadius": { "tokenName": pixelValue },     // e.g. { "lg": 8 }
    "fontFamily": { "tokenName": "fontFamilyString" } // e.g. { "sans": "Inter" }
  },
  "variants": [                      // component prop variants (omit if none detected)
    {
      "propName": string,            // React prop name, e.g. "variant"
      "values": [ string ]           // all detected values, e.g. ["primary", "ghost"]
    }
  ],
  "tree": {                          // recursive node tree
    "type": "frame" | "text" | "rectangle" | "ellipse" | "group",
    "name": string,
    "layoutMode": "VERTICAL" | "HORIZONTAL" | "NONE",
    "width": number | "AUTO" | "FILL",
    "height": number | "AUTO" | "FILL",
    "paddingTop": number,
    "paddingRight": number,
    "paddingBottom": number,
    "paddingLeft": number,
    "itemSpacing": number,
    "primaryAxisSizingMode": "AUTO" | "FIXED",
    "counterAxisSizingMode": "AUTO" | "FIXED",
    "cornerRadius": number,
    "fills": [{ "hex": string, "opacity": number }],
    "fillStyleName": string | null,  // references a colorStyles[].styleName
    "stroke": { "hex": string, "weight": number } | null,
    "text": string,                  // only for type="text"
    "fontFamily": string,            // only for type="text"
    "fontWeight": number,            // only for type="text"
    "fontItalic": boolean,           // only for type="text"
    "fontSize": number,              // only for type="text"
    "textColour": string,            // only for type="text", hex
    "textStyleName": string | null,  // references a typographyStyles[].styleName
    "children": [ ...recursive... ],
    "opacity": number,               // 0\xE2\u20AC\u201C1, default 1
    "flags": [ string ]              // list ambiguities, e.g. "borderStyle uncertain"
  },
  "ambiguities": [ string ]          // top-level list of things that couldn't be determined
}

## Rules
- Convert ALL Tailwind classes to pixel values. p-4 = 16px, text-xl = 20px, rounded-lg = 8px, gap-4 = 16px.
- flex-col maps to layoutMode VERTICAL; flex-row maps to layoutMode HORIZONTAL.
- Always include paddingTop/Right/Bottom/Left even if 0.
- Always include BOTH primaryAxisSizingMode and counterAxisSizingMode.
- If a colour cannot be determined, use "#000000" and add a flag.
- If a font cannot be determined, use family "Inter", weight 400.
- Include every font family+weight combination in the top-level "fonts" array.
- Each unique colour that appears on a node must have an entry in "colorStyles" with a semantic name.
- Each unique text treatment must have an entry in "typographyStyles" with a semantic name.
- Style names use the pattern ComponentName/Role, e.g. "Button/Background", "Button/Label".
- On each tree node, set "fillStyleName" to the matching colorStyles[].styleName (or null if no fill).
- On each text node, set "textStyleName" to the matching typographyStyles[].styleName (or null).
- For "tokens": if tailwindConfig is provided, extract its theme.colors, theme.spacing, theme.borderRadius, theme.fontFamily values (prefer actual token values over Tailwind defaults). If no tailwindConfig, extract implicit tokens from the component's inline values.
- For "variants": scan the component for prop patterns like 'variant=', 'size=', 'color=', or TypeScript union types. If a prop has 2+ known values, add it to the variants array. Omit variants array entirely if no variants are detected.
- Do NOT invent fields not in the schema.
- Flag anything ambiguous in the node's "flags" array AND in the top-level "ambiguities" array.`;
  }
  function buildPass2Prompt(pass1Json) {
    var _a, _b, _c, _d, _e;
    const jsonStr = JSON.stringify(pass1Json, null, 2);
    const variants = (_a = pass1Json.variants) != null ? _a : [];
    let cappedVariants = variants;
    if (variants.length > 0) {
      const product = variants.reduce((acc, v) => acc * v.values.length, 1);
      if (product > 20) cappedVariants = variants.slice(0, 2);
    }
    const hasVariants = cappedVariants.length > 0;
    const variantCount = hasVariants ? cappedVariants.reduce((a, v) => a * v.values.length, 1) : 0;
    const variantInstruction = hasVariants ? `The component has ${cappedVariants.length} variant prop(s)  use figma.createComponent() + figma.combineAsVariants() as documented in the API reference:
${cappedVariants.map((v) => `  - "${v.propName}": [${v.values.map((x) => `"${x}"`).join(", ")}]`).join("\n")}
Total combinations: ${variantCount}. Create one figma.createComponent() per combination, name each "Prop1=value1, Prop2=value2", adapt fills/padding/opacity per variant value.` : `No variants  use figma.createFrame() for the root, then call figma.currentPage.appendChild(root).`;
    const styleCount = ((_c = (_b = pass1Json.colorStyles) == null ? void 0 : _b.length) != null ? _c : 0) + ((_e = (_d = pass1Json.typographyStyles) == null ? void 0 : _d.length) != null ? _e : 0);
    const notifyMsg = hasVariants ? `${pass1Json.componentName}  ${variantCount} variants created ` : `${pass1Json.componentName}  ${styleCount} styles `;
    return `You are a Figma Plugin code generator. Use the API reference below and the component JSON to generate complete, working Figma Plugin JavaScript.
${FIGMA_API_REF}
---

## Component JSON
\`\`\`json
${jsonStr}
\`\`\`

## Task
Generate Figma Plugin JavaScript that:
1. Loads every font listed in "fonts[]" with figma.loadFontAsync() before any node is created.
2. Creates named Paint Styles from colorStyles[] with figma.createPaintStyle().
3. Creates named Text Styles from typographyStyles[] with figma.createTextStyle().
4. Builds the full node tree from the "tree" field  apply fillStyleId / textStyleId where styleName references exist; fall back to raw fills / fontName otherwise.
5. ${variantInstruction}
6. Ends with: figma.notify("${notifyMsg}"); figma.closePlugin();

Return ONLY valid JavaScript. No markdown fences, no explanation, no trailing text.`;
  }
  var DEFAULT_MODEL = "claude-sonnet-4-5";
  var RETRY_DELAY_MS = 1500;
  async function callClaude(prompt, options) {
    var _a, _b;
    const model = (_a = options.model) != null ? _a : DEFAULT_MODEL;
    console.log("[Claude] About to call fetch from:", typeof window === "undefined" ? "Node/Figma context" : "Browser context");
    console.log("[Claude] fetch available?", typeof fetch);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: (_b = options.maxTokensOverride) != null ? _b : 4096,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Claude API error ${response.status}: ${body}`);
    }
    const data = await response.json();
    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("Claude returned no text content");
    return textBlock.text;
  }
  async function callClaudeWithRetry(prompt, options) {
    var _a;
    try {
      return await callClaude(prompt, options);
    } catch (firstErr) {
      const msg = (_a = firstErr.message) != null ? _a : "";
      if (msg.includes("401") || msg.includes("403") || msg.includes("400")) {
        throw firstErr;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return await callClaude(prompt, options);
    }
  }
  function parsePass1Response(raw) {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Pass 1 JSON parse error: ${e.message}

Raw response:
${raw}`);
    }
    const result = parsed;
    if (typeof result.componentName !== "string" || !result.componentName) {
      throw new Error("Pass 1 JSON missing required field: componentName");
    }
    if (!Array.isArray(result.fonts)) {
      throw new Error("Pass 1 JSON missing required field: fonts (array)");
    }
    if (!result.tree || typeof result.tree !== "object") {
      throw new Error("Pass 1 JSON missing required field: tree (object)");
    }
    if (!Array.isArray(result.colorStyles)) result.colorStyles = [];
    if (!Array.isArray(result.typographyStyles)) result.typographyStyles = [];
    if (!Array.isArray(result.ambiguities)) result.ambiguities = [];
    if (!Array.isArray(result.variants)) result.variants = [];
    const nonInterFonts = result.fonts.filter(
      (f) => f.family.toLowerCase() !== "inter"
    );
    if (nonInterFonts.length > 0) {
      result.ambiguities = [
        ...result.ambiguities,
        ...nonInterFonts.map(
          (f) => `Font "${f.family}" may not be available in Figma \u2014 substituted with Inter if missing`
        )
      ];
    }
    return result;
  }
  function parsePass2Response(raw) {
    const cleaned = raw.replace(/^```(?:javascript|js)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    if (!cleaned.includes("figma.") && !cleaned.includes("(async")) {
      throw new Error("Pass 2 response does not look like valid Figma plugin code");
    }
    return cleaned;
  }
  function isPipelineError(result) {
    return "stage" in result && "message" in result;
  }
  async function runPipeline(componentCode, options, tailwindConfig) {
    var _a, _b, _c, _d, _e;
    let pass1;
    try {
      const prompt1 = buildPass1Prompt(componentCode, tailwindConfig);
      const raw1 = await callClaudeWithRetry(prompt1, options);
      pass1 = parsePass1Response(raw1);
    } catch (err) {
      return { stage: "pass1", message: `Extraction failed: ${err.message}` };
    }
    let pluginCode;
    try {
      const prompt2 = buildPass2Prompt(pass1);
      const raw2 = await callClaudeWithRetry(prompt2, options);
      pluginCode = parsePass2Response(raw2);
    } catch (err) {
      return { stage: "pass2", message: `Code generation failed: ${err.message}` };
    }
    const warnings = (_a = pass1.ambiguities) != null ? _a : [];
    const stylesCreated = ((_c = (_b = pass1.colorStyles) == null ? void 0 : _b.length) != null ? _c : 0) + ((_e = (_d = pass1.typographyStyles) == null ? void 0 : _d.length) != null ? _e : 0);
    return { pass1, pluginCode, warnings, stylesCreated };
  }
  async function runBatchPipeline(codes, options, onProgress, tailwindConfig) {
    const results = [];
    for (let i = 0; i < codes.length; i++) {
      const result = await runPipeline(codes[i], options, tailwindConfig);
      results.push(result);
      const name = isPipelineError(result) ? `(error at ${result.stage})` : result.pass1.componentName;
      onProgress == null ? void 0 : onProgress(i, codes.length, name);
    }
    return results;
  }
  async function extractTokensFromFile(fileContent, fileName, options) {
    var _a, _b, _c, _d;
    const truncated = fileContent.length > 12e3 ? fileContent.slice(0, 12e3) + "\n// [truncated]" : fileContent;
    const prompt = `You are a design token extractor. Read the following design token file and extract ALL token values into a flat JSON structure.

## File: ${fileName}
\`\`\`
${truncated}
\`\`\`

## Output Requirements
Return ONLY valid JSON, no markdown, no explanation:
{
  "colors": {
    "blue/50": "#e6ecfa",
    "blue/100": "#cdd8f5",
    "primary/500": "#6f42c1"
  },
  "spacing": {
    "1": 4,
    "2": 8,
    "md": 16
  },
  "borderRadius": {
    "sm": 4,
    "md": 8,
    "lg": 16
  },
  "fontFamily": {
    "sans": "Inter",
    "mono": "JetBrains Mono"
  }
}

Rules:
- Flatten nested color objects: { blue: { 50: '#hex' } } \u2192 { "blue/50": "#hex" }
- All color values must be 6-digit hex strings starting with #. Skip CSS var() references.
- All spacing/radius values must be numbers in pixels. Convert rem to px (1rem = 16px).
- Skip any values that reference CSS variables (var(--...)).
- If a section has no values, output an empty object {}.
- Include ALL color shades from ALL color scales in the file.
- DO NOT skip colors \u2014 include every single hex value found.`;
    const raw = await callClaude(prompt, __spreadProps(__spreadValues({}, options), {
      model: "claude-haiku-4-5",
      maxTokensOverride: 8096
    }));
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        colors: (_a = parsed.colors) != null ? _a : {},
        spacing: (_b = parsed.spacing) != null ? _b : {},
        borderRadius: (_c = parsed.borderRadius) != null ? _c : {},
        fontFamily: (_d = parsed.fontFamily) != null ? _d : {}
      };
    } catch (e) {
      return { colors: {}, spacing: {}, borderRadius: {}, fontFamily: {} };
    }
  }
  async function classifyFiles(paths, options) {
    const CHUNK = 50;
    const allFiles = [];
    for (let start = 0; start < paths.length; start += CHUNK) {
      const chunk = paths.slice(start, start + CHUNK);
      const fileList = chunk.map((p, i) => `${start + i + 1}. ${p}`).join("\n");
      const prompt = `You are a React codebase analyst. Given the following list of file paths from a frontend project, classify each file into one of these categories:

- **tokens**: Design token files (tailwind.config.*, theme.ts, colors.ts, tokens.json, *.tokens.*)
- **atoms**: Primitive UI components with no or few dependencies (Button, Input, Badge, Icon, Checkbox, Radio, Switch, Tooltip, Avatar, Spinner, Tag)
- **molecules**: Composed components that combine atoms (Card, Modal, Dropdown, Toast, Alert, Form, Select, DatePicker, Table, Tabs, Accordion)
- **organisms**: Complex, page-level sections (Navbar, Sidebar, Header, Footer, DashboardLayout, DataGrid, Wizard, AuthForm)
- **pages**: Full page components or route layouts
- **skip**: Not a UI component (hooks, utils, helpers, context, store, types, api, services, tests, stories)

## File List
${fileList}

## Response Format
Return ONLY valid JSON, no markdown, no explanation:
{
  "files": [
    { "path": "exact/path/from/list.tsx", "category": "atoms", "reason": "primitive button component" },
    ...one entry per file in the same order...
  ]
}

Rules:
- Every file must have an entry.
- Use the exact path string from the input.
- "reason" must be a short phrase (3-8 words).
- When in doubt between atoms/molecules, prefer atoms for simple components, molecules for composed ones.
- Files in hooks/, utils/, lib/, store/, context/, api/, services/ folders \u2192 skip.
- Files ending in .d.ts, .test.*, .spec.*, .stories.* \u2192 skip.`;
      const raw = await callClaude(prompt, __spreadProps(__spreadValues({}, options), {
        model: "claude-haiku-4-5",
        maxTokensOverride: 8096
      }));
      const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error("[classifyFiles] JSON parse failed for chunk, marking as skip:", e);
        for (const p of chunk) {
          allFiles.push({ path: p, category: "skip", reason: "parse error \u2014 classified as skip" });
        }
        continue;
      }
      if (!Array.isArray(parsed.files)) {
        for (const p of chunk) {
          allFiles.push({ path: p, category: "skip", reason: "invalid response \u2014 classified as skip" });
        }
        continue;
      }
      allFiles.push(...parsed.files);
    }
    return { files: allFiles };
  }

  // src/tokens.ts
  function parseTailwindConfig(configSource) {
    const tokens = {
      colors: {},
      spacing: {},
      borderRadius: {},
      fontFamily: {}
    };
    function extractBlock(source, keyword) {
      const idx = source.indexOf(keyword);
      if (idx === -1) return null;
      let start = source.indexOf("{", idx + keyword.length);
      if (start === -1) return null;
      let depth = 0;
      let end = start;
      for (; end < source.length; end++) {
        if (source[end] === "{") depth++;
        else if (source[end] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return source.slice(start, end + 1);
    }
    function parseStringRecord(block) {
      const result = {};
      const re = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        result[m[1]] = m[2];
      }
      return result;
    }
    function parseNumberRecord(block) {
      const result = {};
      const re = /['"]?([\w.-]+)['"]?\s*:\s*['"]?([\d.]+)(px|rem|em)?['"]?/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        const raw = parseFloat(m[2]);
        if (isNaN(raw)) continue;
        const multiplier = m[3] === "rem" || m[3] === "em" ? 16 : 1;
        result[m[1]] = Math.round(raw * multiplier);
      }
      return result;
    }
    function mergeSection(source, key, parser) {
      const base = extractBlock(source, `${key}:`);
      const extend = (() => {
        const extendBlock = extractBlock(source, "extend:");
        if (!extendBlock) return null;
        return extractBlock(extendBlock, `${key}:`);
      })();
      const baseResult = base ? parser(base) : {};
      const extendResult = extend ? parser(extend) : {};
      return __spreadValues(__spreadValues({}, baseResult), extendResult);
    }
    tokens.colors = mergeSection(configSource, "colors", parseStringRecord);
    tokens.spacing = mergeSection(configSource, "spacing", parseNumberRecord);
    tokens.borderRadius = mergeSection(configSource, "borderRadius", parseNumberRecord);
    const fontSection = mergeSection(configSource, "fontFamily", parseStringRecord);
    for (const [key, val] of Object.entries(fontSection)) {
      tokens.fontFamily[key] = val.replace(/[\[\]'"]/g, "").split(",")[0].trim();
    }
    return tokens;
  }
  async function createFigmaVariables(tokens, collectionName = "Design Tokens") {
    const skipped = [];
    let count = 0;
    let collection;
    const existing = figma.variables.getLocalVariableCollections().find((c) => c.name === collectionName);
    if (existing) {
      collection = existing;
    } else {
      collection = figma.variables.createVariableCollection(collectionName);
    }
    const modeId = collection.modes[0].modeId;
    function getOrCreateVar(name, type) {
      const existingVar = figma.variables.getLocalVariables(type).find((v) => v.name === name && v.variableCollectionId === collection.id);
      return existingVar != null ? existingVar : figma.variables.createVariable(name, collection.id, type);
    }
    function hexToRgb(hex) {
      const raw = hex.replace("#", "");
      if (raw.length !== 6) return null;
      return {
        r: parseInt(raw.slice(0, 2), 16) / 255,
        g: parseInt(raw.slice(2, 4), 16) / 255,
        b: parseInt(raw.slice(4, 6), 16) / 255
      };
    }
    for (const [name, hex] of Object.entries(tokens.colors)) {
      const rgb = hexToRgb(hex);
      if (!rgb) {
        skipped.push(`colors/${name} \u2014 could not parse hex "${hex}"`);
        continue;
      }
      try {
        const variable = getOrCreateVar(`colors/${name}`, "COLOR");
        variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
        count++;
      } catch (e) {
        skipped.push(`colors/${name}`);
      }
    }
    for (const [name, px] of Object.entries(tokens.spacing)) {
      try {
        const variable = getOrCreateVar(`spacing/${name}`, "FLOAT");
        variable.setValueForMode(modeId, px);
        count++;
      } catch (e) {
        skipped.push(`spacing/${name}`);
      }
    }
    for (const [name, px] of Object.entries(tokens.borderRadius)) {
      try {
        const variable = getOrCreateVar(`radius/${name}`, "FLOAT");
        variable.setValueForMode(modeId, px);
        count++;
      } catch (e) {
        skipped.push(`radius/${name}`);
      }
    }
    for (const name of Object.keys(tokens.fontFamily)) {
      skipped.push(`fontFamily/${name} \u2014 font family tokens skipped (not COLOR/FLOAT)`);
    }
    return { collectionId: collection.id, count, skipped };
  }

  // src/code.ts
  var REGISTRY_KEY = "component-registry";
  async function loadRegistry() {
    try {
      const stored = await figma.clientStorage.getAsync(REGISTRY_KEY);
      return stored != null ? stored : {};
    } catch (e) {
      return {};
    }
  }
  async function saveRegistry(registry) {
    await figma.clientStorage.setAsync(REGISTRY_KEY, registry);
  }
  function hashCode(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h << 5) + h ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
  console.log("[Code to Figma] Plugin starting...");
  console.log("[Code to Figma] __html__ type:", typeof __html__);
  console.log("[Code to Figma] __html__ length:", typeof __html__ === "string" ? __html__.length : "N/A");
  figma.showUI(__html__, {
    width: 400,
    height: 560,
    title: "Code to Figma"
  });
  console.log("[Code to Figma] UI shown successfully");
  figma.ui.onmessage = async (msg) => {
    var _a;
    if (msg.type === "load-api-key") {
      const storedKey = await figma.clientStorage.getAsync("anthropic-api-key");
      figma.ui.postMessage({ type: "api-key-loaded", apiKey: storedKey || "" });
      return;
    }
    if (msg.type === "save-api-key") {
      await figma.clientStorage.setAsync("anthropic-api-key", msg.apiKey);
      return;
    }
    if (msg.type === "save-plan") {
      await figma.clientStorage.setAsync("conversion-plan", (_a = msg.plan) != null ? _a : null);
      return;
    }
    if (msg.type === "restore-plan") {
      const saved = await figma.clientStorage.getAsync("conversion-plan");
      figma.ui.postMessage({ type: "plan-restored", plan: saved != null ? saved : null });
      return;
    }
    if (msg.type === "classify-files") {
      await handleClassifyFiles(msg);
      return;
    }
    if (msg.type === "run-plan-step") {
      await handlePlanStep(msg);
      return;
    }
    if (msg.type === "close") {
      figma.closePlugin();
      return;
    }
    if (msg.type === "convert") {
      await handleConvert(msg);
      return;
    }
    if (msg.type === "convert-batch") {
      await handleBatch(msg);
    }
  };
  async function handleConvert(msg) {
    const { code, apiKey, tailwindConfig } = msg;
    console.log("[Code.ts] handleConvert called - running in Figma main thread");
    console.log("[Code.ts] typeof fetch:", typeof fetch);
    sendProgress("Analysing component (Pass 1)...");
    const result = await runPipeline(code, { apiKey }, tailwindConfig);
    if (isPipelineError(result)) {
      sendError(result.message);
      return;
    }
    sendProgress("Generating Figma code (Pass 2)...");
    const { pass1, pluginCode } = result;
    if (pass1.tokens) {
      try {
        sendProgress("Creating Figma Variables from design tokens...");
        const varResult = await createFigmaVariables(pass1.tokens, pass1.componentName);
        if (varResult.skipped.length) {
          result.warnings.push(
            `Variables: skipped ${varResult.skipped.length} token(s) \u2014 ${varResult.skipped.slice(0, 3).join(", ")}`
          );
        }
      } catch (e) {
        result.warnings.push(`Variables creation failed: ${e.message}`);
      }
    }
    sendProgress(`Creating "${pass1.componentName}" on canvas...`);
    try {
      const trimmed = pluginCode.trim();
      const returnExpr = trimmed.startsWith("(") ? trimmed : `(${trimmed})`;
      const fn = new Function(`return ${returnExpr}`);
      await fn();
      const registry = await loadRegistry();
      const hash = hashCode(code);
      const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
      if (node) {
        registry[pass1.componentName] = {
          figmaId: node.id,
          name: pass1.componentName,
          sourceHash: hash,
          lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await saveRegistry(registry);
      }
      sendSuccess(pass1.componentName, result.stylesCreated, result.warnings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      sendError(
        `Figma execution error: ${errorMessage}

The generated code could not run. This is usually caused by a font issue or an unsupported API call. Try again \u2014 Claude will attempt a different approach.`
      );
    }
  }
  async function handleBatch(msg) {
    var _a, _b;
    const { codes, apiKey, tailwindConfig } = msg;
    sendProgress(`Starting batch: ${codes.length} component(s)...`);
    const sharedTokens = tailwindConfig ? parseTailwindConfig(tailwindConfig) : void 0;
    const results = await runBatchPipeline(
      codes,
      { apiKey },
      (index, total, componentName) => {
        figma.ui.postMessage({ type: "batch-progress", index, total, componentName });
      },
      tailwindConfig
    );
    const summaries = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (isPipelineError(result)) {
        summaries.push({
          componentName: "(unknown)",
          ok: false,
          error: result.message,
          stylesCreated: 0,
          warnings: []
        });
        continue;
      }
      const { pass1, pluginCode } = result;
      const tokensToUse = (_a = pass1.tokens) != null ? _a : sharedTokens;
      if (tokensToUse) {
        try {
          await createFigmaVariables(tokensToUse, pass1.componentName);
        } catch (e) {
        }
      }
      try {
        const trimmed = pluginCode.trim();
        const returnExpr = trimmed.startsWith("(") ? trimmed : `(${trimmed})`;
        await new Function(`return ${returnExpr}`)();
        const registry = await loadRegistry();
        const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
        if (node) {
          registry[pass1.componentName] = {
            figmaId: node.id,
            name: pass1.componentName,
            sourceHash: hashCode((_b = codes[i]) != null ? _b : ""),
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          await saveRegistry(registry);
        }
        summaries.push({
          componentName: pass1.componentName,
          ok: true,
          stylesCreated: result.stylesCreated,
          warnings: result.warnings
        });
      } catch (err) {
        summaries.push({
          componentName: pass1.componentName,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          stylesCreated: 0,
          warnings: result.warnings
        });
      }
    }
    figma.ui.postMessage({ type: "batch-done", results: summaries });
  }
  function sendProgress(message) {
    figma.ui.postMessage({ type: "progress", message });
  }
  function sendSuccess(componentName, stylesCreated, warnings) {
    figma.ui.postMessage({ type: "success", componentName, stylesCreated, warnings });
  }
  function sendError(message) {
    figma.ui.postMessage({ type: "error", message });
  }
  async function handleClassifyFiles(msg) {
    try {
      const chunkCount = Math.ceil(msg.paths.length / 50);
      sendProgress(
        chunkCount > 1 ? `Classifying ${msg.paths.length} files in ${chunkCount} batches\u2026` : `Classifying ${msg.paths.length} files\u2026`
      );
      const result = await classifyFiles(msg.paths, { apiKey: msg.apiKey });
      figma.ui.postMessage({ type: "classify-result", files: result.files });
    } catch (err) {
      figma.ui.postMessage({ type: "classify-error", message: err.message });
    }
  }
  async function handlePlanStep(msg) {
    var _a, _b;
    const { stepId, category, codes, apiKey, tailwindConfig } = msg;
    const fileNames = (_a = msg.fileNames) != null ? _a : [];
    const summaries = [];
    try {
      for (let i = 0; i < codes.length; i++) {
        const fileName = (_b = fileNames[i]) != null ? _b : `file ${i + 1}`;
        const displayName = fileName;
        sendProgress(`[${i + 1}/${codes.length}] ${fileName}\u2026`);
        figma.ui.postMessage({ type: "batch-progress", index: i, total: codes.length, componentName: fileName });
        if (category === "tokens") {
          try {
            sendProgress(`[${i + 1}/${codes.length}] Extracting tokens from ${fileName}\u2026`);
            const tokens = await extractTokensFromFile(codes[i], fileName, { apiKey });
            const totalTokens = Object.keys(tokens.colors).length + Object.keys(tokens.spacing).length + Object.keys(tokens.borderRadius).length;
            if (totalTokens === 0) {
              summaries.push({ componentName: displayName, ok: true, stylesCreated: 0, warnings: ["No token values found \u2014 file may only contain CSS var() references"] });
              continue;
            }
            const collectionName = fileName.replace(/\.[^.]+$/, "").replace(/[/\\]/g, " \u203A ");
            const varResult = await createFigmaVariables(tokens, collectionName);
            summaries.push({
              componentName: displayName,
              ok: true,
              stylesCreated: varResult.count,
              warnings: varResult.skipped.length ? [`Skipped ${varResult.skipped.length} unsupported token(s)`] : []
            });
          } catch (err) {
            summaries.push({ componentName: displayName, ok: false, error: err instanceof Error ? err.message : String(err), stylesCreated: 0, warnings: [] });
          }
          continue;
        }
        try {
          const result = await runPipeline(codes[i], { apiKey }, tailwindConfig);
          if (isPipelineError(result)) {
            summaries.push({ componentName: displayName, ok: false, error: result.message, stylesCreated: 0, warnings: [] });
            continue;
          }
          const { pass1, pluginCode } = result;
          if (pass1.tokens) {
            try {
              await createFigmaVariables(pass1.tokens, pass1.componentName);
            } catch (_) {
            }
          }
          try {
            const safeCode = pluginCode.replace(/figma\.notify\s*\([^)]*\)\s*;?\s*\n?\s*figma\.closePlugin\s*\(\s*\)\s*;?/g, "").replace(/figma\.closePlugin\s*\(\s*\)\s*;?/g, "").replace(/figma\.viewport\.scrollAndZoomIntoView\s*\([^)]*\)\s*;?/g, "").trim();
            const trimmed = safeCode;
            const returnExpr = trimmed.startsWith("(") ? trimmed : `(${trimmed})`;
            await new Function(`return ${returnExpr}`)();
            const registry = await loadRegistry();
            const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
            if (node) {
              registry[pass1.componentName] = { figmaId: node.id, name: pass1.componentName, sourceHash: hashCode(codes[i]), lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString() };
              await saveRegistry(registry);
            }
            summaries.push({ componentName: pass1.componentName, ok: true, stylesCreated: result.stylesCreated, warnings: result.warnings });
          } catch (execErr) {
            summaries.push({ componentName: pass1.componentName, ok: false, error: `Figma exec error: ${execErr instanceof Error ? execErr.message : String(execErr)}`, stylesCreated: 0, warnings: result.warnings });
          }
        } catch (pipelineErr) {
          summaries.push({ componentName: displayName, ok: false, error: `Pipeline error: ${pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr)}`, stylesCreated: 0, warnings: [] });
        }
      }
    } catch (fatalErr) {
      summaries.push({ componentName: "step", ok: false, error: `Fatal: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, stylesCreated: 0, warnings: [] });
    }
    const totalCreated = summaries.reduce((n, s) => n + s.stylesCreated, 0);
    if (category === "tokens" && totalCreated > 0) {
      figma.notify(`\u2713 ${totalCreated} Figma Variables created \u2014 open Local Variables panel`, { timeout: 6e3 });
    }
    figma.ui.postMessage({ type: "plan-step-done", stepId, results: summaries });
  }
})();
