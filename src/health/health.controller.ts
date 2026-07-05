import { Public } from '@/common/decorators/public.decorator';
import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @HttpCode(200)
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
