// All push notification types the backend can send. Keeping them in one
// place so dedupe rules, preference mapping, and tests stay aligned.

export type PushType =
  | 'eod_reminder'
  | 'net_worth_milestone'
  | 'priority_levelup'
  | 'future_self_letter'
  | 'spending_dna'
  | 'coach_message';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  sent: boolean;
  reason?: string;
}

// Types that dedupe per calendar day per user (one send per UTC day).
export const DAILY_DEDUPE_TYPES: ReadonlyArray<PushType> = [
  'eod_reminder',
  'future_self_letter',
  'spending_dna',
];

// Types that dedupe by a unique event identifier stored in `data`.
// Keyed by the field in `data` that uniquely identifies the event.
export const EVENT_DEDUPE_KEYS: Readonly<Partial<Record<PushType, string>>> = {
  net_worth_milestone: 'milestone_key',
  priority_levelup: 'priority_index',
  // Each message row gets its own dedupe key so resending the same body
  // to a different recipient still fires.
  coach_message: 'message_id',
};

// Maps each push type to the NotificationPreferences boolean column that
// gates it. `null` means the type is always on (no opt-out at preference
// level — currently none of our types fall here, but we keep the escape
// hatch).
export const PREF_FIELD_BY_TYPE: Readonly<Record<PushType, string | null>> = {
  eod_reminder: 'eod_reminder_enabled',
  net_worth_milestone: 'milestone_alerts',
  priority_levelup: 'priority_levelup_alerts',
  future_self_letter: 'future_self_letter_enabled',
  spending_dna: 'spending_dna_alerts',
  coach_message: 'coach_messages',
};
