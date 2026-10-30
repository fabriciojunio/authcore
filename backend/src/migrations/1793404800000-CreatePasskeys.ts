import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasskeys1793404800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "passkeys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "credential_id" varchar(1024) NOT NULL,
        "public_key" bytea NOT NULL,
        "counter" bigint NOT NULL DEFAULT 0,
        "transports" text,
        "name" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_used_at" timestamptz,
        CONSTRAINT "PK_passkeys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_passkeys_credential_id" UNIQUE ("credential_id")
      )`);
    await queryRunner.query('CREATE INDEX "IDX_passkeys_user_id" ON "passkeys" ("user_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "passkeys"');
  }
}
