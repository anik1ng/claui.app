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

let current: Theme | null = null;

/** Apply a theme to the document root for the app chrome and remember it. */
export function setTheme(theme: Theme): void {
  current = theme;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeToCssVars(theme))) {
    root.style.setProperty(name, value);
  }
}

export function getTheme(): Theme | null {
  return current;
}
