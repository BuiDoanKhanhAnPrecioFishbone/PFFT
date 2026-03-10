/**
 * claude.ts â€” Claude API wrapper + two-pass prompt templates
 *
 * Pass 1 â€” Extract: component code â†’ validated structural JSON
 * Pass 2 â€” Generate: validated JSON â†’ Figma Plugin JavaScript
 *
 * IMPORTANT: This module is imported by code.ts (Figma main thread).
 * Do NOT import any browser-only APIs here.
 */

import type { DesignTokens } from './tokens';
import { FIGMA_API_REF } from './figmaApiRef';

export type { DesignTokens };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FontUsed {
  family: string;
  weight: number;
  italic: boolean;
}

export interface FillUsed {
  hex: string;
  opacity?: number;
}

/** A named Figma Paint Style extracted from the component. */
export interface ColorStyle {
  /** Figma style name, e.g. "Button/Background" or "Brand/Primary" */
  styleName: string;
  hex: string;
  opacity: number;
}

/** A named Figma Text Style extracted from the component. */
export interface TypographyStyleEntry {
  /** Figma style name, e.g. "Button/Label" or "Heading/H1" */
  styleName: string;
  family: string;
  weight: number;
  italic: boolean;
  sizePx: number;
  lineHeightPx?: number;
  letterSpacingPx?: number;
}

/** @deprecated Use ColorStyle / TypographyStyleEntry */
export interface TypographyStyle {
  role: string;
  family: string;
  weight: number;
  italic: boolean;
  sizePx: number;
  colour: string;
}

/** A prop + its possible values, used to build a Figma ComponentSet variant matrix. */
export interface VariantProp {
  /** React prop name, e.g. "variant" or "size" */
  propName: string;
  /** All values detected in the component, e.g. ["primary", "ghost", "outline"] */
  values: string[];
}

export interface ComponentNode {
  type: 'frame' | 'text' | 'rectangle' | 'ellipse' | 'group';
  name: string;
  layoutMode?: 'VERTICAL' | 'HORIZONTAL' | 'NONE';
  width?: number | 'AUTO' | 'FILL';
  height?: number | 'AUTO' | 'FILL';
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  primaryAxisSizingMode?: 'AUTO' | 'FIXED';
  counterAxisSizingMode?: 'AUTO' | 'FIXED';
  cornerRadius?: number;
  fills?: FillUsed[];
  stroke?: { hex: string; weight: number };
  text?: string;
  fontFamily?: string;
  fontWeight?: number;
  fontItalic?: boolean;
  fontSize?: number;
  textColour?: string;
  children?: ComponentNode[];
  opacity?: number;
  flags?: string[];  // e.g. ["ambiguous:borderStyle uncertain"]
}

export interface Pass1Result {
  componentName: string;
  description?: string;
  fonts: FontUsed[];
  /** Unique named colours â†’ create Figma Paint Styles for each */
  colorStyles: ColorStyle[];
  /** Unique typography roles â†’ create Figma Text Styles for each */
  typographyStyles: TypographyStyleEntry[];
  /**
   * Design tokens extracted from the Tailwind config or theme.
   * If present, code.ts will create Figma Variable entries for each.
   */
  tokens?: DesignTokens;
  /**
   * Component prop combinations for variant matrix.
   * If present, Pass 2 generates a figma.combineAsVariants() ComponentSet.
   */
  variants?: VariantProp[];
  tree: ComponentNode;
  ambiguities?: string[];
}

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  /** Override the default max_tokens (4096). Haiku supports up to 8096. */
  maxTokensOverride?: number;
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

