import { BadRequestException, ConflictException } from '@nestjs/common';
import { EODService } from '../src/eod/eod.service';

describe('EODService.submitEOD — input validation', () => {
  const dto = {
    submission_date: '2026-04-23',
    account_snapshots: [{ account_id: 'acc-1', balance: 100 }],
  };

  it('rejects with ConflictException when a submission already exists for the date', async () => {
    // Round 2 wrapped the write path in prisma.$transaction — the duplicate
    // check now runs inside the callback against the tx client. Mock
    // $transaction to invoke its callback with the same prisma stub as tx.
    const prisma: any = {
      eODSubmission: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
      financialAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', is_debt: false, account_type: 'checking' }]) },
    };
    prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma));

    const svc = new EODService(prisma);
    await expect(svc.submitEOD('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
    // Must not proceed to create once duplicate is detected
    expect(prisma.eODSubmission.create).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestException when any snapshot account is not owned by user or inactive', async () => {
    const prisma: any = {
      eODSubmission: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      financialAccount: { findMany: jest.fn().mockResolvedValue([]) },
      accountBalanceLog: { create: jest.fn() },
      financialProfile: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma));

    const svc = new EODService(prisma);
    await expect(svc.submitEOD('user-1', dto)).rejects.toBeInstanceOf(BadRequestException);
    // Must not write the submission when the account ownership check fails
    expect(prisma.eODSubmission.create).not.toHaveBeenCalled();
    expect(prisma.accountBalanceLog.create).not.toHaveBeenCalled();
  });
});
