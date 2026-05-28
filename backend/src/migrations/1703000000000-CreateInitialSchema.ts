import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1703000000000 implements MigrationInterface {
  name = 'CreateInitialSchema1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Users table
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('admin', 'manager', 'user')
    `);

    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM ('active', 'inactive', 'suspended', 'pending_verification')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "name"                    VARCHAR(100)  NOT NULL,
        "email"                   VARCHAR(255)  NOT NULL,
        "password"                VARCHAR(255)  NOT NULL,
        "role"                    "users_role_enum"   NOT NULL DEFAULT 'user',
        "status"                  "users_status_enum" NOT NULL DEFAULT 'pending_verification',
        "avatar_url"              VARCHAR(500),
        "phone"                   VARCHAR(20),
        "two_factor_enabled"      BOOLEAN NOT NULL DEFAULT false,
        "two_factor_secret"       VARCHAR(255),
        "email_verified_at"       TIMESTAMP,
        "last_login_at"           TIMESTAMP,
        "failed_login_attempts"   INTEGER NOT NULL DEFAULT 0,
        "locked_until"            TIMESTAMP,
        "refresh_token_hash"      VARCHAR(255),
        "password_reset_token"    VARCHAR(255),
        "password_reset_expires"  TIMESTAMP,
        "created_at"              TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_status" ON "users" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_role" ON "users" ("role")
    `);

    // Products table
    await queryRunner.query(`
      CREATE TYPE "products_status_enum" AS ENUM ('active', 'inactive', 'draft')
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "name"         VARCHAR(200) NOT NULL,
        "description"  TEXT,
        "price"        DECIMAL(10,2) NOT NULL,
        "stock"        INTEGER NOT NULL DEFAULT 0,
        "sku"          VARCHAR(100),
        "category"     VARCHAR(100),
        "image_url"    VARCHAR(500),
        "status"       "products_status_enum" NOT NULL DEFAULT 'draft',
        "created_by"   UUID NOT NULL REFERENCES "users"("id"),
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_name" ON "products" ("name")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_status" ON "products" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_category" ON "products" ("category")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_created_by" ON "products" ("created_by")
    `);

    // Audit logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "user_id"     UUID,
        "action"      VARCHAR(100) NOT NULL,
        "table_name"  VARCHAR(100),
        "record_id"   UUID,
        "old_values"  JSONB,
        "new_values"  JSONB,
        "ip_address"  INET,
        "user_agent"  TEXT,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_user_id"    ON "audit_logs" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_action"     ON "audit_logs" ("action")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "products_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
