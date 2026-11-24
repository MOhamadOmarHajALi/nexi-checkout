import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from './payments.service.js';
import { ConfigService } from '@nestjs/config';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService,
    private readonly config:ConfigService
  ) {}

  @Post('checkout/:orderId')
  checkout(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.payments.checkout(orderId);
  }

@Get('return')
async paymentReturn(
  @Query('paymentid') paymentidLower?: string,
  @Query('paymentId') paymentIdCamel?: string,
) {
  const paymentId = paymentidLower ?? paymentIdCamel;
  if (!paymentId) throw new BadRequestException('paymentId is required');
  return this.payments.handleReturn(paymentId);
}
  
@Post('webhook')
@HttpCode(200)
async handleWebhook(
  @Headers('authorization') authHeader: string | undefined,
  @Body() payload: any,
) {
  const expectedToken = this.config.getOrThrow<string>('WEBHOOK_TOKEN');
  if (!authHeader || authHeader !== expectedToken) {
    throw new UnauthorizedException('Invalid webhook authorization token');
  }

  const eventId: string | undefined = payload?.id;
  const eventName: string | undefined = payload?.event;
  const paymentId: string | undefined = payload?.data?.paymentId;

  if (!eventId || !paymentId) {
    throw new BadRequestException('Invalid webhook payload');
  }
  if (eventName !== 'payment.checkout.completed') {
    return { received: true, ignored: true };
  }

  return this.payments.handleWebhook(eventId, paymentId);
}
  @Post('refund/:orderId')
  refund(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.payments.refund(orderId);
  }
}