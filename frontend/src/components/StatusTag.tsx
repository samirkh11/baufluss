import { ReactNode } from 'react';
import { Tag } from 'antd';
import { toneColors, Tone } from '../theme/tokens';

// Status pill from the Figma design: coloured dot + tinted background. Built on antd Tag, so it
// keeps the `.ant-tag` class (used by the e2e tests). Text colours are the AA-compliant shades.
export function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  const colors = toneColors[tone];
  return (
    <Tag className="mw-status-tag" bordered={false} style={{ color: colors.fg, background: colors.bg }}>
      <span className="mw-status-dot" aria-hidden="true" style={{ background: colors.dot }} />
      {children}
    </Tag>
  );
}
