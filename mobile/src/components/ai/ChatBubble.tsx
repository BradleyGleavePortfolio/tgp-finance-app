// Chat bubble for AI coach messages
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import type { ChatMessage } from '../../types';
import { formatRelativeTime } from '../../utils/formatters';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.wrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>FP</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
        <Text style={styles.timestamp}>{formatRelativeTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    maxWidth: '90%',
  },
  userWrapper: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  assistantWrapper: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 4, // radius.lg
    backgroundColor: Colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.microLabel,
    color: Colors.backgroundDeepNavy,
  },
  bubble: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxWidth: '95%',
  },
  userBubble: {
    backgroundColor: 'rgba(249,199,79,0.12)',
    borderColor: 'rgba(249,199,79,0.3)',
    borderWidth: 1,
  },
  assistantBubble: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.graphiteBorder,
    borderWidth: 1,
  },
  text: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    lineHeight: 22,
  },
  userText: {
    color: Colors.frostWhite,
  },
  assistantText: {
    color: Colors.frostWhite,
  },
  timestamp: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
});
