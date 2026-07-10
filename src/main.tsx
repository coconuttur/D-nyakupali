import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely patch window.fetch to allow overrides (e.g. by extensions/third-party scripts) 
// without throwing "Cannot set property fetch of #<Window> which has only a getter"
try {
  let currentFetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get() {
      return currentFetch;
    },
    set(val) {
      currentFetch = val;
    }
  });
} catch (e) {
  console.warn("Could not redefine window.fetch setter:", e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

