import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // Determine if account is a debt type
  private isDebtType(type: string): boolean {
    return [
      'credit_card', 'personal_loan', 'student_loan',
      'auto_loan', 'mortgage', 'medical_debt', 'other_debt',
    ].includes(type);
  }

  async getAccounts(userId: string) {
    return this.prisma.financialAccount.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: [{ is_debt: 'asc' }, { balance: 'desc' }],
    });
  }

  async createAccount(
    userId: string,
    data: Omit<Prisma.FinancialAccountUncheckedCreateInput, 'user_id' | 'is_debt'> & {
      is_debt?: boolean;
    },
  ) {
    // Auto-set is_debt based on account_type if not explicitly provided
    const is_debt = data.is_debt !== undefined ? data.is_debt : this.isDebtType(data.account_type);

    const account = await this.prisma.financialAccount.create({
      data: {
        user_id: userId,
        ...data,
        is_debt,
      },
    });

    // Log initial balance
    await this.prisma.accountBalanceLog.create({
      data: {
        account_id: account.id,
        balance: account.balance,
        date: new Date(),
        source: 'onboarding',
      },
    });

    return account;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    data: Prisma.FinancialAccountUncheckedUpdateInput,
  ) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new NotFoundException({ error: 'Account not found', code: 'NOT_FOUND' });
    if (account.user_id !== userId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    return this.prisma.financialAccount.update({
      where: { id: accountId },
      data: { ...data, updated_at: new Date() },
    });
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new NotFoundException({ error: 'Account not found', code: 'NOT_FOUND' });
    if (account.user_id !== userId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    // Soft delete — keep history intact
    await this.prisma.financialAccount.update({
      where: { id: accountId },
      data: { is_active: false },
    });

    return { message: 'Account deactivated' };
  }

  async getAccountHistory(userId: string, accountId: string, days: number = 30) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new NotFoundException({ error: 'Account not found', code: 'NOT_FOUND' });
    if (account.user_id !== userId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await this.prisma.accountBalanceLog.findMany({
      where: {
        account_id: accountId,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    return { account, logs };
  }
}
