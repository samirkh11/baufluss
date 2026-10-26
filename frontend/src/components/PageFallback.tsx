import { Spin } from 'antd';

// Shown while the code of a lazily loaded page is downloaded (route-level code splitting).
export function PageFallback() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
      <Spin size="large" aria-label="Seite wird geladen" />
    </div>
  );
}