export function buildPass1Prompt(componentCode: string, tailwindConfig?: string): string {
  return `You are a design-system analyser. Your job is to read a React/JSX/Tailwind component and output a precise structural JSON that a Figma plugin will use to:
1. Create named local Figma Paint Styles and Text Styles.
2. Extract design tokens for Figma Variables.
3. Detect component prop variants to generate a Figma ComponentSet.

## Component Code
\`\`\`
${componentCode}
\`\`\`
${tailwindConfig ? `\n## Tailwind Config (project-specific values)\n\`\`\`\n${tailwindConfig}\n\`\`\`\n` : ''}

## Output Requirements

Return ONLY valid JSON â€” no markdown, no explanation, no trailing text. The JSON must conform exactly to this schema:

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
      "opacity": number              // 0â€“1
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
    "opacity": number,               // 0â€“1, default 1
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

export function buildPass2Prompt(pass1Json: Pass1Result): string {
  const jsonStr = JSON.stringify(pass1Json, null, 2);

  // Variant handling  cap to 2 props / 20 max combinations to stay practical.
  const variants = pass1Json.variants ?? [];
  let cappedVariants = variants;
  if (variants.length > 0) {
    const product = variants.reduce((acc, v) => acc * v.values.length, 1);
    if (product > 20) cappedVariants = variants.slice(0, 2);
  }
  const hasVariants = cappedVariants.length > 0;
  const variantCount = hasVariants
    ? cappedVariants.reduce((a, v) => a * v.values.length, 1)
    : 0;

  const variantInstruction = hasVariants
    ? `The component has ${cappedVariants.length} variant prop(s)  use figma.createComponent() + figma.combineAsVariants() as documented in the API reference:\n${cappedVariants.map((v) => `  - "${v.propName}": [${v.values.map((x) => `"${x}"`).join(', ')}]`).join('\n')}\nTotal combinations: ${variantCount}. Create one figma.createComponent() per combination, name each "Prop1=value1, Prop2=value2", adapt fills/padding/opacity per variant value.`
    : `No variants  use figma.createFrame() for the root, then call figma.currentPage.appendChild(root).`;

  const styleCount = (pass1Json.colorStyles?.length ?? 0) + (pass1Json.typographyStyles?.length ?? 0);
  const notifyMsg  = hasVariants
    ? `${pass1Json.componentName}  ${variantCount} variants created `
    : `${pass1Json.componentName}  ${styleCount} styles `;

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
// ---------------------------------------------------------------------------
// Claude API calls
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const RETRY_DELAY_MS = 1500;

/** Calls the Claude Messages API with a single user turn. */
async function callClaude(
  prompt: string,
  options: ClaudeOptions,
): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;

  console.log('[Claude] About to call fetch from:', typeof window === 'undefined' ? 'Node/Figma context' : 'Browser context');
  console.log('[Claude] fetch available?', typeof fetch);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokensOverride ?? 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content');
  return textBlock.text;
}

/**
 * Calls Claude with one automatic retry on network/timeout errors.
 * Throws on second failure or non-retryable errors (4xx auth/rate-limit).
 */
async function callClaudeWithRetry(
  prompt: string,
  options: ClaudeOptions,
): Promise<string> {
  try {
    return await callClaude(prompt, options);
  } catch (firstErr) {
    const msg = (firstErr as Error).message ?? '';
    // Don't retry on auth or content-policy errors — surface immediately.
    if (msg.includes('401') || msg.includes('403') || msg.includes('400')) {
      throw firstErr;
    }
    // Retry once after a short delay.
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await callClaude(prompt, options);
  }
}

/** Validates and parses the Pass 1 JSON response from Claude. */
function parsePass1Response(raw: string): Pass1Result {
  // Strip potential markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Pass 1 JSON parse error: ${(e as Error).message}\n\nRaw response:\n${raw}`);
  }

  const result = parsed as Pass1Result;

  if (typeof result.componentName !== 'string' || !result.componentName) {
    throw new Error('Pass 1 JSON missing required field: componentName');
  }
  if (!Array.isArray(result.fonts)) {
    throw new Error('Pass 1 JSON missing required field: fonts (array)');
  }
  if (!result.tree || typeof result.tree !== 'object') {
    throw new Error('Pass 1 JSON missing required field: tree (object)');
  }

  // Normalise optional arrays.
  if (!Array.isArray(result.colorStyles))      result.colorStyles      = [];
  if (!Array.isArray(result.typographyStyles)) result.typographyStyles = [];
  if (!Array.isArray(result.ambiguities))      result.ambiguities      = [];
  if (!Array.isArray(result.variants))         result.variants         = [];

  // Warn about non-Inter fonts (may not be installed in Figma).
  const nonInterFonts = result.fonts.filter(
    (f) => f.family.toLowerCase() !== 'inter',
  );
  if (nonInterFonts.length > 0) {
    result.ambiguities = [
      ...result.ambiguities,
      ...nonInterFonts.map(
        (f) => `Font "${f.family}" may not be available in Figma — substituted with Inter if missing`,
      ),
    ];
  }

  return result;
}

