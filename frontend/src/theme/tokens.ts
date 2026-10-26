/**
 * Design tokens – single source of truth for the Baufluss UI.
 *
 * Three layers:
 *   1. `palette`  – primitive values taken from the Figma file "Claude testing"
 *                   (plus a few derived shades where Figma colours fail WCAG AA).
 *   2. `color`    – semantic roles used by the app (text, surface, border, brand …).
 *   3. component tokens live in `antdTheme.ts` (antd ThemeConfig) and are exposed
 *      as CSS custom properties via `cssVariables.ts`.
 *
 * Keep this file free of browser / React imports – it is also imported by
 * `vite.config.ts` (PWA manifest colours).
 */

export const palette = {
  white: '#FFFFFF',
  // Brand blue (Figma: Primary/500, 50, bg, 200)
  blue50: '#E7F3FF',
  blueBg: '#F2F7FD',
  blue200: '#92C6FF',
  blue500: '#116CE3',
  // Derived – darker shades for hover/pressed and the sidebar gradient end
  blue600: '#0E5DC4',
  blue700: '#0B4FA6',
  // Navy (Figma: Navy/50–900)
  navy50: '#E7E8EA',
  navy100: '#B5B8BE',
  navy200: '#91969E',
  navy400: '#404856',
  navy500: '#101A2C',
  navy900: '#070B12',
  // Text greys (Figma: Text/200–600)
  text200: '#949AA5',
  text300: '#646C7C',
  text400: '#454F62',
  text500: '#17233B',
  text600: '#152036',
  // Backgrounds
  bg: '#FAFAFA',
  // Status (Figma: Success/Error/Warning) + derived AA-compliant text shades
  success50: '#EAF6EE',
  success500: '#2BA156',
  success700: '#1E7B42',
  warning50: '#FCF8EB',
  warning300: '#E8D078',
  warning500: '#D4A72C',
  warning700: '#8A6A12',
  error50: '#FFF2F2',
  error400: '#FF7575',
  error500: '#FF5252',
  error700: '#C62828',
} as const;

export const color = {
  brand: palette.blue500,
  brandHover: palette.blue600,
  brandActive: palette.blue700,
  brandSubtle: palette.blueBg,
  brandSubtleStrong: palette.blue50,

  text: palette.text500,
  textStrong: palette.text600,
  textSecondary: palette.text400,
  /** Placeholders & meta text – AA on white (5.28:1). */
  textMuted: palette.text300,
  /** Disabled only – fails AA for normal text. */
  textDisabled: palette.text200,
  textOnBrand: palette.white,

  surface: palette.white,
  background: palette.bg,
  border: palette.navy50,
  borderStrong: palette.navy100,

  success: palette.success500,
  warning: palette.warning500,
  error: palette.error500,
  info: palette.blue500,

  sidebarFrom: palette.blue500,
  sidebarTo: palette.blue700,
  adminHeader: palette.navy500,
} as const;

/** Semantic tones used by StatusTag and banners. */
export type Tone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export const toneColors: Record<Tone, { fg: string; bg: string; dot: string }> = {
  info: { fg: palette.blue500, bg: palette.blueBg, dot: palette.blue500 },
  success: { fg: palette.success700, bg: palette.success50, dot: palette.success500 },
  warning: { fg: palette.warning700, bg: palette.warning50, dot: palette.warning500 },
  error: { fg: palette.error700, bg: palette.error50, dot: palette.error500 },
  neutral: { fg: palette.text400, bg: palette.navy50, dot: palette.navy200 },
};

export const font = {
  family:
    "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  size: { meta: 12, body: 14, section: 16, page: 22 },
  lineHeight: { meta: 16, body: 20, section: 24, page: 28 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 2, md: 4, lg: 8, pill: 999 } as const;

export const shadow = {
  card: '0 5px 10px rgba(0, 0, 0, 0.05)',
  raised: '0 4px 5px rgba(0, 0, 0, 0.1)',
} as const;

/** Keep in sync with hooks/useMediaQuery.ts (useIsPhone < md, useIsCompact < lg). */
export const breakpoint = { md: 768, lg: 992 } as const;

export const layout = {
  sidebarWidth: 248,
  drawerWidth: 280,
  headerHeight: 64,
  bottomNavHeight: 60,
  contentPadding: { phone: 12, desktop: 16 },
  touchTarget: 44,
} as const;

export const zIndex = { header: 10, bottomNav: 20 } as const;

export const motion = { fast: '120ms', base: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' } as const;
