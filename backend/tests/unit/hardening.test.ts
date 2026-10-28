import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import type { Request, Response } from 'express';

process.env['UPLOAD_PATH'] = process.env['UPLOAD_PATH'] ?? './uploads';

import { sanitizeBody } from '../../src/middlewares/validation.middleware';
import { escapeHtml, maskEmail } from '../../src/services/email.service';
import { processImage, resolveInsideUploads } from '../../src/services/upload.service';
import { config } from '../../src/config/app.config';

function sanitize(body: unknown): unknown {
  const req = { body } as Request;
  sanitizeBody(req, {} as Response, () => undefined);
  return req.body;
}

describe('global sanitizer', () => {
  it('drops __proto__, constructor and prototype instead of changing the prototype', () => {
    const body = JSON.parse('{"name":"Ana","__proto__":{"isAdmin":true},"nested":{"constructor":{"x":1},"ok":"y"}}');
    const clean = sanitize(body) as Record<string, unknown>;
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
    expect((clean as { isAdmin?: boolean }).isAdmin).toBeUndefined();
    expect(Object.keys(clean)).toEqual(['name', 'nested']);
    expect(clean['nested']).toEqual({ ok: 'y' });
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  it('keeps passwords byte for byte and still cleans other strings', () => {
    const clean = sanitize({ password: ' <b>p4ss</b> ', bio: '<script>x</script>' }) as Record<string, string>;
    expect(clean['password']).toBe(' <b>p4ss</b> ');
    expect(clean['bio']).not.toContain('<script>');
  });
});

describe('email output', () => {
  it('escapes a name that carries a link, so it is shown as text', () => {
    const name = '<a href="https://fake.example">Confirm here</a>';
    expect(escapeHtml(name)).toBe('&lt;a href=&quot;https://fake.example&quot;&gt;Confirm here&lt;/a&gt;');
  });

  it('masks addresses in logs', () => {
    expect(maskEmail('fabricio@example.com')).toBe('f***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('upload paths', () => {
  const base = path.resolve(config.upload.path);

  it('accepts files inside the upload folder', () => {
    expect(resolveInsideUploads(path.join(base, 'a.webp'))).toBe(path.join(base, 'a.webp'));
  });

  it('refuses traversal, absolute paths and a sibling folder with the same prefix', () => {
    for (const bad of [path.join(base, '..', 'etc', 'passwd'), '/etc/passwd', `${base}-evil${path.sep}x.png`, base]) {
      expect(() => resolveInsideUploads(bad)).toThrow('Invalid file path');
    }
  });
});

describe('image processing', () => {
  const base = path.resolve(config.upload.path);
  const write = async (ext: string, data: Buffer) => {
    const file = path.join(base, `${randomUUID()}${ext}`);
    await fs.writeFile(file, data);
    return file;
  };
  const exists = (file: string) => fs.access(file).then(() => true, () => false);

  beforeAll(() => fs.mkdir(base, { recursive: true }));

  it('turns a real image into a resized webp and drops the original', async () => {
    const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#336699' } }).png().toBuffer();
    const input = await write('.png', png);

    const output = await processImage(input, { width: 800 });

    expect(await exists(input)).toBe(false);
    expect((await sharp(await fs.readFile(output)).metadata()).width).toBe(800);
    await fs.unlink(output);
  });

  it('accepts a webp upload, which used to collide with its own output name', async () => {
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).webp().toBuffer();
    const input = await write('.webp', webp);

    const output = await processImage(input);

    expect(output).not.toBe(input);
    expect(await exists(input)).toBe(false);
    expect(await exists(output)).toBe(true);
    await fs.unlink(output);
  });

  it('refuses a file that only claims to be an image and leaves nothing behind', async () => {
    const input = await write('.png', Buffer.from('<html><script>alert(1)</script></html>'));

    await expect(processImage(input)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_IMAGE' });
    expect(await exists(input)).toBe(false);
  });
});
