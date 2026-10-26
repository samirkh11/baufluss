import { ComponentType, lazy } from 'react';

// React.lazy for modules with named exports (all pages export `function XyzPage`).
export function lazyPage<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return lazy(() => load().then((module) => ({ default: module[name] as ComponentType })));
}
