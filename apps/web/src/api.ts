export async function api<T>(path: string, data?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api${path}`, { method: data === undefined ? 'GET' : method, credentials: 'include', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('Le serveur est injoignable. Vérifiez qu’il est lancé.'); }
  if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Impossible de terminer cette action.');
  return body as T;
}
