import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NexiService } from './nexi.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prima.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly orders: OrdersService,
    private readonly nexi: NexiService,
    private readonly prisma: PrismaService,
  ) {}

  async checkout(orderId: number) {
    const order = await this.orders.findOne(orderId);

    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order is already ${order.status}`);
    }

    const { paymentId, hostedPaymentPageUrl } = await this.nexi.createPayment(order);

   await this.prisma.$transaction([
  this.prisma.order.update({
    where: { id: order.id },
    data: { paymentId },
  }),
  this.prisma.transaction.create({
    data: {
      orderId: order.id,
      paymentId,
      amount: order.amount,
      currency: order.currency,
    },
  }),
]);

    return { paymentId, hostedPaymentPageUrl };
  }
async handleReturn(paymentId: string) {
  const order = await this.prisma.order.findUnique({ where: { paymentId } });
  if (!order) throw new NotFoundException('No order found for this payment');

  if (order.status === 'REFUNDED') {
    return { orderId: order.id, status: order.status };
  }

  const data = await this.nexi.getPayment(paymentId);
  const chargedAmount = data?.payment?.summary?.chargedAmount ?? 0;
  const charge = data?.payment?.charges?.[0];

  if (chargedAmount >= order.amount) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    if (order.status === 'PENDING') {
      ops.push(
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        }),
      );
    }

    ops.push(
      this.prisma.transaction.updateMany({
        where: { paymentId },
        data: {
          status: 'PAID',
          chargeId: charge?.chargeId,
          rawResponse: {
            summary: data.payment.summary,
            charges: data.payment.charges,
          },
        },
      }),
    );

    await this.prisma.$transaction(ops);
    return { orderId: order.id, status: 'PAID' };
  }

  return { orderId: order.id, status: order.status };
}
async handleWebhook(eventId: string, paymentId: string) {
  // 1) سجّل الإشعار، وإن كان مسجلاً من قبل فهو مكرر
  try {
    await this.prisma.webhookEvent.create({ data: { id: eventId, paymentId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
     
      return { received: true, duplicate: true };
    }
    throw e;
  }

  // 2) عالجه، وإن فشلت المعالجة امسح التسجيل ليُقبل الإرسال المعاد
  try {
    await this.handleReturn(paymentId);
  } catch (e) {
    await this.prisma.webhookEvent
      .delete({ where: { id: eventId } })
      .catch(() => undefined);
    throw e;
  }

  return { received: true };
}
async refund(orderId: number) {
  const order = await this.orders.findOne(orderId);

  if (order.status !== 'PAID') {
    throw new BadRequestException(
      `Only PAID orders can be refunded (current: ${order.status})`,
    );
  }

  const tx = await this.prisma.transaction.findFirst({
    where: { orderId, status: 'PAID' },
  });
  if (!tx?.chargeId) {
    throw new BadRequestException('No charge found for this order');
  }

  await this.nexi.refundCharge(tx.chargeId, order);

  await this.prisma.$transaction([
    this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'REFUNDED' },
    }),
    this.prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'REFUNDED' },
    }),
  ]);

  return { orderId: order.id, status: 'REFUNDED' };
}
}