/**
 * mapper.ts — CSS/Tailwind utilities → Figma property values
 *
 * Provides two main exports:
 *   tailwindToPixels(className)  — converts a Tailwind utility class to a pixel value
 *   hexToFigmaRgb(hex)           — converts hex colour strings to Figma RGB (0–1 range)
 */

// ---------------------------------------------------------------------------
// Tailwind → Pixels lookup table
// ---------------------------------------------------------------------------

/** Tailwind spacing scale: 1 unit = 4 px */
const SPACING: Record<string, number> = {
  '0': 0,
  'px': 1,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '11': 44,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
  '24': 96,
  '28': 112,
  '32': 128,
  '36': 144,
  '40': 160,
  '44': 176,
  '48': 192,
  '52': 208,
  '56': 224,
  '60': 240,
  '64': 256,
  '72': 288,
  '80': 320,
  '96': 384,
};

/** Tailwind font-size → pixel values (line-height ignored for simplicity). */
const FONT_SIZES: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};

/** Tailwind border-radius → pixel values. */
const BORDER_RADIUS: Record<string, number> = {
  none: 0,
  sm: 2,
  '': 4,       // `rounded` with no suffix → 4px
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
};

type SpacingPrefix =
  | 'p' | 'pt' | 'pr' | 'pb' | 'pl' | 'px' | 'py'
  | 'm' | 'mt' | 'mr' | 'mb' | 'ml' | 'mx' | 'my'
  | 'w' | 'h' | 'gap' | 'gap-x' | 'gap-y'
  | 'space-x' | 'space-y'
  | 'inset' | 'top' | 'right' | 'bottom' | 'left'
  | 'min-w' | 'max-w' | 'min-h' | 'max-h';

/**
 * Converts a Tailwind utility class to a pixel value.
 *
 * Supported categories: spacing (p-*, m-*, gap-*, w-*, h-*), text size, border-radius.
 * Returns `null` for unrecognised classes.
 */
export function tailwindToPixels(className: string): number | null {
  if (!className) return null;

  // Strip responsive prefix (sm:, md:, lg:, xl:, 2xl:)
  const withoutResponsive = className.replace(/^(xs|sm|md|lg|xl|2xl):/, '');

  // Strip negative prefix
  const negative = withoutResponsive.startsWith('-');
  const cls = negative ? withoutResponsive.slice(1) : withoutResponsive;

  // ── Text size ──────────────────────────────────────────────────────────────
  const textMatch = cls.match(/^text-(.+)$/);
  if (textMatch) {
    const val = FONT_SIZES[textMatch[1]];
    return val !== undefined ? (negative ? -val : val) : null;
  }

  // ── Border radius ──────────────────────────────────────────────────────────
  if (cls === 'rounded') return BORDER_RADIUS[''];
  const roundedMatch = cls.match(/^rounded-(.+)$/);
  if (roundedMatch) {
    const val = BORDER_RADIUS[roundedMatch[1]];
    return val !== undefined ? val : null;
  }

  // ── Spacing (p, m, gap, w, h, …) ──────────────────────────────────────────
  const spacingPrefixes: SpacingPrefix[] = [
    'space-x', 'space-y', 'gap-x', 'gap-y',
    'gap', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
    'mx', 'my', 'mt', 'mr', 'mb', 'ml',
    'min-w', 'max-w', 'min-h', 'max-h',
    'inset', 'top', 'right', 'bottom', 'left',
    'p', 'm', 'w', 'h',
  ];

  for (const prefix of spacingPrefixes) {
    if (cls.startsWith(`${prefix}-`)) {
      const scale = cls.slice(prefix.length + 1);
      const val = SPACING[scale];
      if (val !== undefined) return negative ? -val : val;
      // Handle fraction widths (w-1/2, w-full, etc.) — skip; not a px value
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hex → Figma RGB
// ---------------------------------------------------------------------------

/**
 * Converts a CSS hex colour string (#RGB, #RRGGBB, #RRGGBBAA) to Figma's
 * RGB type where each channel is in the 0–1 range.
 *
 * @throws {Error} on invalid/unrecognised hex input
 */
export function hexToFigmaRgb(hex: string): RGB & { a?: number } {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;

  let r: number, g: number, b: number, a: number | undefined;

  if (raw.length === 3) {
    // #RGB → expand to #RRGGBB
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else if (raw.length === 8) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
    a = parseInt(raw.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`[Code to Figma] Invalid hex colour: "${hex}"`);
  }

  if ([r, g, b].some((v) => isNaN(v))) {
    throw new Error(`[Code to Figma] Could not parse hex colour: "${hex}"`);
  }

  const result: RGB & { a?: number } = { r: r / 255, g: g / 255, b: b / 255 };
  if (a !== undefined) result.a = a;
  return result;
}

/**
 * Converts a CSS colour value (hex or rgba(...)) to a Figma Paint.
 * Returns a SOLID paint or null if the colour cannot be parsed.
 */
export function colorToFigmaPaint(colour: string): Paint | null {
  const trimmed = colour.trim();

  // Hex colours
  if (trimmed.startsWith('#')) {
    try {
      const { r, g, b, a } = hexToFigmaRgb(trimmed);
      const paint: SolidPaint = {
        type: 'SOLID',
        color: { r, g, b },
        opacity: a ?? 1,
      };
      return paint;
    } catch {
      return null;
    }
  }

  // rgba(r, g, b, a) — simple parser
  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgbaMatch) {
    const paint: SolidPaint = {
      type: 'SOLID',
      color: {
        r: parseInt(rgbaMatch[1], 10) / 255,
        g: parseInt(rgbaMatch[2], 10) / 255,
        b: parseInt(rgbaMatch[3], 10) / 255,
      },
      opacity: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
    return paint;
  }

  return null;
}
