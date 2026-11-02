/** Verify Shopmonkey v3 Standard Webhook signatures before any queue/write. */
import { createHmac, timingSafeEqual } from 'node:crypto';

const base64Signature = /^[A-Za-z0-9+/]{43}=$/;

export function verifyShopmonkeyWebhook({ headers, rawBody, secrets, nowSeconds = Math.floor(Date.now()/1000), maxAgeSeconds = 300 }) {
  if (!headers || typeof headers.get !== 'function') throw new TypeError('Headers required');
  if (!Buffer.isBuffer(rawBody)) throw new TypeError('Unmodified raw request body Buffer required');
  if (rawBody.length > 1024 * 1024) throw new Error('Webhook too large');
  if (!Array.isArray(secrets) || !secrets.length || secrets.some(s=>typeof s !== 'string' || s.length < 16))
    throw new Error('Configured webhook secret required');
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !/^[a-zA-Z0-9_:-]{1,128}$/.test(id) || !timestamp || !/^\d{10}$/.test(timestamp) || !signatureHeader)
    throw new Error('Missing or invalid Shopmonkey signature headers');
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 30 || maxAgeSeconds > 900 || Math.abs(nowSeconds - sentAt) > maxAgeSeconds)
    throw new Error('Webhook timestamp outside accepted window');
  const supplied = signatureHeader.split(/\s+/).filter(Boolean)
    .filter(s => s.startsWith('v1,')).map(s => s.slice(3)).filter(s => base64Signature.test(s));
  if (!supplied.length) throw new Error('Webhook signature invalid');
  const signable = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), rawBody]);
  let valid = false;
  for (const key of secrets) {
    const expected = createHmac('sha256', key).update(signable).digest();
    for (const b64 of supplied) {
      const candidate = Buffer.from(b64, 'base64');
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) valid = true;
    }
  }
  if (!valid) throw new Error('Webhook signature invalid');
  return Object.freeze({ deliveryId: id, sentAt, verified: true });
}
