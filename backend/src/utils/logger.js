const SENSITIVE = /token|secret|authorization|cookie|password|key|content/i;
function redact(obj, depth = 0) {
  if (obj == null || depth > 3) return obj;
  if (typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}
export const logger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: 'info', msg, ...redact(meta) })),
  warn: (msg, meta) => console.warn(JSON.stringify({ level: 'warn', msg, ...redact(meta) })),
  error: (msg, meta) => console.error(JSON.stringify({ level: 'error', msg, ...redact(meta) })),
};
