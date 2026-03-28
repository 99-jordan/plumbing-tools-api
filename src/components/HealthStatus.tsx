'use client';

import { useCallback, useEffect, useState } from 'react';

type State = 'loading' | 'ok' | 'error';

export function HealthStatus() {
  const [state, setState] = useState<State>('loading');
  const [detail, setDetail] = useState<string>('');

  const ping = useCallback(async () => {
    setState('loading');
    setDetail('');
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; service?: string };
      if (res.ok && data.ok) {
        setState('ok');
        setDetail(data.service ?? 'ok');
      } else {
        setState('error');
        setDetail(`${res.status}`);
      }
    } catch {
      setState('error');
      setDetail('network');
    }
  }, []);

  useEffect(() => {
    void ping();
  }, [ping]);

  return (
    <div className="status-row">
      <span
        className={`status-dot ${state === 'ok' ? 'ok' : ''} ${state === 'error' ? 'err' : ''}`}
        aria-hidden
      />
      <span>
        {state === 'loading' && 'Checking /api/health…'}
        {state === 'ok' && (
          <>
            API reachable <span style={{ color: 'var(--muted)' }}>({detail})</span>
          </>
        )}
        {state === 'error' && (
          <>
            Health check failed <span style={{ color: 'var(--muted)' }}>({detail})</span>
          </>
        )}
      </span>
      <button type="button" className="refresh" onClick={() => void ping()}>
        Refresh
      </button>
    </div>
  );
}
