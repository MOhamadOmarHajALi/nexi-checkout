import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { NexiService } from './nexi.service.js';

@Module({
  imports: [HttpModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, NexiService],
})
export class PaymentsModule {}