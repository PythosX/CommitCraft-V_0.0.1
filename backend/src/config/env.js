// Reads and validates Worker bindings. Secrets are never logged or returned.
const REQUIRED = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'FRONTEND_URL',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
];

export class ConfigError extends Error {
  constructor(missing) {
    super(`Missing configuration: ${missing.join(', ')}`);
    this.missing = missing;
  }
}

export const LIMITS = {
  maxFilesPerJob: 500,
  maxFileBytes: 25 * 1024 * 1024,
  maxJsonBytes: 256 * 1024,
  maxBlobRequestBytes: 12 * 1024 * 1024,
  maxBlobsPerRequest: 25,
  maxMessageLength: 500,
  maxPathLength: 400,
  commitsPerRequest: 12, // keeps one request under the Worker subrequest limit
  sessionTtlSeconds: 7 * 24 * 3600,
  jobTtlSeconds: 30 * 24 * 3600,
  historyTtlSeconds: 90 * 24 * 3600,
};

export function getConfig(env) {
  const missing = REQUIRED.filter((k) => !env[k] || String(env[k]).startsWith('REPLACE_WITH'));
  if (!env.CC_KV) missing.push('CC_KV (KV binding)');
  if (missing.length) throw new ConfigError(missing);
  const frontendUrl = new URL(env.FRONTEND_URL);
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    callbackUrl: env.GITHUB_CALLBACK_URL,
    frontendUrl: frontendUrl.origin,
    frontendOrigin: frontendUrl.origin,
    sessionSecret: env.SESSION_SECRET,
    encryptionKey: env.ENCRYPTION_KEY,
    secureCookies: frontendUrl.protocol === 'https:',
    kv: env.CC_KV,
    limits: LIMITS,
  };
}
