import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prima.service.js';
import { CreateOrderDto } from './dto/create_order.dto.js';

@Injectable()
export class OrdersService {

    constructor(private readonly prisma: PrismaService) {

    }
    create(dto:CreateOrderDto){
        const amount = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
        return this.prisma.order.create({
            data:{
                items:dto.items as any,
                amount,
                currency:'SEK'
            }
        })
    }
      async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }
}
