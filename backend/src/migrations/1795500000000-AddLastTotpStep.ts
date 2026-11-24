import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastTotpStep1795500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD "last_totp_step" integer');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "last_totp_step"');
  }
}
