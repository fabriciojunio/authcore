import path from 'path';
import type { Request, Response } from 'express';

process.env['UPLOAD_PATH'] = process.env['UPLOAD_PATH'] ?? './uploads';

import { sanitizeBody } from '../../src/middlewares/validation.middleware';
import { escapeHtml, maskEmail } from '../../src/services/email.service';
import { resolveInsideUploads } from '../../src/services/upload.service';
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
