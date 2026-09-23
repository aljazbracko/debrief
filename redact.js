// The entire redaction policy lives here. Add app-specific names or patterns here.
// Redaction is conservative, not a proof of anonymity. Unknown prose/encodings
// cannot be reliably classified. Nothing is hashed or replaced with stable IDs.
export const MASK = '[REDACTED]';
export const POLICY = {
  sensitiveKey: /(?:authorization|cookie|password|passwd|passphrase|secret|token|apikey|accesskey|privatekey|clientkey|credential|session|csrf|xsrf|jwt|signature|(^|_)auth($|_)|^auth$)/i,
  personalKey: /^(?:name|fullname|firstname|lastname|middlename|displayname|username|email|emailaddress|phone|phonenumber|mobile|address|street|streetaddress|postalcode|zipcode|postcode|city|ip|ipaddress|remoteaddr|clientip|forwardedfor|xforwardedfor|ssn|socialsecuritynumber|dob|dateofbirth|birthdate|creditcard|cardnumber|cvv|cvc|iban|latitude|longitude|lat|lng|userid|customerid|accountid|deviceid|advertisingid|passport|nationalid)$/i,
  // Extend with global regular expressions. Replacements never expose matches.
  patterns: [
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
    /\b(?:Bearer|Basic|Digest)\s+[^\s,;"'<>]+/gi,
    /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g,
    /\b(?:gh[pousr]_|github_pat_|xox[baprs]-|sk-)[A-Za-z0-9_-]{8,}\b/g,
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    /(?<![\w:])(?:[a-f0-9]{1,4}:){7}[a-f0-9]{1,4}(?![\w:])|(?<![\w:])(?:[a-f0-9]{1,4}:)*[a-f0-9]{0,4}::(?:[a-f0-9]{1,4}:)*[a-f0-9]{0,4}(?![\w:])/gi,
    /\b\d{3}-\d{2}-\d{4}\b/g,
    /\b(?:user|customer|account|member)[._:-](?:\d+|[a-f0-9]{8}-[a-f0-9-]{27,})\b/gi,
    /\+\d[\d ().-]{7,}\d\b/g,
    /\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
    /\b(?:\d[ -]?){13,19}\b/g,
    /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g,
    // Opaque keys (including base64) and UUIDs; may also hide hashes/trace IDs.
    /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
    /\b(?=[A-Za-z0-9_+/=-]{24,}\b)(?=[A-Za-z0-9_+/=-]*[0-9])[A-Za-z0-9_+/=-]{24,}/g,
    /\b[A-Za-z0-9_+/=-]{40,}\b/g,
  ],
};

const normalized = key => String(key).replace(/[^a-z0-9]/gi, '');
export function isSensitiveKey(key) {
  const k = normalized(key);
  return POLICY.sensitiveKey.test(k) || POLICY.personalKey.test(k);
}
const decode = value => {
  let text = String(value);
  for (let i = 0; i < 3; i++) {
    try { const next = decodeURIComponent(text); if (next === text) break; text = next; } catch { break; }
  }
  return text;
};

export function createRedactor(knownValues = []) {
  const known = [...new Set(knownValues.filter(v => typeof v === 'string' && v.length >= 4)
    .flatMap(v => [v, decode(v)]))].sort((a, b) => b.length - a.length);
  let replacements = 0;
  const mask = () => { replacements++; return MASK; };
  function text(value) {
    let s = decode(value ?? '');
    // Remove entire URL userinfo, even when credentials are short.
    s = s.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, (_, scheme) => scheme + mask() + '@');
    // Covers query strings, form fields, log key=value, JSON-like fragments,
    // header lines, quoted values and XML fields. Structured JSON is handled below.
    const spans = [];
    for (const match of s.matchAll(/([\w.%+-]+)(["']?\s*[:=]\s*)/g)) {
      if (!isSensitiveKey(decode(match[1]))) continue;
      const start = match.index + match[0].length;
      const value = s.slice(start).match(/^("(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|[^\n&,;<>}]+)/);
      if (value) spans.push([start, start + value[0].length]);
    }
    const merged = [];
    for (const span of spans) {
      const previous = merged.at(-1);
      if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1]);
      else merged.push(span);
    }
    for (const [start, end] of merged.reverse()) s = s.slice(0, start) + mask() + s.slice(end);
    s = s.replace(/<([\w:-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g,
      (all, key) => isSensitiveKey(key) ? '<' + key + '>' + mask() + '</' + key + '>' : all);
    for (const pattern of POLICY.patterns) s = s.replace(pattern, mask);
    for (const secret of known) s = s.split(secret).join(MASK);
    return s;
  }
  function value(input, depth = 0) {
    if (depth > 30) return '[OMITTED: nesting limit]';
    if (typeof input === 'string') {
      // Sensitive fields may be hidden inside JSON serialized into a string.
      const trimmed = decode(input).trim();
      if (/^[\[{]/.test(trimmed)) {
        try { return JSON.stringify(value(JSON.parse(trimmed), depth + 1)); } catch { return text(input); }
      }
      return text(input);
    }
    if (Array.isArray(input)) return input.map(item => value(item, depth + 1));
    if (input && typeof input === 'object') {
      const out = Object.create(null);
      for (const [key, v] of Object.entries(input)) out[text(key)] = isSensitiveKey(key) ? mask() : value(v, depth + 1);
      return out;
    }
    return input;
  }
  return { text, value, get count() { return replacements; } };
}

// Seed redaction with observed secret/PII values, so e.g. a token echoed under
// an innocuous field or inside a stack trace is removed as well.
export function collectSensitive(input, result = [], depth = 0, sensitive = false) {
  if (depth > 30 || result.length >= 500) return result;
  if (typeof input === 'string') {
    if (sensitive && input.length >= 4) result.push(input);
    try { collectSensitive(JSON.parse(input), result, depth + 1, sensitive); } catch { /* ordinary text */ }
  } else if (Array.isArray(input)) {
    for (const v of input) collectSensitive(v, result, depth + 1, sensitive);
  } else if (input && typeof input === 'object') {
    // HAR represents headers, cookies and parameters as name/value pairs.
    const pair = typeof input.name === 'string' && Object.hasOwn(input, 'value');
    if (pair && isSensitiveKey(input.name)) collectSensitive(input.value, result, depth + 1, true);
    for (const [k, v] of Object.entries(input)) {
      if (pair && k === 'name') continue;
      collectSensitive(v, result, depth + 1, sensitive || isSensitiveKey(k));
    }
  }
  return result;
}
