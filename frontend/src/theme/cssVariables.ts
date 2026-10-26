import { color, font, layout, radius, shadow, space } from './tokens';

// Exposes the tokens as CSS custom properties (--mw-*) so plain CSS (index.css) and inline
// styles can use them without importing TypeScript.
export function applyCssVariables(root: HTMLElement = document.documentElement) {
  const vars: Record<string, string> = {
    '--mw-color-brand': color.brand,
    '--mw-color-brand-active': color.brandActive,
    '--mw-color-brand-subtle': color.brandSubtle,
    '--mw-color-text': color.text,
    '--mw-color-text-secondary': color.textSecondary,
    '--mw-color-text-muted': color.textMuted,
    '--mw-color-surface': color.surface,
    '--mw-color-background': color.background,
    '--mw-color-border': color.border,
    '--mw-color-sidebar-from': color.sidebarFrom,
    '--mw-color-sidebar-to': color.sidebarTo,
    '--mw-font-family': font.family,
    '--mw-radius-sm': `${radius.sm}px`,
    '--mw-radius-md': `${radius.md}px`,
    '--mw-radius-lg': `${radius.lg}px`,
    '--mw-shadow-card': shadow.card,
    '--mw-shadow-raised': shadow.raised,
    '--mw-space-md': `${space.md}px`,
    '--mw-bottom-nav-height': `${layout.bottomNavHeight}px`,
    '--mw-touch-target': `${layout.touchTarget}px`,
  };
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}