/** Strips markdown fences and sanity-checks that Claude returned plugin code. */
function parsePass2Response(raw: string): string {
  const cleaned = raw
    .replace(/^```(?:javascript|js)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  if (!cleaned.includes('figma.') && !cleaned.includes('(async')) {
    throw new Error('Pass 2 response does not look like valid Figma plugin code');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Public pipeline API
// ---------------------------------------------------------------------------

export interface PipelineSuccess {
  pass1: Pass1Result;
  pluginCode: string;
  warnings: string[];
  stylesCreated: number;
}

export interface PipelineError {
  stage: 'pass1' | 'pass2';
  message: string;
}

export function isPipelineError(
  result: PipelineSuccess | PipelineError,
): result is PipelineError {
  return 'stage' in result && 'message' in result;
}

/**
 * Full two-pass pipeline: component source code → Figma Plugin JavaScript.
 *
 * Pass 1: extract structured JSON (component tree, styles, tokens, variants).
 * Pass 2: generate executable Figma Plugin JS from that JSON.
 */
export async function runPipeline(
  componentCode: string,
  options: ClaudeOptions,
  tailwindConfig?: string,
): Promise<PipelineSuccess | PipelineError> {
  // ── Pass 1 ────────────────────────────────────────────────────────────────
  let pass1: Pass1Result;
  try {
    const prompt1 = buildPass1Prompt(componentCode, tailwindConfig);
    const raw1    = await callClaudeWithRetry(prompt1, options);
    pass1         = parsePass1Response(raw1);
  } catch (err) {
    return { stage: 'pass1', message: `Extraction failed: ${(err as Error).message}` };
  }

  // ── Pass 2 ────────────────────────────────────────────────────────────────
  let pluginCode: string;
  try {
    const prompt2 = buildPass2Prompt(pass1);
    const raw2    = await callClaudeWithRetry(prompt2, options);
    pluginCode    = parsePass2Response(raw2);
  } catch (err) {
    return { stage: 'pass2', message: `Code generation failed: ${(err as Error).message}` };
  }

  const warnings      = pass1.ambiguities ?? [];
  const stylesCreated =
    (pass1.colorStyles?.length      ?? 0) +
    (pass1.typographyStyles?.length ?? 0);

  return { pass1, pluginCode, warnings, stylesCreated };
}

/**
 * Runs runPipeline on multiple components sequentially, reporting progress.
 */
export async function runBatchPipeline(
  codes: string[],
  options: ClaudeOptions,
  onProgress?: (index: number, total: number, componentName: string) => void,
  tailwindConfig?: string,
): Promise<Array<PipelineSuccess | PipelineError>> {
  const results: Array<PipelineSuccess | PipelineError> = [];
  for (let i = 0; i < codes.length; i++) {
    const result = await runPipeline(codes[i], options, tailwindConfig);
    results.push(result);
    const name = isPipelineError(result)
      ? `(error at ${result.stage})`
      : result.pass1.componentName;
    onProgress?.(i, codes.length, name);
  }
  return results;
}

/**
 * Uses Claude Haiku to extract design tokens from any source file format
 * (nested TS objects, flat JSON, SCSS vars, Style Dictionary, etc.).
 */
export async function extractTokensFromFile(
  fileContent: string,
  fileName: string,
  options: ClaudeOptions,
): Promise<DesignTokens> {
  // Cap at 12 KB to stay within a reasonable context budget for Haiku.
  const truncated =
    fileContent.length > 12_000
      ? fileContent.slice(0, 12_000) + '\n// [truncated]'
      : fileContent;

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
- Flatten nested color objects: { blue: { 50: '#hex' } } → { "blue/50": "#hex" }
- All color values must be 6-digit hex strings starting with #. Skip CSS var() references.
- All spacing/radius values must be numbers in pixels. Convert rem to px (1rem = 16px).
- Skip any values that reference CSS variables (var(--...)).
- If a section has no values, output an empty object {}.
- Include ALL color shades from ALL color scales in the file.
- DO NOT skip colors — include every single hex value found.`;

  const raw = await callClaude(prompt, {
    ...options,
    model: 'claude-haiku-4-5',
    maxTokensOverride: 8096,
  });

  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<DesignTokens>;
    return {
      colors:       parsed.colors       ?? {},
      spacing:      parsed.spacing      ?? {},
      borderRadius: parsed.borderRadius ?? {},
      fontFamily:   parsed.fontFamily   ?? {},
    };
  } catch {
    return { colors: {}, spacing: {}, borderRadius: {}, fontFamily: {} };
  }
}

/** Classified file entry returned by classifyFiles. */
export interface ClassifiedFile {
  path: string;
  category: 'tokens' | 'atoms' | 'molecules' | 'organisms' | 'pages' | 'skip';
  reason: string;
}

/**
 * Uses Claude Haiku to classify a list of file paths by UI component category.
 * Processes up to 50 paths per Claude call.
 */
export async function classifyFiles(
  paths: string[],
  options: ClaudeOptions,
): Promise<{ files: ClassifiedFile[] }> {
  const CHUNK = 50;
  const allFiles: ClassifiedFile[] = [];

  for (let start = 0; start < paths.length; start += CHUNK) {
    const chunk    = paths.slice(start, start + CHUNK);
    const fileList = chunk.map((p, i) => `${start + i + 1}. ${p}`).join('\n');

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
- Files in hooks/, utils/, lib/, store/, context/, api/, services/ folders → skip.
- Files ending in .d.ts, .test.*, .spec.*, .stories.* → skip.`;

    const raw = await callClaude(prompt, {
      ...options,
      model: 'claude-haiku-4-5',
      maxTokensOverride: 8096,
    });

    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    let parsed: { files: ClassifiedFile[] };
    try {
      parsed = JSON.parse(cleaned) as { files: ClassifiedFile[] };
    } catch (e) {
      console.error('[classifyFiles] JSON parse failed for chunk, marking as skip:', e);
      for (const p of chunk) {
        allFiles.push({ path: p, category: 'skip', reason: 'parse error — classified as skip' });
      }
      continue;
    }

    if (!Array.isArray(parsed.files)) {
      for (const p of chunk) {
        allFiles.push({ path: p, category: 'skip', reason: 'invalid response — classified as skip' });
      }
      continue;
    }

    allFiles.push(...parsed.files);
  }

  return { files: allFiles };
}