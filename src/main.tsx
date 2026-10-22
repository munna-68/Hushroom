import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';

const root = document.getElementById('root')!;
// Dev-only character gallery and animation viewer; the whole branch is dropped from production builds.
if (import.meta.env.DEV && location.pathname === '/dev/characters') {
  import('./dev/gallery').then((m) => m.mountGallery(root));
} else if (import.meta.env.DEV && location.pathname === '/dev/anim') {
  import('./dev/anim').then((m) => m.mountAnim(root));
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
