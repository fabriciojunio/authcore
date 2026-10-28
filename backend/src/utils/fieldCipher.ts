import crypto from 'crypto';
import type { ValueTransformer } from 'typeorm';
import { config } from '@config/app.config';

const VERSION = 'v1';
const IV_BYTES = 12;

// ENCRYPTION_KEY é texto; o HKDF tira dele os 32 bytes do AES-256. O "info" separa esta chave de
// qualquer outra que um dia saia do mesmo segredo.
function fieldKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', config.security.encryptionKey, '', 'authcore:field:v1', 32));
}

export function isEncryptedField(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`);
}

/**
 * AES-256-GCM. O contexto (nome da coluna) entra como dado autenticado: o valor de uma coluna
 * copiado para outra não abre.
 */
export function encryptField(plain: string, context: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', fieldKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':');
}

export function decryptField(stored: string, context: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Encrypted field has an unknown format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', fieldKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function encryptedColumn(context: string): ValueTransformer {
  return {
    to: (value?: string | null) => (typeof value === 'string' ? encryptField(value, context) : value),
    from: (value?: string | null) => (typeof value === 'string' ? decryptField(value, context) : value),
  };
}
