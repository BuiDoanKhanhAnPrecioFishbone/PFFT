/**
 * tokens.ts — Design token extraction + Figma Variables creation
 *
 * Phase 2 feature: converts design tokens (from tailwind.config.js or
 * theme files) into Figma Variable Collections.
 *
 * Two entry points:
 *   parseTailwindConfig(source)     — pure function, no Figma APIs
 *   createFigmaVariables(tokens)    — Figma Plugin API (plugin thread only)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesignTokens {
  /** color name → 6-digit hex, e.g. { "primary": "#2563EB" } */
  colors: Record<string, string>;
  /** spacing name → pixel value, e.g. { "4": 16, "8": 32 } */
  spacing: Record<string, number>;
  /** border-radius name → pixel value, e.g. { "lg": 8 } */
  borderRadius: Record<string, number>;
  /** font-family alias → CSS font-family string */
  fontFamily: Record<string, string>;
}

export interface VariableCreationResult {
  collectionId: string;
  /** Total number of variables created */
  count: number;
  /** Names of variables that failed (font-family tokens are skipped — Figma FLOAT/COLOR only) */
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Tailwind config parser (pure — no Figma APIs)
// ---------------------------------------------------------------------------

/**
 * Parses a `tailwind.config.js` source string and extracts a flat
 * `DesignTokens` object usable by Claude and `createFigmaVariables`.
 *
 * Handles the most common Tailwind config patterns:
 *   - `theme.colors`, `theme.extend.colors`
 *   - `theme.spacing`, `theme.extend.spacing`
 *   - `theme.borderRadius`, `theme.extend.borderRadius`
 *   - `theme.fontFamily`, `theme.extend.fontFamily`
 *
 * Uses NO Node.js file-system APIs — accepts the source as a string.
 */
export function parseTailwindConfig(configSource: string): DesignTokens {
  const tokens: DesignTokens = {
    colors: {},
    spacing: {},
    borderRadius: {},
    fontFamily: {},
  };

  // Extract a section of the config source between balanced braces
  // starting after a given keyword, e.g. "colors:".
  function extractBlock(source: string, keyword: string): string | null {
    const idx = source.indexOf(keyword);
    if (idx === -1) return null;
    let start = source.indexOf('{', idx + keyword.length);
    if (start === -1) return null;
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return source.slice(start, end + 1);
  }

  // Parse a flat object literal string into key → string value pairs.
  // Handles both single-quoted and double-quoted string values.
  function parseStringRecord(block: string): Record<string, string> {
    const result: Record<string, string> = {};
    // Match: 'key': 'value' | "key": "value" | key: 'value'
    const re = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      result[m[1]] = m[2];
    }
    return result;
  }

  // Parse a flat object literal string into key → number value pairs.
  // Handles: 'key': 4 | "key": 16 | key: '16px' | key: "1rem"
  function parseNumberRecord(block: string): Record<string, number> {
    const result: Record<string, number> = {};
    const re = /['"]?([\w.-]+)['"]?\s*:\s*['"]?([\d.]+)(px|rem|em)?['"]?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const raw = parseFloat(m[2]);
      if (isNaN(raw)) continue;
      // Convert rem → pixels (assume 1rem = 16px for Tailwind defaults).
      const multiplier = m[3] === 'rem' || m[3] === 'em' ? 16 : 1;
      result[m[1]] = Math.round(raw * multiplier);
    }
    return result;
  }

  // Try both `theme.X` and `theme.extend.X`, merge with extend winning.
  function mergeSection<T>(
    source: string,
    key: string,
    parser: (block: string) => Record<string, T>,
  ): Record<string, T> {
    const base = extractBlock(source, `${key}:`);
    const extend = (() => {
      const extendBlock = extractBlock(source, 'extend:');
      if (!extendBlock) return null;
      return extractBlock(extendBlock, `${key}:`);
    })();

    const baseResult = base ? parser(base) : {};
    const extendResult = extend ? parser(extend) : {};
    return { ...baseResult, ...extendResult };
  }

