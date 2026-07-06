import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global module that provides PrismaService throughout the application.
 *
 * Marked `@Global()` so feature modules can inject PrismaService without
 * importing PrismaModule in each one.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
