import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { User, UserRole, UserStatus } from '../src/models/user.entity';
import { Product, ProductStatus } from '../src/models/product.entity';
import { logger } from '../src/config/logger';

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  logger.info('Database connected for seeding');

  const userRepo = AppDataSource.getRepository(User);
  const productRepo = AppDataSource.getRepository(Product);

  // Create admin user
  const existingAdmin = await userRepo.findOne({ where: { email: 'admin@enterprise.com' } });
  if (!existingAdmin) {
    const admin = userRepo.create({
      name: 'Admin User',
      email: 'admin@enterprise.com',
      password: 'Admin@123!', // Will be hashed by BeforeInsert
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    await userRepo.save(admin);
    logger.info('Admin user created: admin@enterprise.com / Admin@123!');
  }

  // Create manager user
  const existingManager = await userRepo.findOne({ where: { email: 'manager@enterprise.com' } });
  if (!existingManager) {
    const manager = userRepo.create({
      name: 'Manager User',
      email: 'manager@enterprise.com',
      password: 'Manager@123!',
      role: UserRole.MANAGER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    await userRepo.save(manager);
    logger.info('Manager user created: manager@enterprise.com / Manager@123!');
  }

  // Create regular user
  const existingUser = await userRepo.findOne({ where: { email: 'user@enterprise.com' } });
  if (!existingUser) {
    const user = userRepo.create({
      name: 'Regular User',
      email: 'user@enterprise.com',
      password: 'User@123!',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    await userRepo.save(user);
    logger.info('Regular user created: user@enterprise.com / User@123!');
  }

  // Create sample products
  const admin = await userRepo.findOne({ where: { email: 'admin@enterprise.com' } });
  if (admin) {
    const productCount = await productRepo.count();
    if (productCount === 0) {
      const products = [
        { name: 'Enterprise Suite Pro', price: 299.99, stock: 100, category: 'Software', status: ProductStatus.ACTIVE },
        { name: 'Developer License', price: 99.99, stock: 500, category: 'Software', status: ProductStatus.ACTIVE },
        { name: 'Team Plan (Annual)', price: 999.99, stock: 50, category: 'Subscription', status: ProductStatus.ACTIVE },
        { name: 'API Access Token', price: 49.99, stock: 1000, category: 'Services', status: ProductStatus.DRAFT },
        { name: 'Priority Support', price: 199.99, stock: 25, category: 'Support', status: ProductStatus.ACTIVE },
      ];

      for (const p of products) {
        await productRepo.save(productRepo.create({ ...p, createdById: admin.id }));
      }
      logger.info(`${products.length} sample products created`);
    }
  }

  await AppDataSource.destroy();
  logger.info('Seeding completed successfully!');
}

seed().catch((error) => {
  logger.error('Seeding failed', { error });
  process.exit(1);
});