  tokens.colors = mergeSection(configSource, 'colors', parseStringRecord);
  tokens.spacing = mergeSection(configSource, 'spacing', parseNumberRecord);
  tokens.borderRadius = mergeSection(configSource, 'borderRadius', parseNumberRecord);

  // fontFamily values are arrays like: { sans: ['Inter', 'sans-serif'] }
  // Extract just the first family name.
  const fontSection = mergeSection(configSource, 'fontFamily', parseStringRecord);
  for (const [key, val] of Object.entries(fontSection)) {
    // Strip array brackets if present — take first family name
    tokens.fontFamily[key] = val.replace(/[\[\]'"]/g, '').split(',')[0].trim();
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// TypeScript/JS token file parser — handles deeply nested color objects
// ---------------------------------------------------------------------------

/**
 * Extracts the content between the first matching pair of balanced braces
 * starting at position 0 of `src` (which must start with '{').
 */
function extractBalancedBlock(src: string): string | null {
  if (src[0] !== '{') return null;
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(0, i + 1);
    }
  }
  return null;
}

/**
 * Recursively walks a JS/TS object literal string and flattens all
 * hex color values into a flat map with keys joined by '/'.
 *
 * Example input:
 *   { blue: { 50: '#e6ecfa', 100: '#cdd8f5' }, red: { 500: '#dc3545' } }
 * Output:
 *   { 'blue/50': '#e6ecfa', 'blue/100': '#cdd8f5', 'red/500': '#dc3545' }
 *
 * Skips CSS var(...) references.
 */
function flattenNestedColors(block: string, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};
  // Matches: optionalQuote key optionalQuote colon then either string-value or '{'
  const re = /['"]?([\w-]+)['"]?\s*:\s*/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(block)) !== null) {
    const key = m[1];
    const fullKey = prefix ? `${prefix}/${key}` : key;
    const rest = block.slice(m.index + m[0].length).trimStart();

    if (rest.startsWith('{')) {
      const nested = extractBalancedBlock(rest);
      if (nested) {
        const sub = flattenNestedColors(nested.slice(1, -1), fullKey);
        Object.assign(result, sub);
        // Advance past the nested block to avoid re-matching its contents
        re.lastIndex = m.index + m[0].length + (block.slice(m.index + m[0].length).indexOf(nested) + nested.length);
      }
    } else {
      // String value (single or double quoted)
      const strMatch = rest.match(/^['"]([^'"]+)['"]/);
      if (strMatch) {
        const val = strMatch[1].trim();
        // Only keep actual hex colors — skip var(--...) and other references
        if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
          result[fullKey] = val;
        }
      }
    }
  }

  return result;
}

/**
 * Parses a TypeScript/JS design token file (NOT a tailwind.config) and extracts
 * colors, spacing, and borderRadius into a flat DesignTokens object.
 *
 * Handles files like:
 *   export const colorPalettes = { blue: { 50: '#hex', ... }, ... }
 *   export const spacing = { 1: 4, 2: 8, ... }
 *   export const colors = { primary: '#hex', ... }
 */
