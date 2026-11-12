import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Loads data from the API and lets the page reload it after a change. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!path) return;
    api<T>(path).then(d => { setData(d); setError(''); }).catch(e => setError(e.message));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, reload: load };
}

/** Message banner state: shows success or error text from an action. */
export function useMessage() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    try { await fn(); if (success) setMsg({ text: success, type: 'success' }); return true; }
    catch (e) { setMsg({ text: (e as Error).message, type: 'error' }); return false; }
  }, []);
  return { msg, setMsg, run };
}
