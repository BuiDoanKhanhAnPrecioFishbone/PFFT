import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Debug: Show immediate proof that the script is executing
const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML = '<div style="padding:20px;color:red;">ERROR: #root not found</div>';
  throw new Error('Root element not found');
}

// Show a loading indicator before React mounts (proves script execution)
root.innerHTML = '<div style="padding:20px;font-family:sans-serif;color:#666;">Loading React...</div>';

try {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (err) {
  root.innerHTML = '<div style="padding:20px;color:red;font-family:monospace;">React mount error: ' + (err as Error).message + '</div>';
  throw err;
}
