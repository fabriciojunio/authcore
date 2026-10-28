import { decryptField, encryptField, encryptedColumn, isEncryptedField } from '../../src/utils/fieldCipher';

const CONTEXT = 'users.two_factor_secret';
const SECRET = 'JBSWY3DPEHPK3PXP';

describe('fieldCipher', () => {
  it('opens what it sealed', () => {
    const stored = encryptField(SECRET, CONTEXT);

    expect(isEncryptedField(stored)).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(decryptField(stored, CONTEXT)).toBe(SECRET);
  });

  it('uses a fresh IV, so the same secret never repeats in the table', () => {
    expect(encryptField(SECRET, CONTEXT)).not.toBe(encryptField(SECRET, CONTEXT));
  });

  it('fits the 255-character column with room to spare', () => {
    expect(encryptField('A'.repeat(64), CONTEXT).length).toBeLessThan(255);
  });

  it('refuses a value that was changed in the database', () => {
    const [version, iv, tag, data] = encryptField(SECRET, CONTEXT).split(':');
    const flipped = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);

    expect(() => decryptField([version, iv, tag, flipped].join(':'), CONTEXT)).toThrow();
  });

  it('refuses a value copied from another column', () => {
    const stored = encryptField(SECRET, 'users.other_column');

    expect(() => decryptField(stored, CONTEXT)).toThrow();
  });

  it('refuses plain text instead of reading it as a secret', () => {
    expect(isEncryptedField(SECRET)).toBe(false);
    expect(() => decryptField(SECRET, CONTEXT)).toThrow('unknown format');
  });

  it('lets null and undefined through the column transformer untouched', () => {
    const column = encryptedColumn(CONTEXT);

    expect(column.to(null)).toBeNull();
    expect(column.from(undefined)).toBeUndefined();
    expect(column.from(column.to(SECRET))).toBe(SECRET);
  });
});
