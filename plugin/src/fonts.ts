/**
 * fonts.ts — Font name normalization + loadFontAsync management
 *
 * Figma uses different font style names than CSS.
 * e.g. "SemiBold" crashes the plugin — it must be "Semi Bold".
 */

/** Maps a CSS font-weight number (and italic flag) to the correct Figma style string. */
const WEIGHT_MAP: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/**
 * Normalizes a CSS font weight (and optional italic flag) to the exact
 * Figma font style string required by `figma.loadFontAsync` and `node.fontName`.
 *
 * @param weight  CSS font-weight number (100–900). Defaults to Regular (400).
 * @param italic  Whether the style is italic. Appends " Italic" suffix when true.
 * @returns       Figma-compatible font style string, e.g. "Semi Bold", "Bold Italic".
 */
export function normalizeFontStyle(weight: number = 400, italic: boolean = false): string {
  const base = WEIGHT_MAP[weight] ?? 'Regular';
  return italic ? `${base} Italic` : base;
}

/**
 * Converts a raw CSS font-weight string or number to the Figma style string.
 *
 * @param weight  "bold", "normal", or a numeric string / number.
 * @param italic  Whether the style is italic.
 */
export function normalizeFontStyleFromString(
  weight: string | number = 'normal',
  italic: boolean = false,
): string {
  if (typeof weight === 'string') {
    if (weight === 'bold') return normalizeFontStyle(700, italic);
    if (weight === 'normal') return normalizeFontStyle(400, italic);
    const parsed = parseInt(weight, 10);
    if (!isNaN(parsed)) return normalizeFontStyle(parsed, italic);
    return normalizeFontStyle(400, italic);
  }
  return normalizeFontStyle(weight, italic);
}

/** A minimal font descriptor used throughout the plugin. */
export interface FontDescriptor {
  family: string;
  weight?: number;
  italic?: boolean;
  /** Pre-computed Figma style string (takes precedence if provided). */
  style?: string;
}

/**
 * Loads all required fonts before any text node is created.
 * Must be called at the top of the async IIFE, before any `figma.createText()`.
 *
 * Falls back to Inter Regular for any unknown family rather than crashing.
 *
 * @param fonts  Array of font descriptors extracted from the component.
 */
export async function loadAllFonts(fonts: FontDescriptor[]): Promise<void> {
  // Always ensure Inter Regular is available as the fallback.
  const required: FontName[] = [{ family: 'Inter', style: 'Regular' }];

  for (const font of fonts) {
    const family = font.family || 'Inter';
    const style = font.style ?? normalizeFontStyle(font.weight ?? 400, font.italic ?? false);
    required.push({ family, style });
  }

  // De-duplicate before loading (Figma throws on duplicate loads in some versions).
  const seen = new Set<string>();
  const unique = required.filter((f) => {
    const key = `${f.family}::${f.style}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await Promise.all(
    unique.map((font) =>
      figma.loadFontAsync(font).catch(() => {
        // Substitute with Inter Regular if the font is unavailable.
        console.warn(`[Code to Figma] Font not found: ${font.family} ${font.style}. Falling back to Inter Regular.`);
      }),
    ),
  );
}
