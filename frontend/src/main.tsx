import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import deDE from 'antd/locale/de_DE';
import { App } from './App';
import { useIsPhone } from './hooks/useMediaQuery';
import './index.css';
import { AuthProvider } from './auth/AuthContext';

const queryClient = new QueryClient();

// Larger controls on phones: the app is used on building sites with gloves and wet fingers.
function Root() {
  const isPhone = useIsPhone();
  return (
    <ConfigProvider locale={deDE} componentSize={isPhone ? 'large' : 'middle'}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
