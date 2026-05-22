use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorStyle {
    Block,
    Bar,
    Underline,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub background: Color,
    pub foreground: Color,
    pub palette: [Color; 16],
    pub cursor_color: Color,
    pub cursor_style: CursorStyle,
    pub selection_bg: Color,
    pub selection_fg: Color,
    pub font_family: String,
    pub font_size: f32,
}

impl Default for Theme {
    fn default() -> Self {
        // Built-in dark theme used when no Ghostty config is found.
        let c = |r, g, b| Color { r, g, b };
        Theme {
            background: c(0x1d, 0x1f, 0x21),
            foreground: c(0xc5, 0xc8, 0xc6),
            palette: [
                c(0x28, 0x2a, 0x2e), c(0xa5, 0x42, 0x42), c(0x8c, 0x94, 0x40), c(0xde, 0x93, 0x5f),
                c(0x5f, 0x81, 0x9d), c(0x85, 0x67, 0x8f), c(0x5e, 0x8d, 0x87), c(0x70, 0x78, 0x80),
                c(0x37, 0x3b, 0x41), c(0xcc, 0x66, 0x66), c(0xb5, 0xbd, 0x68), c(0xf0, 0xc6, 0x74),
                c(0x81, 0xa2, 0xbe), c(0xb2, 0x94, 0xbb), c(0x8a, 0xbe, 0xb7), c(0xc5, 0xc8, 0xc6),
            ],
            cursor_color: c(0xc5, 0xc8, 0xc6),
            cursor_style: CursorStyle::Block,
            selection_bg: c(0x37, 0x3b, 0x41),
            selection_fg: c(0xc5, 0xc8, 0xc6),
            font_family: "monospace".to_string(),
            font_size: 13.0,
        }
    }
}

