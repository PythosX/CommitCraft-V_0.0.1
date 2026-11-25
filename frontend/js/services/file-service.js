import { files } from '../core/state-manager.js';
import { buildRules, evaluate, sensitiveReason, tooLarge } from '../utils/file-utils.js';
import { CONFIG } from '../config/app-config.js';
import { bytes } from '../utils/format-utils.js';

// Applies ignore rules to stored records. Restored files stay included; size-limit exclusions are permanent.
export function applyRules(records, { custom, gitignoreText, useGitignore }) {
  const rules = buildRules({ custom, gitignoreText: useGitignore ? gitignoreText : '' });
  for (const r of records) {
    r.warning = null;
    if (tooLarge(r.size)) { r.state = 'excluded'; r.reason = `Larger than ${bytes(CONFIG.MAX_FILE_BYTES)} (V1 limit)`; r.hard = true; continue; }
    const hit = evaluate(r.path, rules);
    if (r.restored) { r.state = r.state === 'deselected' ? 'deselected' : 'selected'; }
    else if (hit.ignored) { r.state = 'excluded'; r.reason = hit.reason; }
    else if (r.state === 'excluded') { r.state = 'selected'; r.reason = null; }
    const s = sensitiveReason(r.path);
    if (s) r.warning = s;
    else if (r.size > CONFIG.WARN_FILE_BYTES) r.warning = `Large file (${bytes(r.size)})`;
  }
  return records;
}
export const saveRecords = (records) => files.putMany(records.map(({ blob, ...r }) => ({ ...r, blob })));
export const loadRecords = () => files.all();
export async function gitignoreTextOf(records) {
  const g = records.find((r) => r.path === '.gitignore');
  return g ? g.blob.text() : '';
}
