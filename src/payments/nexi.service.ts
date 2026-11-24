import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Order } from '@prisma/client';
import { OrderItemDto } from '../orders/dto/create_order.dto.js';

@Injectable()
export class NexiService {
  private readonly logger = new Logger(NexiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createPayment(order: Order): Promise<{ paymentId: string; hostedPaymentPageUrl: string }> {
    const items = (order.items as unknown as OrderItemDto[]).map((i) => {
      const total = i.quantity * i.unitPrice;
      return {
        reference: i.reference,
        name: i.name,
        quantity: i.quantity,
        unit: 'pcs',
        unitPrice: i.unitPrice,
        taxRate: 0,
        taxAmount: 0,
        netTotalAmount: total,
        grossTotalAmount: total,
      };
    });

    const body = {
      order: {
        items,
        amount: order.amount,
        currency: order.currency,
        reference: `ORDER-${order.id}`,
      },
      checkout: {
        integrationType: 'HostedPaymentPage',
        charge: true,
        returnUrl: `${this.config.getOrThrow('APP_BASE_URL')}/payments/return`,
        termsUrl: 'https://example.com/terms',
      },
      notifications: {
        webhooks: [
          {
            eventName: 'payment.checkout.completed',
            url: `${this.config.getOrThrow('WEBHOOK_BASE_URL')}/payments/webhook`,
            authorization: this.config.getOrThrow('WEBHOOK_TOKEN'),
          },
        ],
      },
    };

    try {
      const res = await firstValueFrom(
        this.http.post(`${this.config.getOrThrow('NEXI_BASE_URL')}/v1/payments`, body, {
          headers: {
            Authorization: this.config.getOrThrow('NEXI_SECRET_KEY'),
            'Content-Type': 'application/json',
          },
        }),
      );
      return res.data;
    } catch (err: any) {
      this.logger.error('Nexi createPayment failed', JSON.stringify(err.response?.data ?? err.message));
      throw new BadGatewayException('Failed to create payment with Nexi');
    }
  }
  async getPayment(paymentId: string) {
  try {
    const res = await firstValueFrom(
      this.http.get(`${this.config.getOrThrow('NEXI_BASE_URL')}/v1/payments/${paymentId}`, {
        headers: { Authorization: this.config.getOrThrow('NEXI_SECRET_KEY') },
      }),
    );
    return res.data;
  } catch (err: any) {
    this.logger.error('Nexi getPayment failed', JSON.stringify(err.response?.data ?? err.message));
    throw new BadGatewayException('Failed to verify payment with Nexi');
  }
}
private buildItems(order: Order) {
  return (order.items as unknown as OrderItemDto[]).map((i) => {
    const total = i.quantity * i.unitPrice;
    return {
      reference: i.reference,
      name: i.name,
      quantity: i.quantity,
      unit: 'pcs',
      unitPrice: i.unitPrice,
      taxRate: 0,
      taxAmount: 0,
      netTotalAmount: total,
      grossTotalAmount: total,
    };
  });
}
async refundCharge(chargeId: string, order: Order) {
  try {
    const res = await firstValueFrom(
      this.http.post(
        `${this.config.getOrThrow('NEXI_BASE_URL')}/v1/charges/${chargeId}/refunds`,
        { amount: order.amount, orderItems: this.buildItems(order) },
        {
          headers: {
            Authorization: this.config.getOrThrow('NEXI_SECRET_KEY'),
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    return res.data;
  } catch (err: any) {
    this.logger.error(
      'Nexi refund failed',
      JSON.stringify(err.response?.data ?? err.message),
    );
    throw new BadGatewayException('Failed to refund payment with Nexi');
  }
}
}