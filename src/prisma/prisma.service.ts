import { PrismaClient } from '@/generated/prisma/client';
import { ApiConfigService } from '@/modules/api-config/api-config.service';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

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
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
