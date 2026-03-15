/**
 * TGP Finance — Seed Script
 * Creates demo coach, demo student, accounts, 30 days of EOD data, and sample scenarios.
 * Run: cd backend && npx ts-node ../scripts/seed.ts  (from backend dir)
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  console.log('🌱 Starting TGP Finance seed...\n');

  // ============================================================
  // 1. Create Demo Coach
  // ============================================================
  const coachSupabaseId = 'demo-coach-supabase-id-000001';
  const existingCoach = await prisma.user.findUnique({ where: { email: 'coach@tgp-finance.demo' } });

  let coach = existingCoach;
  if (!coach) {
    coach = await prisma.user.create({
      data: {
        supabase_id: coachSupabaseId,
        email: 'coach@tgp-finance.demo',
        name: 'Demo Coach',
        role: 'coach',
      },
    });
    console.log('✅ Created demo coach:', coach.email);
  } else {
    console.log('ℹ️  Coach already exists:', coach.email);
  }

  // ============================================================
  // 2. Create Demo Student
  // ============================================================
  const studentSupabaseId = 'demo-student-supabase-id-000002';
  const existingStudent = await prisma.user.findUnique({ where: { email: 'student@tgp-finance.demo' } });

  let student = existingStudent;
  if (!student) {
    student = await prisma.user.create({
      data: {
        supabase_id: studentSupabaseId,
        email: 'student@tgp-finance.demo',
        name: 'Alex Chen',
        role: 'student',
        coach_id: coach.id,
      },
    });
    console.log('✅ Created demo student:', student.email);
  } else {
    console.log('ℹ️  Student already exists:', student.email);
    // Update coach_id if missing
    if (!student.coach_id) {
      student = await prisma.user.update({
        where: { id: student.id },
        data: { coach_id: coach.id },
      });
    }
  }

  // ============================================================
  // 3. Create Student's Financial Profile
  // ============================================================
  const existingProfile = await prisma.financialProfile.findUnique({ where: { user_id: student.id } });

  let profile = existingProfile;
  if (!profile) {
    profile = await prisma.financialProfile.create({
      data: {
        user_id: student.id,
        monthly_income_gross: 5500,
        annual_income_gross: 66000,
        primary_goal: 'Get out of debt',
        goal_timeline_months: 18,
        dream_lifestyle_cost_mo: 8000,
        dream_description: 'Work remotely from Lisbon, Portugal. $8k/mo, no debt, fully invested, laptop lifestyle. Travel 4x/year.',
        future_self_letter: 'Hey Alex — it\'s day 90. You\'ve been doing the daily check-in every single day. You crushed the high-APR debt and have $3k in savings. The streak is real. Don\'t stop now. The compound effect is just starting.',
        city: 'Austin',
        state: 'TX',
        country: 'United States',
        risk_tolerance: 'moderate',
        motivation_style: 'big_picture',
        is_self_employed: false,
        has_business: false,
        current_priority_index: 1, // Pay off high-APR debt
        streak_days: 30,
        onboarding_complete: true,
        filing_status: 'single',
        net_worth_snapshot: -30513, // Calculated below
        total_assets: 3187, // 847 + 2340
        total_debt: 34700, // 4200 + 8500 + 22000
        total_cash: 3187,
        wealth_velocity_score: 42,
        last_eod_date: new Date(),
      },
    });
    console.log('✅ Created student financial profile');
  } else {
    console.log('ℹ️  Student profile already exists');
  }

  // ============================================================
  // 4. Create Student's Financial Accounts
  // ============================================================
  const existingAccounts = await prisma.financialAccount.findMany({ where: { user_id: student.id } });

  let accounts: any[] = existingAccounts;
  if (existingAccounts.length === 0) {
    const accountsData = [
      {
        user_id: student.id,
        name: 'Chase Checking',
        account_type: 'checking',
        institution: 'Chase Bank',
        balance: 847,
        is_debt: false,
        currency: 'USD',
        notes: 'Primary checking account',
      },
      {
        user_id: student.id,
        name: 'Ally Savings',
        account_type: 'savings',
        institution: 'Ally Bank',
        balance: 2340,
        is_debt: false,
        currency: 'USD',
        notes: 'High-yield savings 4.5% APY',
      },
      {
        user_id: student.id,
        name: 'Chase Sapphire Reserve',
        account_type: 'credit_card',
        institution: 'Chase Bank',
        balance: 4200,
        is_debt: true,
        apr_percent: 26.99,
        is_secured: false,
        minimum_payment: 126,
        currency: 'USD',
        notes: 'Travel rewards card — balance must go to $0',
      },
      {
        user_id: student.id,
        name: 'Car Loan (Honda)',
        account_type: 'auto_loan',
        institution: 'Honda Financial',
        balance: 8500,
        is_debt: true,
        apr_percent: 7.4,
        is_secured: true,
        minimum_payment: 385,
        currency: 'USD',
        notes: '2022 Honda Civic',
      },
      {
        user_id: student.id,
        name: 'Federal Student Loan',
        account_type: 'student_loan',
        institution: 'Federal Student Aid',
        balance: 22000,
        is_debt: true,
        apr_percent: 5.5,
        is_secured: false,
        minimum_payment: 230,
        currency: 'USD',
        notes: 'Income-based repayment eligible',
      },
    ];

    accounts = await Promise.all(
      accountsData.map((a) => prisma.financialAccount.create({ data: a })),
    );

    console.log(`✅ Created ${accounts.length} financial accounts`);

    // Create onboarding balance logs
    for (const account of accounts) {
      await prisma.accountBalanceLog.create({
        data: {
          account_id: account.id,
          balance: account.balance,
          date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
          source: 'onboarding',
        },
      });
    }
    console.log('✅ Created onboarding balance logs');
  } else {
    console.log(`ℹ️  ${existingAccounts.length} accounts already exist`);
  }

  // ============================================================
  // 5. Create 30 Days of Realistic EOD Submissions
  // ============================================================
  const existingEODs = await prisma.eODSubmission.findMany({ where: { user_id: student.id } });

  if (existingEODs.length === 0) {
    console.log('📊 Creating 30 days of EOD submissions...');

    const checkingAccount = accounts.find((a) => a.name === 'Chase Checking') || accounts[0];
    const savingsAccount = accounts.find((a) => a.name === 'Ally Savings') || accounts[1];
    const creditCard = accounts.find((a) => a.name.includes('Sapphire')) || accounts[2];
    const carLoan = accounts.find((a) => a.name.includes('Car')) || accounts[3];
    const studentLoan = accounts.find((a) => a.name.includes('Student')) || accounts[4];

    // Starting balances 30 days ago
    let checkingBalance = 1240;
    let savingsBalance = 1800;
    let creditBalance = 4680;
    let carBalance = 8885;
    let studentBalance = 22230;

    const insights = [
      'Your debt-to-income ratio improved today. Keep the momentum.',
      'You\'re on a 3-day streak. Daily check-ins compound into big results.',
      'Credit card balance dropping — the avalanche is working.',
      'Net worth increased by $47 today. Every dollar counts.',
      'You saved $35 vs yesterday. That\'s the habit forming.',
      'Consistent tracking = consistent progress. Well done.',
      'Your savings rate this week is above your monthly average.',
      'Car loan is 7.4% — focus extra cash on the credit card first.',
      'Streak is alive. Don\'t break it tonight.',
      'You\'re $120 closer to your emergency fund goal.',
    ];

    for (let i = 30; i >= 1; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      date.setHours(0, 0, 0, 0);

      // Simulate realistic daily fluctuations
      checkingBalance += Math.random() > 0.6 ? -Math.random() * 200 : Math.random() * 150;
      checkingBalance = Math.max(200, Math.min(2500, checkingBalance));

      savingsBalance += Math.random() > 0.7 ? 50 : 0; // Occasional savings deposits
      savingsBalance = Math.max(1500, savingsBalance);

      creditBalance = Math.max(creditBalance - 150 + (Math.random() > 0.8 ? Math.random() * 80 : 0), 0);
      carBalance = Math.max(carBalance - 385 / 30, 0);
      studentBalance = Math.max(studentBalance - 230 / 30 + (studentBalance * 0.055 / 365), 0);

      const totalAssets = checkingBalance + savingsBalance;
      const totalDebt = creditBalance + carBalance + studentBalance;
      const netWorth = totalAssets - totalDebt;

      // Skip some days to simulate realistic behavior (not every single day)
      if (Math.random() < 0.93) { // 93% compliance rate
        await prisma.eODSubmission.create({
          data: {
            user_id: student.id,
            submission_date: date,
            account_snapshots: [
              { account_id: checkingAccount.id, balance: Math.round(checkingBalance) },
              { account_id: savingsAccount.id, balance: Math.round(savingsBalance) },
              { account_id: creditCard.id, balance: Math.round(creditBalance) },
              { account_id: carLoan.id, balance: Math.round(carBalance) },
              { account_id: studentLoan.id, balance: Math.round(studentBalance) },
            ],
            net_worth_computed: Math.round(netWorth),
            total_debt_computed: Math.round(totalDebt),
            total_assets_computed: Math.round(totalAssets),
            total_cash_computed: Math.round(checkingBalance + savingsBalance),
            mood: Math.floor(Math.random() * 3) + 2, // 2-4 range (realistic)
            ai_insight: insights[Math.floor(Math.random() * insights.length)],
          },
        });
      }
    }

    console.log('✅ Created 30 days of EOD submissions');
  } else {
    console.log(`ℹ️  ${existingEODs.length} EOD submissions already exist`);
  }

  // ============================================================
  // 6. Create Sample What-If Scenarios
  // ============================================================
  const existingScenarios = await prisma.whatIfScenario.findMany({ where: { user_id: student.id } });

  if (existingScenarios.length === 0) {
    await prisma.whatIfScenario.createMany({
      data: [
        {
          user_id: student.id,
          scenario_type: 'extra_debt_payment',
          label: 'Extra $200/mo to Chase Sapphire',
          parameters: { extra_monthly: 200, account_id: accounts.find((a) => a.name.includes('Sapphire'))?.id },
          result_summary: {
            interest_saved: 1847,
            months_saved: 14,
            narrative: 'Putting an extra $200/month toward your Chase Sapphire saves $1,847 in interest and frees up $326/mo in 14 months.',
          },
          projection_1yr: -29900,
          projection_3yr: -22000,
          projection_5yr: -8000,
          projection_10yr: 45000,
        },
        {
          user_id: student.id,
          scenario_type: 'relocate_country',
          label: 'Move to Medellin, Colombia',
          parameters: { city: 'Medellin' },
          result_summary: {
            monthly_savings: 2400,
            annual_savings: 28800,
            purchasing_power_multiplier: '3.18',
            narrative: 'Moving to Medellin saves $2,400/month. Purchasing power is 3.18x higher. Hit dream lifestyle in 11 months.',
          },
          projection_1yr: -10000,
          projection_3yr: 18000,
          projection_5yr: 65000,
          projection_10yr: 180000,
        },
        {
          user_id: student.id,
          scenario_type: 'income_increase',
          label: '20% Raise Scenario',
          parameters: { raise_pct: 20 },
          result_summary: {
            monthly_take_home_increase: 858,
            annual_take_home_increase: 10296,
            narrative: 'A 20% raise adds $858/mo take-home. Invested at 8%, that\'s $150K additional net worth in 10 years.',
          },
          projection_1yr: -22000,
          projection_3yr: -8000,
          projection_5yr: 12000,
          projection_10yr: 150000,
        },
      ],
    });
    console.log('✅ Created sample What-If scenarios');
  } else {
    console.log('ℹ️  What-If scenarios already exist');
  }

  // ============================================================
  // 7. Create Notification Preferences for Student
  // ============================================================
  const existingNotifPrefs = await prisma.notificationPreferences.findUnique({ where: { user_id: student.id } });
  if (!existingNotifPrefs) {
    await prisma.notificationPreferences.create({
      data: {
        user_id: student.id,
        eod_reminder_enabled: true,
        eod_reminder_time: '20:00',
        streak_alerts_enabled: true,
        milestone_alerts: true,
        coach_messages: true,
        red_flag_alerts: true,
        timezone: 'America/Chicago',
      },
    });
    console.log('✅ Created notification preferences');
  }

  // ============================================================
  // 8. Unlock Some Sample Milestones
  // ============================================================
  const existingMilestones = await prisma.milestoneUnlock.findMany({ where: { user_id: student.id } });
  if (existingMilestones.length === 0) {
    await prisma.milestoneUnlock.createMany({
      data: [
        { user_id: student.id, milestone_key: 'streak_7', celebrated: true },
        { user_id: student.id, milestone_key: 'streak_30', celebrated: true },
      ],
    });
    console.log('✅ Created sample milestone unlocks');
  }

  // ============================================================
  // 9. Create Demo Program Templates (Coach)
  // ============================================================
  const existingTemplates = await prisma.programTemplate.findMany({ where: { coach_id: coach.id } });
  if (existingTemplates.length === 0) {
    await prisma.programTemplate.createMany({
      data: [
        {
          coach_id: coach.id,
          name: 'Debt Demolition',
          description: 'Aggressive debt payoff program — clears all high-APR debt in 12 months',
          phases: [
            { phase_name: 'Cash Buffer', priority_index: 0, duration_weeks: 2, notes: 'Build $1k emergency buffer before anything else' },
            { phase_name: 'High-APR Assault', priority_index: 1, duration_weeks: 24, notes: 'Attack all debt above 10% APR using avalanche method. No exceptions.' },
            { phase_name: 'Emergency Fund', priority_index: 2, duration_weeks: 16, notes: 'Build 3-month emergency fund in HYSA' },
          ],
        },
        {
          coach_id: coach.id,
          name: 'Emergency Builder',
          description: 'For students who have debt under control and need to build cash reserves',
          phases: [
            { phase_name: '3-Month Fund', priority_index: 2, duration_weeks: 20, notes: 'Automate transfers to HYSA. Target minimum $10k.' },
            { phase_name: '6-Month Fund', priority_index: 4, duration_weeks: 32, notes: 'Extend to 6 months. Keep in high-yield account.' },
          ],
        },
        {
          coach_id: coach.id,
          name: 'Invest Mode',
          description: 'For students who are debt-free and ready to build wealth',
          phases: [
            { phase_name: 'Tax-Advantaged Max', priority_index: 3, duration_weeks: 52, notes: 'Max 401k ($23,500) + Roth IRA ($7,000). No exceptions.' },
            { phase_name: 'Asset Building', priority_index: 6, duration_weeks: 104, notes: 'VTI + VXUS in taxable brokerage. Consider rental research.' },
          ],
        },
      ],
    });
    console.log('✅ Created 3 demo program templates');
  }

  // ============================================================
  // Done!
  // ============================================================
  console.log('\n========================================');
  console.log('✅ Seeded demo data successfully!');
  console.log('========================================');
  console.log('\nDemo accounts:');
  console.log('  Coach:   coach@tgp-finance.demo   / Demo1234!');
  console.log('  Student: student@tgp-finance.demo / Demo1234!');
  console.log('\nStudent financial snapshot:');
  console.log('  Monthly gross: $5,500');
  console.log('  Checking:      $847');
  console.log('  Savings:       $2,340');
  console.log('  CC Debt:       $4,200 @ 26.99% APR');
  console.log('  Car Loan:      $8,500 @ 7.4% APR');
  console.log('  Student Loan:  $22,000 @ 5.5% APR');
  console.log('  Net Worth:     ~-$30,513');
  console.log('  Current Priority: 1 — Pay off high-APR debt');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
