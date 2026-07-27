import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { TransactionType } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedCategory = {
  name: string;
  type: TransactionType;
  icon: string;
};

const categories: SeedCategory[] = [
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔' },
  { name: 'Transportation', type: 'EXPENSE', icon: '🚗' },
  { name: 'Shopping', type: 'EXPENSE', icon: '🛒' },
  { name: 'Entertainment', type: 'EXPENSE', icon: '🎬' },
  { name: 'Salary', type: 'INCOME', icon: '💰' },
];

async function main() {
  const result = await prisma.category.createMany({
    data: categories.map((category) => ({
      name: category.name,
      type: category.type,
      icon: category.icon,
      userId: null,
    })),
    skipDuplicates: true,
  });

  console.log(`Seeded ${result.count} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
