import { APP_NAME } from '../config/app';

// Word mark + icon. `inverse` = white on the brand gradient (sidebar), otherwise brand blue.
export function BrandLogo({ inverse = false, size = 20 }: { inverse?: boolean; size?: number }) {
  return (
    <span className={`mw-brand${inverse ? ' mw-brand--inverse' : ''}`} style={{ fontSize: size }}>
      <svg className="mw-brand-icon" viewBox="0 0 32 32" width={size * 1.4} height={size * 1.4} aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path d="M10 8v16M10 8h6.5a4 4 0 0 1 0 8H10m0 0h7.5a4 4 0 0 1 0 8H10" fill="none" stroke="var(--mw-brand-icon-fg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="mw-brand-text">{APP_NAME}</span>
    </span>
  );
}
