// CommunityWinCard — read-only social proof. Doctrine: no reactions, no
// per-win acknowledgement surface. The card is purely informational.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

export interface CommunityWin {
  id: string;
  anonName: string;
  action: string;
  visibility: 'circle' | 'public';
  createdAt: string | Date;
}

interface CommunityWinCardProps {
  win: CommunityWin;
}

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CommunityWinCard({ win }: CommunityWinCardProps) {
  const initials = win.anonName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{win.anonName}</Text>
          <Text style={styles.time}>{timeAgo(win.createdAt)}</Text>
        </View>
        {win.visibility === 'circle' && (
          <View style={styles.circlePill}>
            <Text style={styles.circlePillText}>Circle</Text>
          </View>
        )}
      </View>

      <Text style={styles.action}>{win.action}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: Colors.graphiteBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.backgroundDeepNavy,
  },
  meta: { flex: 1 },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    marginTop: 1,
  },
  circlePill: {
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
  },
  circlePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  action: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  reactRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  reactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: 'transparent',
  },
  reactBtnActive: {
    borderColor: Colors.frostWhite,
  },
  reactLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 0.5,
  },
  reactLabelActive: {
    color: Colors.frostWhite,
  },
  reactCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  reactCountActive: {
    color: Colors.frostWhite,
  },
});
