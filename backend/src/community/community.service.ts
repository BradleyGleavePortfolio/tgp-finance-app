// Community service — UX Psychology Report #5: Contribution Loops
// Feed = anonymized wins synthesized from existing goals/transactions + user-posted wins.
//
// Doctrine: no streaks, no reactions, no badges in the data model. The feed
// is read-only social proof; users post wins, but no per-user tally surface.
import { Injectable } from '@nestjs/common';
import { FinancialAccount, FinancialProfile, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

// Anonymise name: "Bradley Gleave" → "Bradley G."
function anonymiseName(name: string): string {
  if (!name) return 'A Member';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  const lastInitial = rest[rest.length - 1]?.[0]?.toUpperCase() ?? '';
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

// Synthesize canned wins from a user's financial profile & accounts
function synthesizeWin(
  user: Pick<User, 'id'>,
  profile: FinancialProfile | null,
  accounts: FinancialAccount[],
): string | null {
  const debtAccounts = accounts.filter((a) => a.is_debt && toN(a.balance) > 0);
  const savingsAccounts = accounts.filter(
    (a) => !a.is_debt && ['checking', 'savings'].includes(a.account_type),
  );
  const totalDebt = debtAccounts.reduce((s, a) => s + toN(a.balance), 0);
  const totalCash = savingsAccounts.reduce((s, a) => s + toN(a.balance), 0);

  // Pick a deterministic message based on user id hash
  const hash = user.id.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const options: string[] = [];

  if (totalDebt > 0) {
    options.push(`paid off ${Math.min(Math.round((1 - totalDebt / (totalDebt + totalCash)) * 100), 35)}% of their debt this month`);
    options.push(`made an extra payment on their ${debtAccounts[0]?.name || 'loan'}`);
  }
  if (totalCash > 500) {
    options.push(`hit a new savings milestone of $${Math.round(totalCash / 100) * 100}`);
  }
  if (profile?.primary_goal) {
    options.push(`is making progress on their goal: ${profile.primary_goal.toLowerCase()}`);
  }
  if (accounts.length > 0) {
    options.push('completed their first financial goal setup');
    options.push('logged all accounts for the first time');
  }

  if (options.length === 0) return null;
  return options[hash % options.length];
}

export interface WinDto {
  id: string;
  anonName: string;
  action: string;
  visibility: 'circle' | 'public';
  createdAt: Date;
}

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /community/feed — last 30 wins (posted + synthesized)
   */
  async getFeed(_callerId: string): Promise<WinDto[]> {
    // 1. User-posted wins (public) from the last 60 days
    const postedWins = await this.prisma.communityWin.findMany({
      where: {
        visibility: 'public',
        created_at: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 30,
    });

    // 2. Synthesize wins from user data if posted feed is sparse
    let synthesized: WinDto[] = [];
    if (postedWins.length < 10) {
      const users = await this.prisma.user.findMany({
        where: { role: 'student' },
        include: {
          profile: true,
          accounts: { where: { is_active: true } },
        },
        take: 20,
        orderBy: { created_at: 'desc' },
      });

      synthesized = users
        .map((u) => {
          const win = synthesizeWin(u, u.profile, u.accounts);
          if (!win) return null;
          // Deterministic fake created_at spread over last 30 days
          const hash = u.id.split('').reduce((h: number, c: string) => h + c.charCodeAt(0), 0);
          const daysAgo = hash % 30;
          return {
            id: `synth_${u.id}`,
            anonName: anonymiseName(u.name),
            action: win,
            visibility: 'public' as const,
            createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          } satisfies WinDto;
        })
        .filter(Boolean) as WinDto[];
    }

    const postedDtos: WinDto[] = postedWins.map((w) => ({
      id: w.id,
      anonName: anonymiseName(w.user.name),
      action: w.action,
      visibility: w.visibility as 'circle' | 'public',
      createdAt: w.created_at,
    }));

    // Merge, dedupe by id, sort by date, cap at 30
    const all = [...postedDtos, ...synthesized];
    const seen = new Set<string>();
    const unique = all.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
    unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return unique.slice(0, 30);
  }

  /**
   * POST /community/wins  body: { action, visibility }
   */
  async postWin(
    callerId: string,
    action: string,
    visibility: 'circle' | 'public',
  ): Promise<WinDto> {
    const win = await this.prisma.communityWin.create({
      data: { user_id: callerId, action, visibility },
      include: { user: { select: { id: true, name: true } } },
    });
    return {
      id: win.id,
      anonName: anonymiseName(win.user.name),
      action: win.action,
      visibility: win.visibility as 'circle' | 'public',
      createdAt: win.created_at,
    };
  }
}
