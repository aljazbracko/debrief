// Fictional publication fixtures only. Never replace these with real captures.
const start = Date.parse('2026-09-23T10:30:00.000Z');
export const snapshot = { time: start + 200, url: 'https://app.example.test/orders',
  auth: { localStorage: [{ key: 'access_token', value: 'demo-storage-secret' }], sessionStorage: [], cookies: [], notes: [] },
  pusher: [{ state: 'connected', channels: [{ channel: 'private-orders', subscribed: true, pending: false }], note: 'Exposed instance; no frames captured.' }],
  note: 'Synthetic top-frame sample; never collected from a real application.' };
export const errors = [{ time: start + 220, kind: 'console.error', message: 'Order save failed: validation_error' }];
export const entries = [
  ['GET', '/api/session', 200, 82, { authenticated: true }, 'fetch'],
  ['GET', '/api/catalog?limit=20', 200, 126, { count: 20 }, 'fetch'],
  ['POST', '/api/orders', 422, 184, { error: 'validation_error', message: 'Quantity must be greater than zero.', fields: { quantity: ['Minimum value is 1'] }, email: 'demo@example.test' }, 'fetch'],
  ['GET', '/api/orders?status=open', 200, 96, { orders: [], count: 0 }, 'xhr'],
  ['POST', '/pusher/auth', 200, 47, { auth: 'demo-pusher-secret' }, 'xhr'],
  ['GET', '/api/notifications', 200, 63, { unread: 2 }, 'fetch'],
].map(([method, path, status, time, response, resourceType], index) => ({
  id: index + 1, receivedAt: start + 300 + index * 10, snapshot, resourceType,
  body: JSON.stringify(response), bodyState: 'ready', note: 'Synthetic documentation fixture.',
  har: { startedDateTime: new Date(start).toISOString(), time,
    timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 1, wait: time - 5, receive: 4 },
    request: { method, url: 'https://api.example.test' + path, httpVersion: 'HTTP/2',
      headers: [{ name: 'Accept', value: 'application/json' }, { name: 'Authorization', value: 'Bearer demo-request-secret' }],
      ...(method === 'POST' ? { postData: { mimeType: 'application/json', text: JSON.stringify({ product: 'notebook', quantity: 0 }) } } : {}) },
    response: { status, statusText: status === 422 ? 'Unprocessable Content' : 'OK', httpVersion: 'HTTP/2',
      headers: [{ name: 'Content-Type', value: 'application/json' }], content: { mimeType: 'application/json', size: JSON.stringify(response).length } },
  },
}));
