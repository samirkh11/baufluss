import { useEffect, useState } from 'react';

// navigator.onLine is only a hint (true does not guarantee the API is reachable), but "false"
// is reliable enough to warn that changes cannot be saved right now.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
