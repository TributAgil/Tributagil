import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// ---- Sentry (rastreamento de erros) --------------------------------------
// Carrega o loader oficial do Sentry SÓ se VITE_SENTRY_LOADER_SRC estiver
// definida no build. Feito aqui (e não como <script> inline no index.html)
// para não precisar de 'unsafe-inline' na CSP.
const sentrySrc = import.meta.env.VITE_SENTRY_LOADER_SRC;
if (typeof sentrySrc === 'string' && sentrySrc.startsWith('http')) {
  window.sentryOnLoad = () => {
    try {
      window.Sentry.init({
        environment:
          window.location.hostname === 'tributagil.online' ? 'production' : 'preview',
        // Plano free: 5k erros/mês (folgado), mas só 50 replays e cota de traces.
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0, // não grava sessões aleatórias
        replaysOnErrorSampleRate: 0.5, // grava a sessão em ~metade dos erros
      });
    } catch {
      /* SDK indisponível — ignora */
    }
  };
  const s = document.createElement('script');
  s.src = sentrySrc;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('[main] Elemento #root não encontrado no index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
