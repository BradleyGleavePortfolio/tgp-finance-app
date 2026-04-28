// Membership / access posture card for the Profile screen.
//
// Surfaces who owns the account (the user themselves, the platform owner, or
// the coach who manages it) without dramatising the relationship. Every
// student shipped under the coach-invite flow has access mediated by their
// coach; the card is the only place in product UI that says so out loud.
import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { usersApi } from '../../services/api';

type AccessSource = 'self' | 'coach_managed' | 'owner';

interface AccessStatus {
  role: 'student' | 'coach' | 'owner';
  accessSource: AccessSource;
  coach: { id: string; displayName: string } | null;
  supportContactEmail: string;
}

const TITLE_BY_SOURCE: Record<AccessSource, string> = {
  self: 'Self-managed',
  coach_managed: 'Coach-managed',
  owner: 'Owner',
};

function formatBody(status: AccessStatus): string {
  switch (status.accessSource) {
    case 'coach_managed':
      return status.coach
        ? `Your access is managed by ${status.coach.displayName}. They can see your priorities, EOD entries, and progress.`
        : 'Your access is managed by your coach. They can see your priorities, EOD entries, and progress.';
    case 'owner':
      return 'You hold the platform owner role.';
    case 'self':
    default:
      return 'You manage your own access.';
  }
}

export function MembershipCard() {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getAccessStatus()
      .then((res) => {
        if (cancelled) return;
        setStatus(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !status) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>MEMBERSHIP</Text>
      <Text style={styles.title}>{TITLE_BY_SOURCE[status.accessSource]}</Text>
      <Text style={styles.body}>{formatBody(status)}</Text>
      <Text style={styles.meta}>
        Questions about access: {status.supportContactEmail}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: Colors.slateGray,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.fontSerif,
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    lineHeight: Typography.lineHeightBody,
    marginBottom: Spacing.sm,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
});
