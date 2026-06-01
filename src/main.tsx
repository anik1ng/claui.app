import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress the native WKWebView context menu in production. Its "Reload" item
// reloads the webview, which remounts every TerminalView and spawns fresh PTYs
// while the old PtySessions linger in Rust with dead channels — one click drops
// all terminal state. Left enabled in dev so Inspect Element / Reload stay
// available for debugging.
if (import.meta.env.PROD) {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

// No React.StrictMode: claui's effects spawn real OS processes (PTYs running
// `claude`/shell). StrictMode intentionally double-invokes effects in dev,
// which would spawn duplicate child processes.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
