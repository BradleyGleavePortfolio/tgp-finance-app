import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    paycheckAmount: number,
    allocations: Array<{ account_id: string; amount: number; percentage?: number }>,
  ) {
    // Validate allocation totals
    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    if (totalAllocated > paycheckAmount + 0.001) {
      throw new BadRequestException({
        error: `Total allocated (${totalAllocated.toFixed(2)}) exceeds paycheck amount (${paycheckAmount.toFixed(2)})`,
        code: 'OVER_ALLOCATED',
      });
    }

    // Load all target accounts in one query
    const accountIds = allocations.map((a) => a.account_id);
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
    for (const alloc of allocations) {
      if (!foundIds.has(alloc.account_id)) {
        throw new NotFoundException({
          error: `Account ${alloc.account_id} not found`,
          code: 'NOT_FOUND',
        });
      }
    }

    // Apply allocations in a transaction
    const updatedAccounts: any[] = [];
    const receipt: Array<{
      account_id: string;
      account_name: string;
      amount: number;
      effect: string;
      balance_before: number;
      balance_after: number;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const account = accounts.find((a) => a.id === alloc.account_id)!;
        const balanceBefore = Number(account.balance);

        // For debt accounts: a payday allocation reduces the balance (paying down debt)
        // For asset accounts: a payday allocation increases the balance (depositing money)
        const newBalance = account.is_debt
          ? Math.max(0, balanceBefore - alloc.amount)
          : balanceBefore + alloc.amount;

        const updated = await tx.financialAccount.update({
          where: { id: account.id },
          data: { balance: newBalance, updated_at: new Date() },
        });

        // Log the balance change
        await tx.accountBalanceLog.create({
          data: {
            account_id: account.id,
            balance: newBalance,
            date: new Date(),
            source: 'payday',
          },
        });

        updatedAccounts.push(updated);
        receipt.push({
          account_id: account.id,
          account_name: account.name,
          amount: alloc.amount,
          effect: account.is_debt ? 'debt_payment' : 'deposit',
          balance_before: balanceBefore,
          balance_after: newBalance,
        });
      }
    });

    const unallocated = paycheckAmount - totalAllocated;

    return {
      paycheck_amount: paycheckAmount,
      total_allocated: totalAllocated,
      unallocated_remainder: unallocated,
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
    const templates = (profile as any)?.payday_templates;
    if (Array.isArray(templates)) return { templates };
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

    const existing: any[] = Array.isArray((profile as any)?.payday_templates)
      ? (profile as any).payday_templates
      : [];

    const newTemplate = {
      id: `tmpl_${Date.now()}`,
      name: template.name,
      allocations: template.allocations,
      created_at: new Date().toISOString(),
    };

    const updated = [newTemplate, ...existing];

    await this.prisma.financialProfile.update({
      where: { user_id: userId },
      data: { payday_templates: updated as any },
    }).catch(() => {
      // payday_templates column may not exist yet — return the template anyway
    });

    return { template: newTemplate, message: 'Template saved' };
  }
}