/// Apply `key = value` lines from a Ghostty config onto an existing theme.
/// Pure and idempotent; used by both `parse` and `load` (for layering).
pub(crate) fn apply_config(text: &str, theme: &mut Theme) {
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        let key = key.trim();
        let value = unquote(value.trim());
        if value.is_empty() {
            continue;
        }
        match key {
            "background" => set(&mut theme.background, parse_color(value)),
            "foreground" => set(&mut theme.foreground, parse_color(value)),
            "cursor-color" => set(&mut theme.cursor_color, parse_color(value)),
            "selection-background" => set(&mut theme.selection_bg, parse_color(value)),
            "selection-foreground" => set(&mut theme.selection_fg, parse_color(value)),
            "cursor-style" => {
                theme.cursor_style = match value {
                    "block" => CursorStyle::Block,
                    "bar" => CursorStyle::Bar,
                    "underline" => CursorStyle::Underline,
                    // Unknown value: leave the field unchanged, like every other key.
                    _ => continue,
                };
            }
            "font-family" => theme.font_family = value.to_string(),
            "font-size" => {
                if let Ok(size) = value.parse::<f32>() {
                    theme.font_size = size;
                }
            }
            "palette" => {
                if let Some((idx, col)) = value.split_once('=') {
                    if let (Ok(i), Some(c)) = (idx.trim().parse::<usize>(), parse_color(col.trim())) {
                        if i < 16 {
                            theme.palette[i] = c;
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn set(slot: &mut Color, parsed: Option<Color>) {
    if let Some(c) = parsed {
        *slot = c;
    }
}

/// Strip one matching pair of surrounding double or single quotes, if present.
/// Ghostty config values may be quoted to preserve spaces, e.g.
/// `font-family = "MonaspiceKr Nerd Font"`.
fn unquote(value: &str) -> &str {
    let pair = |q: char| value.strip_prefix(q).and_then(|v| v.strip_suffix(q));
    pair('"').or_else(|| pair('\'')).unwrap_or(value)
}

/// Parse `#rrggbb`, `rrggbb`, `#rgb`, or `rgb` into a `Color`.
fn parse_color(s: &str) -> Option<Color> {
    let hex = s.strip_prefix('#').unwrap_or(s);
    // Reject non-ASCII input up front so the byte-index slicing below
    // cannot land mid-character and panic.
    if !hex.is_ascii() {
        return None;
    }
    let bytes = match hex.len() {
        6 => [&hex[0..2], &hex[2..4], &hex[4..6]],
        3 => return parse_color(&format!(
            "{a}{a}{b}{b}{c}{c}",
            a = &hex[0..1], b = &hex[1..2], c = &hex[2..3],
        )),
        _ => return None,
    };
    Some(Color {
        r: u8::from_str_radix(bytes[0], 16).ok()?,
        g: u8::from_str_radix(bytes[1], 16).ok()?,
        b: u8::from_str_radix(bytes[2], 16).ok()?,
    })
}

/// Extract the value of the `theme` key from a Ghostty config, if present.
pub(crate) fn find_theme_key(text: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if key.trim() == "theme" {
                let v = unquote(value.trim());
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// Locate a named Ghostty theme file. Checks the user themes dir first,
/// then the macOS app bundle's resources.
fn named_theme_path(home: &Path, name: &str) -> Option<PathBuf> {
    let candidates = [
        home.join(".config/ghostty/themes").join(name),
        PathBuf::from("/Applications/Ghostty.app/Contents/Resources/ghostty/themes")
            .join(name),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// Load the user's theme: read `~/.config/ghostty/config`, layer the named
/// `theme` (if any) underneath it, and fall back to the built-in default.
pub fn load() -> Theme {
    let mut theme = Theme::default();
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return theme;
    };
    let Ok(main_text) = std::fs::read_to_string(home.join(".config/ghostty/config")) else {
        return theme;
    };
    if let Some(name) = find_theme_key(&main_text) {
        if let Some(path) = named_theme_path(&home, &name) {
            if let Ok(theme_text) = std::fs::read_to_string(path) {
                apply_config(&theme_text, &mut theme); // base layer
            }
        }
    }
    apply_config(&main_text, &mut theme); // main config overrides the named theme
    theme
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Parse config text onto a fresh default theme.
    fn parse(text: &str) -> Theme {
        let mut theme = Theme::default();
        apply_config(text, &mut theme);
        theme
    }

    #[test]
    fn empty_config_yields_default() {
        assert_eq!(parse(""), Theme::default());
    }

    #[test]
    fn parses_background_and_foreground() {
        let t = parse("background = #1d1f21\nforeground = c5c8c6\n");
        assert_eq!(t.background, Color { r: 0x1d, g: 0x1f, b: 0x21 });
        assert_eq!(t.foreground, Color { r: 0xc5, g: 0xc8, b: 0xc6 });
    }

    #[test]
    fn parses_palette_entries() {
        let t = parse("palette = 0=#000000\npalette = 7=#ffffff\n");
        assert_eq!(t.palette[0], Color { r: 0, g: 0, b: 0 });
        assert_eq!(t.palette[7], Color { r: 255, g: 255, b: 255 });
    }

    #[test]
    fn ignores_comments_blanks_and_malformed_lines() {
        let t = parse("# comment\n\nnonsense line\nbackground = #112233\nbad = \n");
        assert_eq!(t.background, Color { r: 0x11, g: 0x22, b: 0x33 });
    }

    #[test]
    fn parses_cursor_style_and_font() {
        let t = parse("cursor-style = bar\nfont-family = JetBrains Mono\nfont-size = 14.5\n");
        assert_eq!(t.cursor_style, CursorStyle::Bar);
        assert_eq!(t.font_family, "JetBrains Mono");
        assert_eq!(t.font_size, 14.5);
    }

    #[test]
    fn accepts_three_digit_hex() {
        let t = parse("background = #abc\n");
        assert_eq!(t.background, Color { r: 0xaa, g: 0xbb, b: 0xcc });
    }

    #[test]
    fn invalid_cursor_style_leaves_field_unchanged() {
        // An unrecognized cursor-style must not override a prior value.
        let t = parse("cursor-style = bar\ncursor-style = bogus\n");
        assert_eq!(t.cursor_style, CursorStyle::Bar);
    }

    #[test]
    fn non_ascii_color_is_rejected_without_panic() {
        // A multi-byte character must not cause a byte-index slicing panic.
        let t = parse("background = #€\n");
        assert_eq!(t.background, Theme::default().background);
    }

    #[test]
    fn finds_theme_key() {
        assert_eq!(find_theme_key("theme = Dracula\n"), Some("Dracula".to_string()));
        assert_eq!(find_theme_key("background = #000\n"), None);
    }

    #[test]
    fn theme_key_is_layered_under_main_config() {
        // The named theme sets background; the main config overrides foreground.
        let mut theme = Theme::default();
        apply_config("background = #aabbcc\nforeground = #111111\n", &mut theme); // theme file
        apply_config("foreground = #222222\n", &mut theme); // main config wins
        assert_eq!(theme.background, Color { r: 0xaa, g: 0xbb, b: 0xcc });
        assert_eq!(theme.foreground, Color { r: 0x22, g: 0x22, b: 0x22 });
    }

    #[test]
    fn strips_surrounding_quotes_from_values() {
        // Ghostty config values are often quoted to preserve spaces.
        let t = parse("font-family = \"MonaspiceKr Nerd Font\"\n");
        assert_eq!(t.font_family, "MonaspiceKr Nerd Font");
        assert_eq!(find_theme_key("theme = \"Ayu\"\n"), Some("Ayu".to_string()));
    }
}
