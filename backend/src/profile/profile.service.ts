import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

// Profile updates accept the same fields as Prisma's update input plus the
// monthly/annual income mirroring the service applies inline. user_id is
// taken from the authenticated request and must not arrive on the body.
// Income values arrive as Prisma.Decimal because the Zod schema produces
// Decimal via MoneyAmountPositive.
export type ProfileUpdate = Omit<
  Prisma.FinancialProfileUncheckedUpdateInput,
  'user_id' | 'monthly_income_gross' | 'annual_income_gross'
> & {
  monthly_income_gross?: Prisma.Decimal;
  annual_income_gross?: Prisma.Decimal;
};

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: userId },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });

    if (!profile) {
      // Auto-create empty profile if it doesn't exist
      return this.prisma.financialProfile.create({
        data: { user_id: userId },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });
    }

    return profile;
  }

  async updateProfile(userId: string, data: ProfileUpdate) {
    // Compute annual from monthly if only monthly provided.
    if (data.monthly_income_gross && !data.annual_income_gross) {
      data.annual_income_gross = data.monthly_income_gross.mul(12);
    }

    // Compute monthly from annual if only annual provided. Round to two
    // decimal places to match the DECIMAL(14,2) column.
    if (data.annual_income_gross && !data.monthly_income_gross) {
      data.monthly_income_gross = data.annual_income_gross.div(12).toDecimalPlaces(2);
    }

    const profile = await this.prisma.financialProfile.upsert({
      where: { user_id: userId },
      update: { ...data, updated_at: new Date() },
      create: {
        user_id: userId,
        ...(data as Omit<Prisma.FinancialProfileUncheckedCreateInput, 'user_id'>),
      },
    });

    return profile;
  }

  async computeAndUpdateTotals(userId: string) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { user_id: userId, is_active: true },
    });

    // a.balance is Prisma.Decimal after the money-field migration; collapse to
    // Number via toN for safe arithmetic (DECIMAL(14,2) fits in Number precision).
    const total_assets = accounts
      .filter((a) => !a.is_debt)
      .reduce((sum, a) => sum + toN(a.balance), 0);

    const total_debt = accounts
      .filter((a) => a.is_debt)
      .reduce((sum, a) => sum + toN(a.balance), 0);

    const total_cash = accounts
      .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
      .reduce((sum, a) => sum + toN(a.balance), 0);

    const net_worth_snapshot = total_assets - total_debt;

    await this.prisma.financialProfile.upsert({
      where: { user_id: userId },
      update: { total_assets, total_debt, total_cash, net_worth_snapshot },
      create: { user_id: userId, total_assets, total_debt, total_cash, net_worth_snapshot },
    });

    return { total_assets, total_debt, total_cash, net_worth_snapshot };
  }
}
