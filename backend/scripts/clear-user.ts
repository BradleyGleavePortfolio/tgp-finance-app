/**
 * clear-user.ts — Delete ALL data for a user so they can re-register fresh.
 *
 * Usage:
 *   cd backend
 *   npx ts-node --project tsconfig.json scripts/clear-user.ts <email>
 *
 * Requires a .env file (or exported env vars) with:
 *   DATABASE_URL          — Prisma connection string
 *   SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (admin access)
 *
 * What it does:
 *   1. Looks up the user by email in the Prisma DB
 *   2. Manually deletes rows in tables that do NOT cascade from User
 *      (coach_notes, program_templates, spending_dna_reports)
 *   3. Deletes the User row (cascades to all other tables)
 *   4. Deletes the user from Supabase Auth
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root or project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node --project tsconfig.json scripts/clear-user.ts <email>');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  // --- Find User ---
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email})`);
  console.log(`  ID:         ${user.id}`);
  console.log(`  Supabase:   ${user.supabase_id}`);
  console.log(`  Role:       ${user.role}`);
  console.log(`  Created:    ${user.created_at}`);
  console.log('');

  // --- Count related data before deleting ---
  const [
    profileCount,
    accountCount,
    eodCount,
    whatIfCount,
    milestoneCount,
    habitLogCount,
    notifPrefCount,
    coachNotesAsStudent,
    coachNotesAsCoach,
    programTemplateCount,
    spendingDnaCount,
  ] = await Promise.all([
    prisma.financialProfile.count({ where: { user_id: user.id } }),
    prisma.financialAccount.count({ where: { user_id: user.id } }),
    prisma.eODSubmission.count({ where: { user_id: user.id } }),
    prisma.whatIfScenario.count({ where: { user_id: user.id } }),
    prisma.milestoneUnlock.count({ where: { user_id: user.id } }),
    prisma.habitLog.count({ where: { user_id: user.id } }),
    prisma.notificationPreferences.count({ where: { user_id: user.id } }),
    prisma.coachNote.count({ where: { student_id: user.id } }),
    prisma.coachNote.count({ where: { coach_id: user.id } }),
    prisma.programTemplate.count({ where: { coach_id: user.id } }),
    prisma.spendingDnaReport.count({ where: { user_id: user.id } }),
  ]);

  console.log('Data to be deleted:');
  console.log(`  Financial profile:     ${profileCount}`);
  console.log(`  Financial accounts:    ${accountCount} (+ balance logs cascade)`);
  console.log(`  EOD submissions:       ${eodCount}`);
  console.log(`  What-if scenarios:     ${whatIfCount}`);
  console.log(`  Milestone unlocks:     ${milestoneCount}`);
  console.log(`  Habit logs:            ${habitLogCount}`);
  console.log(`  Notification prefs:    ${notifPrefCount}`);
  console.log(`  Coach notes (student): ${coachNotesAsStudent}`);
  console.log(`  Coach notes (coach):   ${coachNotesAsCoach}`);
  console.log(`  Program templates:     ${programTemplateCount}`);
  console.log(`  Spending DNA reports:  ${spendingDnaCount}`);
  console.log('');

  // --- Delete non-cascading tables first ---
  // CoachNote references coach_id and student_id without onDelete: Cascade
  const deletedCoachNotes = await prisma.coachNote.deleteMany({
    where: { OR: [{ student_id: user.id }, { coach_id: user.id }] },
  });
  console.log(`Deleted ${deletedCoachNotes.count} coach notes`);

  // ProgramTemplate references coach_id without onDelete: Cascade
  const deletedTemplates = await prisma.programTemplate.deleteMany({
    where: { coach_id: user.id },
  });
  console.log(`Deleted ${deletedTemplates.count} program templates`);

  // SpendingDnaReport has user_id but no FK relation on the User model
  const deletedDna = await prisma.spendingDnaReport.deleteMany({
    where: { user_id: user.id },
  });
  console.log(`Deleted ${deletedDna.count} spending DNA reports`);

  // --- Delete User row (cascades to all other related tables) ---
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Deleted user row (cascaded to profiles, accounts, EODs, etc.)`);

  await prisma.$disconnect();

  // --- Delete from Supabase Auth ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      realtime: { transport: ws as any },
    });
    const { error } = await supabase.auth.admin.deleteUser(user.supabase_id);
    if (error) {
      console.error(`Warning: Failed to delete Supabase auth user: ${error.message}`);
      console.error('You may need to manually delete them from the Supabase dashboard.');
    } else {
      console.log(`Deleted Supabase auth user (${user.supabase_id})`);
    }
  } else {
    console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipped Supabase auth deletion.');
    console.warn('Delete the user manually from the Supabase dashboard if needed.');
  }

  console.log('');
  console.log(`Done! ${email} can now re-register.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
