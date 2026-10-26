import { useEffect } from 'react';
import { Button, notification } from 'antd';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_KEY = 'pwa-update';
// Check for a new deployment once per hour while the app stays open (e.g. on a tablet on site).
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// Update strategy "prompt": a new version is downloaded in the background but only activated
// when the user confirms, so nobody loses a half-filled form because the page reloads.
export function PwaUpdatePrompt() {
  const [api, contextHolder] = notification.useNotification();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(() => registration.update().catch(() => undefined), UPDATE_CHECK_MS);
      }
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    api.info({
      key: UPDATE_KEY,
      message: 'Neue Version verfügbar',
      description: 'Speichern Sie offene Eingaben und laden Sie dann die neue Version.',
      duration: 0,
      placement: 'bottomRight',
      actions: (
        <Button type="primary" onClick={() => updateServiceWorker(true)}>
          Jetzt aktualisieren
        </Button>
      ),
    });
  }, [needRefresh, api, updateServiceWorker]);

  return contextHolder;
}
