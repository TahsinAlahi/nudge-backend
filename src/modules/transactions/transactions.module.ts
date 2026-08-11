import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransfersModule } from '@modules/transfers/transfers.module';
import { TransfersService } from '@modules/transfers/transfers.service';

@Module({
  imports: [TransfersModule],
  providers: [TransactionsService, TransfersService],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
