import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from '../src/admin/admin.service';

// Tests for the admin console bridge endpoints (search, client/coach
// finance summaries). They exercise validation, identity-not-linked
// behavior, and the no-fabricated-billing contract.

describe('AdminService — admin console bridge', () => {
  describe('searchUsers', () => {
    it('rejects queries shorter than 2 characters', async () => {
      const prisma = { user: { findMany: jest.fn() } } as any;
      const svc = new AdminService(prisma);
      await expect(svc.searchUsers('a')).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.searchUsers('  ')).rejects.toMatchObject({
        response: { code: 'VALIDATION_ERROR' },
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('returns a normalised result set with has_finance_profile flag', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'u-1',
              email: 'a@example.com',
              name: 'Alpha',
              role: 'student',
              coach_id: 'c-1',
              created_at: new Date('2026-01-01'),
              profile: { id: 'p-1' },
            },
            {
              id: 'u-2',
              email: 'b@example.com',
              name: 'Beta',
              role: 'coach',
              coach_id: null,
              created_at: new Date('2026-01-02'),
              profile: null,
            },
          ]),
        },
      } as any;
      const svc = new AdminService(prisma);
      const out = await svc.searchUsers('al', 25);
      expect(out.count).toBe(2);
      expect(out.results[0]).toMatchObject({
        id: 'u-1',
        has_finance_profile: true,
      });
      expect(out.results[1]).toMatchObject({
        id: 'u-2',
        has_finance_profile: false,
      });
    });

    it('clamps the limit into [1, 100]', async () => {
      const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } } as any;
      const svc = new AdminService(prisma);
      await svc.searchUsers('alex', 9999);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
      await svc.searchUsers('alex', 0);
      expect(prisma.user.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('getClientFinanceSummary', () => {
    it('throws NotFound when the user does not exist', async () => {
      const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
      const svc = new AdminService(prisma);
      await expect(svc.getClientFinanceSummary('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rolls up account totals and returns null billing block', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u-1',
            email: 'a@example.com',
            name: 'Alpha',
            role: 'student',
            coach_id: 'c-1',
            created_at: new Date('2026-01-01'),
            profile: {
              onboarding_complete: true,
              primary_goal: 'debt_freedom',
              goal_timeline_months: 24,
              monthly_income_gross: 8000,
              wealth_velocity_score: 72,
              streak_days: 14,
              last_eod_date: new Date('2026-04-20'),
              current_priority_index: 2,
            },
            accounts: [
              { account_type: 'checking', balance: 1000, is_debt: false },
              { account_type: 'savings', balance: 5000, is_debt: false },
              { account_type: 'investment_brokerage', balance: 10000, is_debt: false },
              { account_type: 'credit_card', balance: 2500, is_debt: true },
            ],
            _count: { eod_submissions: 42 },
          }),
        },
      } as any;
      const svc = new AdminService(prisma);
      const out = await svc.getClientFinanceSummary('u-1');
      expect(out.finance.total_assets).toBe(16000);
      expect(out.finance.total_debt).toBe(2500);
      expect(out.finance.total_cash).toBe(6000);
      expect(out.finance.net_worth).toBe(13500);
      expect(out.finance.active_account_count).toBe(4);
      expect(out.finance.debt_account_count).toBe(1);
      expect(out.activity.eod_submissions_total).toBe(42);
      // Billing must be all-null with the no-fabricate disclaimer.
      expect(out.billing).toMatchObject({
        plan: null,
        status: null,
        last_charge_at: null,
      });
      expect(out.billing.note).toMatch(/Billing not tracked/);
    });
  });

  describe('getClientFinanceSummaryByEmail', () => {
    it('rejects malformed emails', async () => {
      const prisma = { user: { findFirst: jest.fn() } } as any;
      const svc = new AdminService(prisma);
      await expect(svc.getClientFinanceSummaryByEmail('not-an-email')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('raises IDENTITY_NOT_LINKED with a 404 payload when no match', async () => {
      const prisma = {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new AdminService(prisma);
      await expect(
        svc.getClientFinanceSummaryByEmail('ghost@example.com'),
      ).rejects.toMatchObject({
        response: { code: 'IDENTITY_NOT_LINKED' },
      });
    });
  });

  describe('getCoachFinanceSummary', () => {
    it('throws NotFound when the user is not a coach/owner', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u-1',
            email: 'a@example.com',
            name: 'Alpha',
            role: 'student',
            created_at: new Date(),
            coach_profile: null,
          }),
        },
      } as any;
      const svc = new AdminService(prisma);
      await expect(svc.getCoachFinanceSummary('u-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('flags an idle roster and an inactive invite code', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'c-1',
            email: 'c@example.com',
            name: 'Coach Carter',
            role: 'coach',
            created_at: new Date('2025-09-01'),
            coach_profile: {
              invite_code: 'abc123',
              is_active: false,
              capacity: 25,
              display_name: 'Coach C',
            },
          }),
          count: jest
            .fn()
            // total clients
            .mockResolvedValueOnce(8)
            // active 7
            .mockResolvedValueOnce(0)
            // active 30
            .mockResolvedValueOnce(2),
        },
        eODSubmission: { count: jest.fn().mockResolvedValue(11) },
      } as any;
      const svc = new AdminService(prisma);
      const out = await svc.getCoachFinanceSummary('c-1');
      expect(out.coach.invite_code).toBe('abc123');
      expect(out.coach.is_active).toBe(false);
      expect(out.clients).toEqual({
        total: 8,
        active_last_7_days: 0,
        active_last_30_days: 2,
      });
      expect(out.activity.eod_submissions_last_30_days).toBe(11);
      expect(out.account_health.flags).toEqual(
        expect.arrayContaining(['roster_idle_7d', 'invite_code_inactive']),
      );
      expect(out.account_health.flags).not.toContain('no_clients');
      expect(out.billing.note).toMatch(/Billing not tracked/);
    });

    it('flags no_clients when the coach has zero roster', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'c-2',
            email: 'd@example.com',
            name: 'Coach Delta',
            role: 'coach',
            created_at: new Date(),
            coach_profile: {
              invite_code: 'xyz',
              is_active: true,
              capacity: null,
              display_name: null,
            },
          }),
          count: jest
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
        },
        eODSubmission: { count: jest.fn().mockResolvedValue(0) },
      } as any;
      const svc = new AdminService(prisma);
      const out = await svc.getCoachFinanceSummary('c-2');
      expect(out.account_health.flags).toContain('no_clients');
      expect(out.account_health.flags).not.toContain('roster_idle_7d');
      expect(out.account_health.flags).not.toContain('invite_code_inactive');
    });
  });
});
