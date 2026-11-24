import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from "class-validator";





export class OrderItemDto {
    @IsNotEmpty()
    @IsString()
    reference: string;

    @IsString()
    @IsNotEmpty()

    name: string;

    @IsInt()
    @Min(1)
    quantity: number;

    @IsInt()
    @Min(1)

    unitPrice: number;
}

export class CreateOrderDto {
    @IsArray() @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];

}