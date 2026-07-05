import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import 'reflect-metadata';
import { ConsoleLogger, ValidationPipe, VersioningType } from '@nestjs/common';
import { GlobalExceptionFilter } from '@/common/filter/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: 'Nudge',
      // json: true,
      // colors: true,
      // compact: false,
    }),
  });

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false, // TODO: remove this or whitelist true because after stripping there won't be any errors
    })
  );
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
