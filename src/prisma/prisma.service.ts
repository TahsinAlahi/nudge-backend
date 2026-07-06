import { PrismaClient } from '@/generated/prisma/client';
import { ApiConfigService } from '@/modules/api-config/api-config.service';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Wraps PrismaClient with lifecycle hooks and the PrismaPg driver adapter.
 *
 * Connects to PostgreSQL on module init and disconnects on module destroy
 * so the application does not leak database connections.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(apiConfigService: ApiConfigService) {
    const adapter = new PrismaPg({
      connectionString: apiConfigService.dbUrl,
    });

    super({
      adapter,
    });
  }

  /**
   * Lifecycle hook called after the module is initialized.
   * Establishes the database connection pool.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Lifecycle hook called before the module is destroyed.
   * Gracefully closes all database connections.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
