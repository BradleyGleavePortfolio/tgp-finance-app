/**
 * TrustExplainerSheet — UX Psychology Report #2: "Trust as Emotion"
 *
 * Modal bottom sheet that explains the three trust pillars shown in TrustCueRow.
 * No heavy deps — uses core RN Modal + Animated.
 */
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { HapticPressable } from '../HapticPressable';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PILLARS = [
  {
    emoji: '🔒',
    title: 'End-to-end encrypted',
    body:
      'All data in transit is protected by TLS 1.3. At rest, your financial records are encrypted with AES-256 — the same standard used by major financial institutions.',
  },
  {
    emoji: '👤',
    title: 'Your data is yours',
    body:
      'You own your data. You can request a full export at any time, or permanently delete your account. We never sell, rent, or monetise your personal or financial information.',
  },
  {
    emoji: '🛡',
    title: 'Zero ads · Zero data sales',
    body:
      'This app has no advertising network and no third-party data brokers. Our business model is a subscription — your data is never the product.',
  },
];

export function TrustExplainerSheet({ visible, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <TouchableOpacity
        style={styles.scrim}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Close"
      />

      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        <Text style={styles.sheetTitle}>How we protect you</Text>

        <ScrollView
          contentContainerStyle={styles.pillarsContainer}
          showsVerticalScrollIndicator={false}
        >
          {PILLARS.map((p) => (
            <View key={p.title} style={styles.pillarCard}>
              <Text style={styles.pillarEmoji}>{p.emoji}</Text>
              <View style={styles.pillarText}>
                <Text style={styles.pillarTitle}>{p.title}</Text>
                <Text style={styles.pillarBody}>{p.body}</Text>
              </View>
            </View>
          ))}

          {/* Divider */}
          <View style={styles.divider} />
          <Text style={styles.footerNote}>
            For more details, visit{' '}
            <Text style={styles.footerLink}>Privacy Policy</Text> or open the{' '}
            <Text style={styles.footerLink}>Trust Center</Text> from Settings.
          </Text>
        </ScrollView>

        <HapticPressable
          intent="medium"
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close trust explainer"
        >
          <Text style={styles.closeBtnText}>Got it</Text>
        </HapticPressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.cardSurfaceNavy,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.graphiteBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.base,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
  },
  pillarsContainer: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
  pillarCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  pillarEmoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  pillarText: {
    flex: 1,
  },
  pillarTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyLarge,
    color: Colors.frostWhite,
    marginBottom: Spacing.xs,
  },
  pillarBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.graphiteBorder,
    marginVertical: Spacing.base,
  },
  footerNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 20,
  },
  footerLink: {
    color: Colors.slateGray,
    fontFamily: 'Inter_600SemiBold',
  },
  closeBtn: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    backgroundColor: Colors.accentGold,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyLarge,
    color: Colors.backgroundDeepNavy,
  },
});
