import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initDatabase, requestPersistentStorage } from './db/init';
import { registerSW } from 'virtual:pwa-register';

const root = createRoot(document.getElementById('root')!);

function Fatal({ error }: { error: unknown }) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', color: '#eee', background: '#0a0a0b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Die Datenbank konnte nicht geöffnet werden</h1>
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Bitte prüfe, ob dein Browser lokale Speicherung (IndexedDB) erlaubt – im privaten Modus mancher Browser ist sie deaktiviert.
      </p>
      <pre style={{ marginTop: 16, fontSize: 12, opacity: 0.5, whiteSpace: 'pre-wrap' }}>{String(error)}</pre>
    </div>
  );
}

initDatabase()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    void requestPersistentStorage();
  })
  .catch((e) => {
    console.error(e);
    root.render(<Fatal error={e} />);
  });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true });
}
