import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
export function handleError(err, headers) {
  if (!err.status && !err.code) logger.error('unhandled', { message: err.message });
  return errorResponse(err, headers);
}
