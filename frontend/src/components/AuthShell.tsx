import { ReactNode } from 'react';
import { Typography } from 'antd';
import { BrandLogo } from './BrandLogo';
import { APP_DESCRIPTION } from '../config/app';

// Shared frame of the login / registration pages (Figma "Sign In"): brand panel on the left,
// white form card on the right. Below lg the brand panel collapses into a header above the form.
// The Figma stock photo is not used (licence unclear) – the panel shows the brand gradient instead.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mw-auth">
      <aside className="mw-auth-brand">
        <BrandLogo inverse size={22} />
        <p className="mw-auth-claim">{APP_DESCRIPTION}</p>
      </aside>
      <main className="mw-auth-main">
        <div className="mw-auth-card">
          <div className="mw-auth-logo">
            <BrandLogo size={20} />
          </div>
          <Typography.Title level={1} className="mw-auth-title">
            {title}
          </Typography.Title>
          {subtitle && <Typography.Paragraph type="secondary">{subtitle}</Typography.Paragraph>}
          {children}
        </div>
      </main>
    </div>
  );
}
