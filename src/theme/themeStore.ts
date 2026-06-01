export interface Color {
  r: number;
  g: number;
  b: number;
  /**
   * Optional alpha, 0-255. Treated as 255 when omitted. `hex()` only
   * emits the alpha byte when this is set AND < 255 — that way an
   * accidentally-explicit `a: 255` round-trips as a 6-digit hex, which
   * keeps xterm.js happy (its color parser rejects `#rrggbbff` for
   * palette / background / cursor fields).
   */
  a?: number;
}
export type CursorStyle = 'block' | 'bar' | 'underline';

export interface Theme {
  /** Main canvas — also the terminal background. */
  background: Color;
  /**
   * Slightly elevated surface for chrome (status bar, sidebar). Reads as
   * "one layer up" against `background` without needing a border.
   */
  bgElevated: Color;
  /** Primary text — also the terminal foreground. */
  foreground: Color;
  /** Secondary text (section labels, timestamps, captions). */
  fgDim: Color;
  /** Hairline dividers; expected to carry an alpha so it works on any bg. */
  divider: Color;
  /** Subtle hover surface; expected to be an alpha-tinted near-white. */
  hover: Color;
  /**
   * Stronger surface for the active list-row state, distinguishable
   * from `hover` so an active hovered row reads differently from an
   * inactive hovered row.
   */
  active: Color;
  /** Active / brand accent. */
  accent: Color;
  /**
   * Foreground colour expected to be readable on top of `accent` (used
   * by filled accent buttons). Default theme pairs blue with white;
   * future themes that use a light accent must override this.
   */
  accentForeground: Color;
  /** 16-colour ANSI palette for the terminal. */
  palette: Color[];
  cursorColor: Color;
  cursorStyle: CursorStyle;
  selectionBg: Color;
  selectionFg: Color;
  /**
   * Terminal (monospace) font family — the *value* assigned to the
   * `--claui-font-mono` CSS variable. Include the full fallback chain
   * here, not just the bundled face name: `themeToCssVars` writes this
   * string verbatim onto `document.documentElement`, which has higher
   * specificity than App.css's `:root` defaults — losing the chain
   * here loses it everywhere.
   */
  fontFamily: string;
  /**
   * UI / chrome font family — sans-serif sister of `fontFamily`. Same
   * full-chain rule applies (see `fontFamily`).
   */
  uiFontFamily: string;
  /**
   * Family that supplies Nerd Font / PUA icons via xterm.js's per-glyph
   * fallback chain. Decoupled from `fontFamily` so a future theme that
   * picks a different terminal face can keep MonaspaceNF (or swap it
   * for a same-metrics partner) without having to also re-bundle the
   * primary face.
   */
  iconFontFamily: string;
  fontSize: number;
  /**
   * Terminal line height as a multiple of the font size (xterm.js
   * `lineHeight`). > 1 adds vertical breathing room between rows.
   */
  lineHeight: number;
  /**
   * Extra horizontal space between glyphs in px (xterm.js `letterSpacing`).
   * Keep at 0 by default: the DOM renderer can leave gaps in the box-drawing
   * glyphs claude uses for borders once this is non-zero.
   */
  letterSpacing: number;
}

/**
 * claui's built-in theme: near-black chrome (#0a0a0a main, #0f0f0f for
 * elevated surfaces like the sidebar), 8% white hairline dividers, and
 * off-white text. Paired with the Vesper terminal palette — softly
 * saturated ANSI 16 accents that don't compete with the white text for
 * attention on pitch-black. Geist Sans for chrome, Monaspace Neon for
 * the terminal. There is no theme picker yet — real theming is a later
 * phase.
 */
export const defaultTheme: Theme = {
  background: { r: 0x0a, g: 0x0a, b: 0x0a },
  bgElevated: { r: 0x0f, g: 0x0f, b: 0x0f },
  foreground: { r: 0xed, g: 0xed, b: 0xed },
  fgDim: { r: 0x88, g: 0x88, b: 0x88 },
  divider: { r: 0xff, g: 0xff, b: 0xff, a: 0x14 },
  hover: { r: 0xff, g: 0xff, b: 0xff, a: 0x0c },
  active: { r: 0xff, g: 0xff, b: 0xff, a: 0x1a },
  accent: { r: 0x00, g: 0x70, b: 0xf3 },
  accentForeground: { r: 0xff, g: 0xff, b: 0xff },
  // Vesper ANSI palette (by raunofreiberg) — designed for the same pitch-
  // black chrome we use, with softly saturated accents that don't compete
  // with the white text for attention.
  palette: [
    { r: 0x10, g: 0x10, b: 0x10 }, { r: 0xff, g: 0x80, b: 0x80 },
    { r: 0x99, g: 0xff, b: 0xe4 }, { r: 0xff, g: 0xc7, b: 0x99 },
    { r: 0x87, g: 0xce, b: 0xeb }, { r: 0xff, g: 0x85, b: 0xa1 },
    { r: 0x80, g: 0xcb, b: 0xc4 }, { r: 0xed, g: 0xed, b: 0xed },
    { r: 0x33, g: 0x33, b: 0x33 }, { r: 0xff, g: 0xa0, b: 0xa0 },
    { r: 0xb3, g: 0xff, b: 0xea }, { r: 0xff, g: 0xd6, b: 0xb3 },
    { r: 0xa5, g: 0xd8, b: 0xf3 }, { r: 0xff, g: 0x9f, b: 0xb8 },
    { r: 0x9c, g: 0xd5, b: 0xcf }, { r: 0xff, g: 0xff, b: 0xff },
  ],
  cursorColor: { r: 0xed, g: 0xed, b: 0xed },
  cursorStyle: 'block',
  selectionBg: { r: 0xff, g: 0xff, b: 0xff, a: 0x33 },
  selectionFg: { r: 0xed, g: 0xed, b: 0xed },
  fontFamily: "'Monaspace Neon', Menlo, monospace",
  uiFontFamily:
    "Geist, -apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif",
  iconFontFamily: 'Monaspace Neon NF',
  fontSize: 13,
  lineHeight: 1.25,
  letterSpacing: 0,
};

/**
 * Format a colour as `#rrggbb` (opaque) or `#rrggbbaa` (with non-full
 * alpha). `a === 255` collapses to the 6-digit form so opaque palette /
 * background / cursor entries never accidentally surface an alpha byte
 * — xterm.js's strict color parser rejects `#rrggbbff` for those fields.
 */
export const hex = (c: Color): string => {
  const base =
    '#' +
    [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return c.a !== undefined && c.a < 0xff
    ? base + c.a.toString(16).padStart(2, '0')
    : base;
};

/** Pure: convert a Theme into the CSS-variable map for the app chrome. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    '--claui-bg': hex(theme.background),
    '--claui-bg-elevated': hex(theme.bgElevated),
    '--claui-fg': hex(theme.foreground),
    '--claui-fg-dim': hex(theme.fgDim),
    '--claui-divider': hex(theme.divider),
    '--claui-hover': hex(theme.hover),
    '--claui-active': hex(theme.active),
    '--claui-accent': hex(theme.accent),
    '--claui-accent-fg': hex(theme.accentForeground),
    '--claui-font-ui': theme.uiFontFamily,
    '--claui-font-mono': theme.fontFamily,
    '--claui-font-size': `${theme.fontSize}px`,
  };
}

/** Apply a theme to the document root, styling the app chrome via CSS variables. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeToCssVars(theme))) {
    root.style.setProperty(name, value);
  }
}
