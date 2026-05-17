import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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

    // Pre-generate the account id so the account row and its initial
    // balance log can be written atomically in one batch transaction.
    const accountId = randomUUID();
    const { id: _discardClientId, ...accountInput } = data;
    const accountData = {
      id: accountId,
      user_id: userId,
      ...accountInput,
      is_debt,
    };
    const logData = {
      account_id: accountId,
      balance: accountData.balance,
      date: new Date(),
      source: 'onboarding' as const,
    };

    const [account] = await this.prisma.$transaction([
      this.prisma.financialAccount.create({ data: accountData }),
      this.prisma.accountBalanceLog.create({ data: logData }),
    ]);

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
    const safeDays = Math.min(Math.max(Math.trunc(days || 30), 1), 365);

    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new NotFoundException({ error: 'Account not found', code: 'NOT_FOUND' });
    if (account.user_id !== userId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    const since = new Date();
    since.setDate(since.getDate() - safeDays);

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
