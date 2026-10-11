import { useEffect, useState } from 'react';

// Reactive CSS media query. The initial value is read synchronously so the first render already
// uses the right layout (no flash of the desktop layout on phones).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// Breakpoints follow Ant Design's: md = 768 px, lg = 992 px.
// Phone: below md. Compact (phone + tablet portrait): below lg, where the sidebar becomes a drawer.
export const useIsPhone = () => useMediaQuery('(max-width: 767.98px)');
export const useIsCompact = () => useMediaQuery('(max-width: 991.98px)');
