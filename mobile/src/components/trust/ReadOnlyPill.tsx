/**
 * ReadOnlyPill — UX Psychology Report #2: "Trust as Emotion"
 *
 * Persistent pill near the top of any screen showing balances or transactions.
 * "Read-only · Never moves money"
 *
 * Dismissible per-screen via AsyncStorage:
 *   key: trustpill_dismissed_{screenId} = "true"
 *
 * Usage:
 *   <ReadOnlyPill screenId="accounts" />
 *   <ReadOnlyPill screenId="account_detail" />
 *   <ReadOnlyPill screenId="transactions" />
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { track } from '../../lib/analytics';

const STORAGE_PREFIX = 'trustpill_dismissed_';

interface Props {
  /** Unique identifier for this screen — used as AsyncStorage key suffix. */
  screenId: string;
}

export function ReadOnlyPill({ screenId }: Props) {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(`${STORAGE_PREFIX}${screenId}`).then((val) => {
      if (val !== 'true') {
        setVisible(true);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [screenId, opacity]);

  const handleDismiss = () => {
    track('read_only_pill_dismissed', { screen: screenId });
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    AsyncStorage.setItem(`${STORAGE_PREFIX}${screenId}`, 'true').catch(() => {});
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.pill}>
        <Text style={styles.label}>Read-only · Never moves money</Text>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss read-only notice"
        >
          <Text style={styles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 214, 160, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 214, 160, 0.22)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.xs,
  },
  label: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.profitGreen,
    letterSpacing: 0.1,
  },
  dismiss: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.slateGray,
    lineHeight: 16,
  },
});
