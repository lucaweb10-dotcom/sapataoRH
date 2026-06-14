/**
 * Picks a readable foreground color (white or near-black) for text/icons placed
 * on a solid background `hex`. Uses the WCAG relative-luminance formula with a
 * threshold tuned for the funnel stage palette: mid greens/orange resolve to
 * white, while light yellow/gray resolve to dark text. Malformed input falls
 * back to dark text.
 */
export function contrastText(hex: string): "#ffffff" | "#20251f" {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#20251f";
  const int = parseInt(m[1], 16);
  const channel = (shift: number): number => {
    const v = ((int >> shift) & 0xff) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.34 ? "#20251f" : "#ffffff";
}
