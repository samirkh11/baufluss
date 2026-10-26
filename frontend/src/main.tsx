import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './index.css';
import { Root } from './Root';
import { applyCssVariables } from './theme/cssVariables';

applyCssVariables();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