export function parseTypescriptTokenFile(source: string): DesignTokens {
  const tokens: DesignTokens = { colors: {}, spacing: {}, borderRadius: {}, fontFamily: {} };

  // Find each top-level export: `export const NAME = { ... }`
  const exportRe = /export\s+(?:default\s+)?(?:const|let|var)\s+([\w]+)\s*(?::[^=]*)?\s*=\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = exportRe.exec(source)) !== null) {
    const exportName = m[1].toLowerCase();
    // Find the opening brace of this export
    const braceStart = m.index + m[0].length - 1;
    const block = extractBalancedBlock(source.slice(braceStart));
    if (!block) continue;
    const inner = block.slice(1, -1);

    const isColorExport =
      /color|palette|theme|tint|hue|fill|ink/i.test(exportName);
    const isSpacingExport = /spacing|space|gap|margin|padding/i.test(exportName);
    const isRadiusExport  = /radius|rounded|corner/i.test(exportName);
    // Skip cssVars exports — they contain `var(--...)` references, not real values
    const isCssVars = /cssvar|csstoken|var/i.test(exportName);

    if (isCssVars) continue;

    if (isColorExport) {
      const extracted = flattenNestedColors(inner);
      Object.assign(tokens.colors, extracted);
    } else if (isSpacingExport) {
      // Flat number record
      const re2 = /['"]?([\w.-]+)['"]?\s*:\s*([\d.]+)/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(inner)) !== null) {
        tokens.spacing[m2[1]] = parseFloat(m2[2]);
      }
    } else if (isRadiusExport) {
      const re2 = /['"]?([\w.-]+)['"]?\s*:\s*([\d.]+)/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(inner)) !== null) {
        tokens.borderRadius[m2[1]] = parseFloat(m2[2]);
      }
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Figma Variables creator (Figma Plugin API — plugin thread only)
// ---------------------------------------------------------------------------

/**
 * Converts a `DesignTokens` object into Figma Variable Collections.
 *
 * Creates:
 *   - One VariableCollection named `collectionName`
 *   - One Variable per color token (type: COLOR)
 *   - One Variable per spacing token (type: FLOAT)
 *   - One Variable per borderRadius token (type: FLOAT)
 *   - fontFamily tokens are skipped (Figma Variables don't support CSS strings well)
 *
 * Must be called from the Figma plugin main thread (code.ts), NOT from the UI.
 */
export async function createFigmaVariables(
  tokens: DesignTokens,
  collectionName: string = 'Design Tokens',
): Promise<VariableCreationResult> {
  const skipped: string[] = [];
  let count = 0;

  // Create (or reuse existing) Variable Collection.
  let collection: VariableCollection;
  const existing = figma.variables
    .getLocalVariableCollections()
    .find((c) => c.name === collectionName);

  if (existing) {
    collection = existing;
  } else {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  const modeId = collection.modes[0].modeId;

  // Helper: find or create a Variable by name + type.
  function getOrCreateVar(name: string, type: VariableResolvedDataType): Variable {
    const existingVar = figma.variables
      .getLocalVariables(type)
      .find((v) => v.name === name && v.variableCollectionId === collection.id);
    return existingVar ?? figma.variables.createVariable(name, collection.id, type);
  }

  // Helper: hex → RGB 0–1
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const raw = hex.replace('#', '');
    if (raw.length !== 6) return null;
    return {
      r: parseInt(raw.slice(0, 2), 16) / 255,
      g: parseInt(raw.slice(2, 4), 16) / 255,
      b: parseInt(raw.slice(4, 6), 16) / 255,
    };
  }

  // ── Color tokens → COLOR variables ────────────────────────────────────────
  for (const [name, hex] of Object.entries(tokens.colors)) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      skipped.push(`colors/${name} — could not parse hex "${hex}"`);
      continue;
    }
    try {
      const variable = getOrCreateVar(`colors/${name}`, 'COLOR');
      variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
      count++;
    } catch {
      skipped.push(`colors/${name}`);
    }
  }

  // ── Spacing tokens → FLOAT variables ──────────────────────────────────────
  for (const [name, px] of Object.entries(tokens.spacing)) {
    try {
      const variable = getOrCreateVar(`spacing/${name}`, 'FLOAT');
      variable.setValueForMode(modeId, px);
      count++;
    } catch {
      skipped.push(`spacing/${name}`);
    }
  }

  // ── BorderRadius tokens → FLOAT variables ─────────────────────────────────
  for (const [name, px] of Object.entries(tokens.borderRadius)) {
    try {
      const variable = getOrCreateVar(`radius/${name}`, 'FLOAT');
      variable.setValueForMode(modeId, px);
      count++;
    } catch {
      skipped.push(`radius/${name}`);
    }
  }

  // Font-family tokens: skip — Figma Variables support COLOR/FLOAT/STRING/BOOLEAN
  // but STRING variables for font families are unreliable in Phase 2; log as skipped.
  for (const name of Object.keys(tokens.fontFamily)) {
    skipped.push(`fontFamily/${name} — font family tokens skipped (not COLOR/FLOAT)`);
  }

  return { collectionId: collection.id, count, skipped };
}
