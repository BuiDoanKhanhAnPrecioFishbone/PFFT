/**
 * Figma Plugin API reference — embedded into Pass 2 prompts so Claude has
 * authoritative, concise documentation instead of needing to be guided with
 * hardcoded scaffolding examples.
 *
 * Keep this file focused on what Claude most commonly gets wrong.
 * When a new failure mode is discovered, add it here — not inside the prompt
 * template. That way every future prompt benefits automatically.
 */

export const FIGMA_API_REF = `
# Figma Plugin API Reference

## Execution wrapper — MANDATORY
All plugin code must run inside an async IIFE. Top-level await is not supported.
\`\`\`js
(async () => {
  // all code here
})();
\`\`\`

## Font loading — MANDATORY ORDER
1. Load ALL fonts before creating any node or text style — even if the node is not text.
2. Set fontName BEFORE characters. Violating either rule throws at runtime.
\`\`\`js
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const t = figma.createText();
t.fontName = { family: "Inter", style: "Bold" }; // ← FIRST
t.characters = "Hello";                           // ← SECOND
\`\`\`

## Font style name mapping (CSS weight → Figma style string)
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
Rules: spaces are required ("Semi Bold" not "SemiBold"). Unknown weight → "Regular". Unknown family → "Inter". Never guess.

## Colours — ALWAYS 0–1 RGB, NEVER hex or 0–255
\`\`\`js
// hex #2563EB  →  r=0x25/255, g=0x63/255, b=0xEB/255
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

## Auto Layout — always set BOTH axis modes
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
node.opacity = 0.4;   // 0–1
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

// 2. Combine into a ComponentSet — this appends to the page automatically.
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
figma.notify("Component created ✓");
figma.closePlugin();
\`\`\`

## Common mistakes that crash plugins at runtime
- Using hex strings or 0–255 numbers for colours instead of 0–1 floats.
- Setting node.characters before node.fontName.
- Creating text nodes before the font is loaded with loadFontAsync.
- Using "SemiBold" instead of "Semi Bold" (space is required).
- Calling figma.currentPage.appendChild after figma.combineAsVariants.
- Missing primaryAxisSizingMode or counterAxisSizingMode when layoutMode is set.
- Using await outside the async IIFE.
`;
