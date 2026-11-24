// Frontend configuration. No secrets live here: the browser never sees GitHub tokens.
export const CONFIG = {
  // '' = same origin (recommended: Vercel rewrites /api/* to the Worker, so cookies are first-party).
  // Set to a full URL only if the Worker is on a sibling subdomain of your site.
  API_BASE: '',
  GITHUB_URL: 'https://github.com/PythosX/CommitCraft',
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  WARN_FILE_BYTES: 5 * 1024 * 1024,
  MAX_FILES: 500,
  MAX_PREVIEW_BYTES: 200 * 1024,
  BLOB_BATCH_FILES: 20,
  BLOB_BATCH_BYTES: 6 * 1024 * 1024, // raw bytes per upload request
};
