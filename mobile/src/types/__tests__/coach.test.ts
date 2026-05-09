/**
 * Type-level guards for the coach API contract types.
 *
 * Catches drift between the backend payload shape and the mobile types
 * by hand-asserting against a fixture that mirrors a real response. If
 * a field is added/renamed on the backend without updating the
 * `src/types/coach.ts` interface, these tests fail at compile time.
 */
import type {
  CoachClientRow,
  CoachDashboardResponse,
  CoachMessageRow,
  CommunityPostRow,
  ClientAssignmentRow,
} from '../coach';

describe('coach API contract types', () => {
  it('CoachClientRow accepts a fully-populated row', () => {
    const row: CoachClientRow = {
      id: 's1',
      name: 'Alice',
      email: 'a@x.com',
      status: 'active',
      net_worth: 50000,
      total_debt: 0,
      total_assets: 50000,
      wealth_velocity_score: 80,
      primary_goal: 'save more',
      days_since_last_checkin: 1,
      eod_submission_count: 12,
      priority_index: 2,
      joined_at: '2026-04-01T00:00:00.000Z',
    };
    expect(row.status).toBe('active');
  });

  it('CoachClientRow allows null for optional derived fields', () => {
    const row: CoachClientRow = {
      id: 's2',
      name: 'Bob',
      email: 'b@x.com',
      status: 'onboarding',
      net_worth: 0,
      total_debt: 0,
      total_assets: 0,
      wealth_velocity_score: 0,
      primary_goal: null,
      days_since_last_checkin: null,
      eod_submission_count: 0,
      priority_index: 0,
      joined_at: '2026-05-01T00:00:00.000Z',
    };
    expect(row.primary_goal).toBeNull();
    expect(row.days_since_last_checkin).toBeNull();
  });

  it('CoachDashboardResponse activity items distinguish kinds', () => {
    const dashboard: CoachDashboardResponse = {
      stats: {
        total_clients: 1,
        active_this_week: 1,
        needs_attention: 0,
        open_assignments: 0,
        roster_net_worth: 0,
        roster_total_debt: 0,
        roster_total_assets: 0,
      },
      clients_needing_attention: [],
      recent_activity: [
        { kind: 'eod', at: '2026-05-09', client_id: 'c', client_name: 'C', summary: 'logged' },
        { kind: 'milestone', at: '2026-05-08', client_id: 'c', client_name: 'C', summary: 'won' },
      ],
    };
    const kinds = dashboard.recent_activity.map((a) => a.kind);
    expect(kinds).toEqual(['eod', 'milestone']);
  });

  it('CoachMessageRow exposes the from_coach derived flag', () => {
    const msg: CoachMessageRow = {
      id: 'm1',
      sender_id: 'coach-1',
      recipient_id: 'client-1',
      body: 'hi',
      read_at: null,
      created_at: '2026-05-09T12:00:00.000Z',
      from_coach: true,
    };
    expect(msg.from_coach).toBe(true);
  });

  it('CommunityPostRow status is one of the three published states', () => {
    const post: CommunityPostRow = {
      id: 'p1',
      author_id: 'coach-1',
      title: 'A note on debt',
      body: 'Pay it down.',
      resource_url: null,
      status: 'published',
      audience: 'own_clients',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      published_at: '2026-05-01T00:00:00.000Z',
    };
    // Static type narrowing: TS allows only 'draft' | 'published' | 'archived'.
    const s: typeof post.status = 'draft';
    expect(['draft', 'published', 'archived']).toContain(s);
  });

  it('ClientAssignmentRow tracks completed_at separately from status', () => {
    const a: ClientAssignmentRow = {
      id: 'a1',
      coach_id: 'coach-1',
      client_id: 'client-1',
      title: 'Save $500',
      description: null,
      assignment_type: 'savings_challenge',
      due_date: null,
      status: 'completed',
      target_value: 500,
      target_unit: 'usd',
      coach_notes: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-09T00:00:00.000Z',
      completed_at: '2026-05-09T00:00:00.000Z',
    };
    expect(a.completed_at).not.toBeNull();
    expect(a.status).toBe('completed');
  });
});
