import ReactDOM from 'react-dom/client';
import App from './App';

// No React.StrictMode: claui's effects spawn real OS processes (PTYs running
// `claude`/shell). StrictMode intentionally double-invokes effects in dev,
// which would spawn duplicate child processes.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
