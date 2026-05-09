import { z } from 'zod';

// Allow-list shape so unknown fields (e.g. coach_id mass-assignment) are
// rejected before the service ever runs.
export const CreateInviteCodeSchema = z
  .object({
    expires_at: z.string().datetime().nullable().optional(),
    max_uses: z.number().int().min(1).max(100000).nullable().optional(),
  })
  .strict();

export type CreateInviteCodeBody = z.infer<typeof CreateInviteCodeSchema>;
