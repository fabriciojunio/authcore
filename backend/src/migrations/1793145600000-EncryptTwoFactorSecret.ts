import { MigrationInterface, QueryRunner } from 'typeorm';
import { decryptField, encryptField, isEncryptedField } from '../utils/fieldCipher';

const CONTEXT = 'users.two_factor_secret';
const SELECT_SECRETS =
  'SELECT "id", "two_factor_secret" AS "secret" FROM "users" WHERE "two_factor_secret" IS NOT NULL';

type SecretRow = { id: string; secret: string };

// Segredos TOTP gravados antes da cifra na coluna. Precisa da mesma ENCRYPTION_KEY da aplicação.
export class EncryptTwoFactorSecret1793145600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(SELECT_SECRETS)) as SecretRow[];
    for (const row of rows.filter((r) => !isEncryptedField(r.secret))) {
      await queryRunner.query('UPDATE "users" SET "two_factor_secret" = $1 WHERE "id" = $2', [
        encryptField(row.secret, CONTEXT),
        row.id,
      ]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(SELECT_SECRETS)) as SecretRow[];
    for (const row of rows.filter((r) => isEncryptedField(r.secret))) {
      await queryRunner.query('UPDATE "users" SET "two_factor_secret" = $1 WHERE "id" = $2', [
        decryptField(row.secret, CONTEXT),
        row.id,
      ]);
    }
  }
}
