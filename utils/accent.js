/**
 * Accent-color helpers.
 * Given a user-picked hex color, derive the four palette variants the UI
 * uses: --accent, --accent-lo/md/hi (or --ib-accent + --ib-accent-low/mid).
 *
 * Used by popup (DOM `:root` overrides) and overlay (shadow root container
 * overrides). Content scripts can't import ES modules, so this is also
 * mirrored as a small helper attached to window.__ib.accent in overlay.js
 * via plain JS — keep the math identical.
 */

const DEFAULT_DARK = '#4a90ff';
const DEFAULT_LIGHT = '#0066e0';

export function hexToRgb(hex) {
  if (!hex) return null;
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/**
 * Build the four CSS custom-property values for a given accent hex. Pass
 * the variant to control alpha intensity (dark theme uses slightly heavier
 * alphas than light, matching the existing palette).
 */
export function accentVars(hex, variant = 'dark') {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const alphas = variant === 'light'
    ? { lo: 0.08, md: 0.22, hi: 0.32 }
    : { lo: 0.14, md: 0.28, hi: 0.35 };
  return {
    accent: hex,
    lo: `rgba(${r}, ${g}, ${b}, ${alphas.lo})`,
    md: `rgba(${r}, ${g}, ${b}, ${alphas.md})`,
    hi: `rgba(${r}, ${g}, ${b}, ${alphas.hi})`
  };
}

export function defaultAccent(variant) {
  return variant === 'light' ? DEFAULT_LIGHT : DEFAULT_DARK;
}
