import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, BadRequestException, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAccountSchema, UpdateAccountSchema } from '../common/validators/schemas';

@Controller('api/accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async getAccounts(@CurrentUser() user: any) {
    return this.accountsService.getAccounts(user.id);
  }

  @Post()
  async createAccount(@Body() body: any, @CurrentUser() user: any) {
    const parsed = CreateAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.accountsService.createAccount(user.id, parsed.data);
  }

  @Put(':id')
  async updateAccount(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const parsed = UpdateAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.accountsService.updateAccount(user.id, id, parsed.data);
  }

  @Delete(':id')
  async deleteAccount(@Param('id') id: string, @CurrentUser() user: any) {
    return this.accountsService.deleteAccount(user.id, id);
  }

  @Get(':id/history')
  async getAccountHistory(
    @Param('id') id: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @CurrentUser() user: any,
  ) {
    return this.accountsService.getAccountHistory(user.id, id, days);
  }
}
