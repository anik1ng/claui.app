export interface Color { r: number; g: number; b: number; }
export type CursorStyle = 'block' | 'bar' | 'underline';

export interface Theme {
  background: Color;
  foreground: Color;
  palette: Color[];
  cursorColor: Color;
  cursorStyle: CursorStyle;
  selectionBg: Color;
  selectionFg: Color;
  fontFamily: string;
  fontSize: number;
}

/**
 * claui's built-in theme — applied directly at startup. There is no theme
 * config file or picker yet; real theming is a later phase.
 */
export const defaultTheme: Theme = {
  background: { r: 0x1d, g: 0x1f, b: 0x21 },
  foreground: { r: 0xc5, g: 0xc8, b: 0xc6 },
  palette: [
    { r: 0x28, g: 0x2a, b: 0x2e }, { r: 0xa5, g: 0x42, b: 0x42 },
    { r: 0x8c, g: 0x94, b: 0x40 }, { r: 0xde, g: 0x93, b: 0x5f },
    { r: 0x5f, g: 0x81, b: 0x9d }, { r: 0x85, g: 0x67, b: 0x8f },
    { r: 0x5e, g: 0x8d, b: 0x87 }, { r: 0x70, g: 0x78, b: 0x80 },
    { r: 0x37, g: 0x3b, b: 0x41 }, { r: 0xcc, g: 0x66, b: 0x66 },
    { r: 0xb5, g: 0xbd, b: 0x68 }, { r: 0xf0, g: 0xc6, b: 0x74 },
    { r: 0x81, g: 0xa2, b: 0xbe }, { r: 0xb2, g: 0x94, b: 0xbb },
    { r: 0x8a, g: 0xbe, b: 0xb7 }, { r: 0xc5, g: 0xc8, b: 0xc6 },
  ],
  cursorColor: { r: 0xc5, g: 0xc8, b: 0xc6 },
  cursorStyle: 'block',
  selectionBg: { r: 0x37, g: 0x3b, b: 0x41 },
  selectionFg: { r: 0xc5, g: 0xc8, b: 0xc6 },
  fontFamily: 'monospace',
  fontSize: 13,
};

/** Format a color as a `#rrggbb` string. */
export const hex = (c: Color): string =>
  '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');

/** Pure: convert a Theme into the CSS-variable map for the app chrome. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    '--claui-bg': hex(theme.background),
    '--claui-fg': hex(theme.foreground),
    '--claui-accent': hex(theme.palette[4] ?? theme.foreground),
    '--claui-divider': hex(theme.palette[8] ?? theme.foreground),
    '--claui-font-family': theme.fontFamily,
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
