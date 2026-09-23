import { createRedactor } from './redact.js';

export const TYPES = [
  ['all', 'All'], ['api', 'Fetch/XHR'], ['fetch', 'Fetch'], ['xhr', 'XHR'],
  ['socket', 'Sockets'], ['document', 'Doc'], ['assets', 'JS/CSS'], ['image', 'Images'], ['other', 'Other'],
];
const redact = createRedactor();
const labelCache = new WeakMap();
export function requestType(entry) {
  const type = String(entry.resourceType || '').toLowerCase();
  const url = entry.har.request?.url || '';
  const mime = entry.har.response?.content?.mimeType || '';
  if (type === 'websocket' || /^wss?:/i.test(url) || entry.har.response?.status === 101) return 'socket';
  if (type === 'fetch' || type === 'xhr') return type;
  if (type === 'document') return 'document';
  if (['script', 'stylesheet'].includes(type)) return 'assets';
  if (type === 'image') return 'image';
  // HAR does not guarantee Chrome's _resourceType. MIME fallback is explicitly
  // an API candidate, never presented as proof that fetch() initiated a request.
  if (type && type !== 'other') return 'other';
  if (/json|graphql/i.test(mime)) return 'api';
  if (/text\/html/i.test(mime)) return 'document';
  if (/javascript|text\/css/i.test(mime)) return 'assets';
  if (/^image\//i.test(mime)) return 'image';
  return 'other';
}
export function requestLabel(entry) {
  const raw = entry.har.request?.url || '';
  const cached = labelCache.get(entry);
  if (cached?.raw === raw) return cached.label;
  let label;
  try {
    const url = new URL(raw);
    label = { name: redact.text(url.pathname + url.search + url.hash), host: redact.text(url.host) };
  } catch { label = { name: redact.text(raw), host: '' }; }
  labelCache.set(entry, { raw, label }); return label;
}
export function matchesFilters(entry, filters = {}) {
  const type = requestType(entry), status = Number(entry.har.response?.status) || 0;
  const { name, host } = requestLabel(entry);
  if (filters.type && filters.type !== 'all') {
    if (filters.type === 'api' ? !['fetch', 'xhr', 'api'].includes(type) : type !== filters.type) return false;
  }
  if (filters.method && filters.method !== 'all' && entry.har.request?.method !== filters.method) return false;
  if (filters.host && filters.host !== 'all' && host !== filters.host) return false;
  if (filters.status === 'failed' && status !== 0 && status < 400) return false;
  if (filters.status === 'network' && status !== 0) return false;
  if (/^[2345]xx$/.test(filters.status || '') && Math.floor(status / 100) !== Number(filters.status[0])) return false;
  const haystack = `${entry.har.request?.method || ''} ${host}${name} ${status} ${type}`.toLowerCase();
  return String(filters.query || '').toLowerCase().split(/\s+/).filter(Boolean).every(term =>
    term.startsWith('-') && term.length > 1 ? !haystack.includes(term.slice(1)) : haystack.includes(term));
}
