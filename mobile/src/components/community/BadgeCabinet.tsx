// BadgeCabinet — UX Psychology Report #5: Contribution Loops
// Shows earned + locked badges. Founding tier users get a gold border header.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { communityApi } from '../../services/api';
import { track } from '../../lib/analytics';

interface Badge {
  key: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
}

interface BadgeCabinetProps {
  isFoundingMember?: boolean;
}

export function BadgeCabinet({ isFoundingMember = false }: BadgeCabinetProps) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    communityApi
      .getBadges()
      .then((r: { data: { data?: Badge[]; } | Badge[] }) => {
        const raw = (r.data as { data?: Badge[] }).data ?? (r.data as Badge[]) ?? [];
        const data: Badge[] = Array.isArray(raw) ? raw : [];
        setBadges(data);
        track('badge_cabinet_viewed', { earned: data.filter((b) => b.earned).length });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading && badges.length === 0) return null;

  const headerVariant = isFoundingMember ? 'gold' : 'default';

  return (
    <Card variant={isFoundingMember ? 'gold' : 'default'} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Badges</Text>
        {isFoundingMember && (
          <View style={styles.foundingTag}>
            <Text style={styles.foundingTagText}>🏛️ Founding Member</Text>
          </View>
        )}
      </View>

      {/* Badge grid */}
      <View style={styles.grid}>
        {badges.map((badge) => (
          <View
            key={badge.key}
            style={[styles.badgeItem, badge.earned ? styles.badgeEarned : styles.badgeLocked]}
          >
            <Text style={[styles.badgeIcon, badge.earned ? {} : styles.badgeIconLocked]}>
              {badge.icon}
            </Text>
            <Text style={[styles.badgeTitle, badge.earned ? styles.badgeTitleEarned : styles.badgeTitleLocked]}>
              {badge.title}
            </Text>
            <Text style={styles.badgeDesc} numberOfLines={2}>
              {badge.description}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
  },
  foundingTag: {
    backgroundColor: 'rgba(249, 199, 79, 0.12)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.accentGold,
  },
  foundingTagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgeItem: {
    width: '47%',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  badgeEarned: {
    backgroundColor: 'rgba(249, 199, 79, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(249, 199, 79, 0.3)',
  },
  badgeLocked: {
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    opacity: 0.5,
  },
  badgeIcon: {
    fontSize: 28,
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    textAlign: 'center',
  },
  badgeTitleEarned: {
    color: Colors.accentGold,
  },
  badgeTitleLocked: {
    color: Colors.slateGray,
  },
  badgeDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 15,
  },
});
