import { badRequest, tooLarge } from './response.js';
export async function readJson(request, maxBytes) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw tooLarge();
  const text = await request.text();
  if (text.length > maxBytes) throw tooLarge();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw badRequest('Request body is not valid JSON.'); }
}
