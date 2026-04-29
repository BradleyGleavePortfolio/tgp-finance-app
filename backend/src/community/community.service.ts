// Community service — UX Psychology Report #5: Contribution Loops
// Feed = anonymized wins synthesized from existing goals/transactions + user-posted wins.
import { Injectable, NotFoundException } from '@nestjs/common';
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
  if (profile?.streak_days >= 7) {
    options.push(`maintained a ${profile.streak_days}-day check-in streak`);
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
  reactions: { fire: number; clap: number };
  myReactions: { fire: boolean; clap: boolean };
}

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /community/feed — last 30 wins (posted + synthesized)
   */
  async getFeed(callerId: string): Promise<WinDto[]> {
    // 1. User-posted wins (public) from the last 60 days
    const postedWins = await this.prisma.communityWin.findMany({
      where: {
        visibility: 'public',
        created_at: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
      include: {
        user: { select: { id: true, name: true } },
        reactions: true,
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
            reactions: { fire: (hash % 12) + 1, clap: (hash % 8) + 1 },
            myReactions: { fire: false, clap: false },
          } satisfies WinDto;
        })
        .filter(Boolean) as WinDto[];
    }

    // Build my reaction set
    const myReactionRows = await this.prisma.winReaction.findMany({
      where: { user_id: callerId },
      select: { win_id: true, kind: true },
    });
    const myReactionMap = new Map<string, Set<string>>();
    for (const r of myReactionRows) {
      if (!myReactionMap.has(r.win_id)) myReactionMap.set(r.win_id, new Set());
      myReactionMap.get(r.win_id)!.add(r.kind);
    }

    const postedDtos: WinDto[] = postedWins.map((w) => {
      const fire = w.reactions.filter((r) => r.kind === 'fire').length;
      const clap = w.reactions.filter((r) => r.kind === 'clap').length;
      const mine = myReactionMap.get(w.id) ?? new Set();
      return {
        id: w.id,
        anonName: anonymiseName(w.user.name),
        action: w.action,
        visibility: w.visibility as 'circle' | 'public',
        createdAt: w.created_at,
        reactions: { fire, clap },
        myReactions: { fire: mine.has('fire'), clap: mine.has('clap') },
      };
    });

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
   * POST /community/wins/:id/react  body: { kind }
   */
  async react(callerId: string, winId: string, kind: 'fire' | 'clap'): Promise<{ ok: boolean }> {
    // Synthetic wins (id starts with "synth_") — no-op toggle accepted
    if (winId.startsWith('synth_')) return { ok: true };

    const win = await this.prisma.communityWin.findUnique({ where: { id: winId } });
    if (!win) throw new NotFoundException('Win not found');

    const existing = await this.prisma.winReaction.findUnique({
      where: { win_id_user_id_kind: { win_id: winId, user_id: callerId, kind } },
    });

    if (existing) {
      // Toggle off
      await this.prisma.winReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.winReaction.create({
        data: { win_id: winId, user_id: callerId, kind },
      });
    }
    return { ok: true };
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
      include: { user: { select: { id: true, name: true } }, reactions: true },
    });
    return {
      id: win.id,
      anonName: anonymiseName(win.user.name),
      action: win.action,
      visibility: win.visibility as 'circle' | 'public',
      createdAt: win.created_at,
      reactions: { fire: 0, clap: 0 },
      myReactions: { fire: false, clap: false },
    };
  }

  /**
   * GET /users/me/badges — earned + locked badges
   */
  async getBadges(userId: string) {
    const [user, profile, accounts, milestoneUnlocks, reactionCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { community_wins: { take: 1 } } }),
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
      this.prisma.milestoneUnlock.findMany({ where: { user_id: userId } }),
      this.prisma.winReaction.count({ where: { user_id: userId } }),
    ]);

    const isFoundingMember = await this._isFoundingMember(userId);

    // Badge icons are intentionally empty strings — the mobile app renders
    // a neutral glyph based on `earned` rather than a coloured emoji glyph,
    // per `mobile/DESIGN.md` §2 (no emoji in product surfaces).
    const BADGE_DEFS = [
      {
        key: 'first_goal',
        title: 'First goal',
        description: 'You opened your first financial account or goal.',
        icon: '',
        check: () => accounts.length > 0,
      },
      {
        key: 'encourager',
        title: 'Encourager',
        description: 'You acknowledged ten community wins.',
        icon: '',
        check: () => reactionCount >= 10,
      },
      {
        key: 'goal_slayer',
        title: 'First milestone',
        description: 'You reached your first net-worth or debt milestone.',
        icon: '',
        check: () =>
          milestoneUnlocks.some(
            (m) =>
              m.milestone_key === 'first_debt_paid' ||
              m.milestone_key === 'nw_positive' ||
              m.milestone_key === 'cash_1k',
          ),
      },
      {
        key: 'founding_saver',
        title: 'Founding member',
        description: 'A founding member with at least one open goal.',
        icon: '',
        check: () => isFoundingMember && accounts.length > 0,
      },
    ];

    return BADGE_DEFS.map((b) => ({
      key: b.key,
      title: b.title,
      description: b.description,
      icon: b.icon,
      earned: b.check(),
    }));
  }

  private async _isFoundingMember(userId: string): Promise<boolean> {
    const totalUsers = await this.prisma.user.count();
    const rank = await this.prisma.user.count({
      where: { created_at: { lte: (await this.prisma.user.findUnique({ where: { id: userId }, select: { created_at: true } }))!.created_at } },
    });
    return rank <= Math.min(1000, Math.ceil(totalUsers * 0.1));
  }
}
