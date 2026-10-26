import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import deDE from 'antd/locale/de_DE';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { useIsPhone } from './hooks/useMediaQuery';
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt';
import { antdTheme } from './theme/antdTheme';

const queryClient = new QueryClient();

// Larger controls on phones: the app is used on building sites with gloves and wet fingers.
export function Root() {
  const isPhone = useIsPhone();
  return (
    <ConfigProvider locale={deDE} theme={antdTheme} componentSize={isPhone ? 'large' : 'middle'}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
        <PwaUpdatePrompt />
      </QueryClientProvider>
    </ConfigProvider>
  );
}
