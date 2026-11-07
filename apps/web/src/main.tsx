import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './design-tokens.css';

function Starter() {
  const [status, setStatus] = useState('Подключение к API…');
  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    fetch(base + '/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json() as Promise<{ mode: string }>;
      })
      .then((data) => setStatus('API подключён · режим ' + data.mode))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setStatus('Запустите API: python3 scripts/mock_api.py');
      });
    return () => controller.abort();
  }, []);
  return (
    <main style={{ maxWidth: 1000, margin: '12vh auto', padding: 32 }}>
      <p style={{ color: 'var(--accent)', fontWeight: 800 }}>ZAL / СТАРТ РАЗРАБОТКИ</p>
      <h1 style={{ fontSize: 'clamp(40px, 7vw, 88px)', lineHeight: 1.02 }}>
        Билет с видом<br /><span style={{ color: 'var(--accent)' }}>на экран</span>
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 20 }}>
        Каркас готов. Следующий шаг — каталог, схема зала и 3D по docs/prompts/frontend.md.
      </p>
      <p role="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Starter /></StrictMode>);
