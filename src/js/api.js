export function createApiClient({ getCurrentUser, getToken, fetchImpl = fetch }) {
  return async function api(url, options = {}) {
    if (!getCurrentUser()) throw new Error('لم يتم تسجيل الدخول.');
    const token = await getToken();
    const response = await fetchImpl(url, {
      method: options.method || 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': 'v5.0',
        'X-Firebase-ID-Token': token
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || String(response.status));
    return text ? JSON.parse(text) : {};
  };
}

export async function publicJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
