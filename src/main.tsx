import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { GlobalScreenSecurityGuard } from './components/security/GlobalScreenSecurityGuard';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalScreenSecurityGuard>
      <App />
    </GlobalScreenSecurityGuard>
  </StrictMode>,
);
