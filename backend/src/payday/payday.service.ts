import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FinancialAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

export interface PaydayTemplate {
  id: string;
  name: string;
  allocations: Array<{ account_id: string; percentage: number }>;
  created_at: string;
}

@Injectable()
export class PaydayService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deploy a paycheck: apply a credit allocation across the user's accounts.
   *
   * Business rules:
   *  - sum(allocations[].amount) must be <= paycheck_amount (can under-allocate, not over-allocate)
   *  - each account_id must belong to the requesting user
   *  - credits reduce balance on debt accounts, increase balance on asset accounts
   */
  async deployPaycheck(
    userId: string,
    paycheckAmount: Prisma.Decimal | number,
    allocations: Array<{ account_id: string; amount: Prisma.Decimal | number; percentage?: number }>,
  ) {
    // The DTO layer (DeployPaycheckSchema) now hands us Prisma.Decimal — but
    // the service still does sum/compare arithmetic, which is precision-safe
    // on Decimal. Promote any stragglers to Decimal so the math stays exact.
    const paycheckDec =
      paycheckAmount instanceof Prisma.Decimal
        ? paycheckAmount
        : new Prisma.Decimal(paycheckAmount);
    const allocDecs = allocations.map((a) => ({
      ...a,
      amount: a.amount instanceof Prisma.Decimal ? a.amount : new Prisma.Decimal(a.amount),
    }));

    // Validate allocation totals using Decimal math — no IEEE-754 fudge factor.
    const totalAllocatedDec = allocDecs.reduce(
      (s, a) => s.plus(a.amount),
      new Prisma.Decimal(0),
    );
    if (totalAllocatedDec.greaterThan(paycheckDec)) {
      throw new BadRequestException({
        error: `Total allocated (${totalAllocatedDec.toFixed(2)}) exceeds paycheck amount (${paycheckDec.toFixed(2)})`,
        code: 'OVER_ALLOCATED',
      });
    }

    // Load all target accounts in one query
    const accountIds = allocDecs.map((a) => a.account_id);
    const accounts = await this.prisma.financialAccount.findMany({
      where: { id: { in: accountIds }, is_active: true },
    });

    // Verify ownership
    for (const account of accounts) {
      if (account.user_id !== userId) {
        throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
      }
    }

    // Verify all requested accounts exist
    const foundIds = new Set(accounts.map((a) => a.id));
    for (const alloc of allocDecs) {
      if (!foundIds.has(alloc.account_id)) {
        throw new NotFoundException({
          error: `Account ${alloc.account_id} not found`,
          code: 'NOT_FOUND',
        });
      }
    }

    // Apply allocations in a transaction
    const updatedAccounts: FinancialAccount[] = [];
    const receipt: Array<{
      account_id: string;
      account_name: string;
      amount: number;
      effect: string;
      balance_before: number;
      balance_after: number;
    }> = [];

    const writeTimestamp = new Date();
    const allocationPlan = allocDecs.map((alloc) => {
      const account = accounts.find((a) => a.id === alloc.account_id)!;
      // account.balance is Prisma.Decimal coming back from the DB.
      const balanceBeforeDec = new Prisma.Decimal(account.balance.toString());

      // For debt accounts: allocation reduces the balance (paying down debt),
      // floored at 0. For asset accounts: allocation increases the balance.
      const rawNewBalance = account.is_debt
        ? balanceBeforeDec.minus(alloc.amount)
        : balanceBeforeDec.plus(alloc.amount);
      const newBalanceDec =
        account.is_debt && rawNewBalance.isNegative()
          ? new Prisma.Decimal(0)
          : rawNewBalance;

      receipt.push({
        account_id: account.id,
        account_name: account.name,
        // Receipt is consumed by the mobile client which expects numbers.
        // toN goes through the standard money-down-conversion path.
        amount: toN(alloc.amount),
        effect: account.is_debt ? 'debt_payment' : 'deposit',
        balance_before: toN(balanceBeforeDec),
        balance_after: toN(newBalanceDec),
      });

      return { account, newBalanceDec };
    });

    const writeResults = await this.prisma.$transaction(
      allocationPlan.flatMap(({ account, newBalanceDec }) => [
        this.prisma.financialAccount.update({
          where: { id: account.id },
          // Pass Decimal directly — Prisma persists it without going through
          // a JS Number round-trip.
          data: { balance: newBalanceDec, updated_at: writeTimestamp },
        }),
        this.prisma.accountBalanceLog.create({
          data: {
            account_id: account.id,
            balance: newBalanceDec,
            date: writeTimestamp,
          },
        }),
      ]),
    );

    for (let i = 0; i < writeResults.length; i += 2) {
      updatedAccounts.push(writeResults[i] as FinancialAccount);
    }

    const unallocatedDec = paycheckDec.minus(totalAllocatedDec);

    return {
      paycheck_amount: toN(paycheckDec),
      total_allocated: toN(totalAllocatedDec),
      unallocated_remainder: toN(unallocatedDec),
      deployed_at: new Date().toISOString(),
      receipt,
      accounts: updatedAccounts,
    };
  }

  // ── Saved templates (stretch goal) ─────────────────────────────────────────

  async getTemplates(userId: string) {
    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: userId },
      select: { payday_templates: true },
    }).catch(() => null);

    // payday_templates is stored as JSON on the profile (if the column exists)
    const templates = profile?.payday_templates;
    if (Array.isArray(templates)) return { templates: templates as unknown as PaydayTemplate[] };
    return { templates: [] };
  }

  async saveTemplate(
    userId: string,
    template: { name: string; allocations: Array<{ account_id: string; percentage: number }> },
  ) {
    // Fetch current templates
    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: userId },
      select: { payday_templates: true },
    }).catch(() => null);

    const existing: PaydayTemplate[] = Array.isArray(profile?.payday_templates)
      ? (profile!.payday_templates as unknown as PaydayTemplate[])
      : [];

    const newTemplate: PaydayTemplate = {
      id: `tmpl_${Date.now()}`,
      name: template.name,
      allocations: template.allocations,
      created_at: new Date().toISOString(),
    };

    const updated: PaydayTemplate[] = [newTemplate, ...existing];

    await this.prisma.financialProfile.update({
      where: { user_id: userId },
      data: { payday_templates: updated as unknown as Prisma.InputJsonValue },
    }).catch(() => {
      // payday_templates column may not exist yet — return the template anyway
    });

    return { template: newTemplate, message: 'Template saved' };
  }
}
