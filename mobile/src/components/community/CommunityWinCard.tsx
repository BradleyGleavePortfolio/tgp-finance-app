// CommunityWinCard — UX Psychology Report #5: Contribution Loops
// Renders an anonymised community win with 🔥/👏 reaction buttons.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { HapticPressable } from '../HapticPressable';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

export interface CommunityWin {
  id: string;
  anonName: string;
  action: string;
  visibility: 'circle' | 'public';
  createdAt: string | Date;
  reactions: { fire: number; clap: number };
  myReactions: { fire: boolean; clap: boolean };
}

interface CommunityWinCardProps {
  win: CommunityWin;
  onReact: (winId: string, kind: 'fire' | 'clap') => void;
}

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CommunityWinCard({ win, onReact }: CommunityWinCardProps) {
  const initials = win.anonName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card style={styles.card}>
      {/* Header row */}
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

      {/* Win text */}
      <Text style={styles.action}>{win.action}</Text>

      {/* Reaction buttons */}
      <View style={styles.reactRow}>
        <HapticPressable
          intent="success"
          style={[styles.reactBtn, win.myReactions.fire && styles.reactBtnActive]}
          onPress={() => onReact(win.id, 'fire')}
        >
          <Text style={styles.emoji}>🔥</Text>
          <Text style={[styles.reactCount, win.myReactions.fire && styles.reactCountActive]}>
            {win.reactions.fire + (win.myReactions.fire ? 0 : 0)}
          </Text>
        </HapticPressable>

        <HapticPressable
          intent="success"
          style={[styles.reactBtn, win.myReactions.clap && styles.reactBtnActive]}
          onPress={() => onReact(win.id, 'clap')}
        >
          <Text style={styles.emoji}>👏</Text>
          <Text style={[styles.reactCount, win.myReactions.clap && styles.reactCountActive]}>
            {win.reactions.clap}
          </Text>
        </HapticPressable>
      </View>
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
    borderRadius: 18,
    backgroundColor: Colors.investmentTeal,
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
    backgroundColor: 'rgba(249, 199, 79, 0.12)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.accentGold,
  },
  circlePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
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
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavyElevated,
  },
  reactBtnActive: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249, 199, 79, 0.1)',
  },
  emoji: {
    fontSize: 14,
  },
  reactCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  reactCountActive: {
    color: Colors.accentGold,
  },
});
