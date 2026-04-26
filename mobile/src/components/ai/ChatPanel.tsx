// AI Chat panel — full screen chat with FP financial coach
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatBubble } from './ChatBubble';
import { QuickSuggestions } from './QuickSuggestions';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { useChatStore } from '../../stores/chatStore';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const { messages, isLoading, error, sendMessage, clearError } = useChatStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    clearError();
    await sendMessage(text);
  };

  const handleSuggestion = async (suggestion: string) => {
    if (isLoading) return;
    clearError();
    await sendMessage(suggestion);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.fpAvatar}>
          <Text style={styles.fpText}>FP</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>FP — Financial Coach</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.headerSub}>Online</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatIcon}>
              <Text style={{ fontSize: 40, color: Colors.slateGray }}>$</Text>
            </View>
            <Text style={styles.emptyChatTitle}>Ask FP anything</Text>
            <Text style={styles.emptyChatText}>
              Debt strategy, investing, budgeting, income growth, financial independence — I have full context on your finances.
            </Text>
          </View>
        )}
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={{
              ...msg,
              timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
            }}
          />
        ))}
        {isLoading && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={Colors.accentGold} />
            <Text style={styles.typingText}>FP is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Quick suggestions — only show when no messages, constrained height */}
      {messages.length === 0 && (
        <View style={{ maxHeight: 60 }}>
          <QuickSuggestions onSelect={handleSuggestion} />
        </View>
      )}

      {/* Input bar — clear separation, no overlap */}
      <View style={styles.inputBarContainer}>
        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask FP anything..."
            placeholderTextColor={Colors.slateGray}
            style={styles.input}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.backgroundDeepNavy} />
            ) : (
              <Ionicons name="send" size={20} color={Colors.backgroundDeepNavy} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.graphiteBorder,
  },
  fpAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fpText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
  },
  headerName: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.profitGreen,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.profitGreen,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyChat: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyChatIcon: {
    marginBottom: Spacing.base,
  },
  emptyChatTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  emptyChatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.md,
    alignSelf: 'flex-start',
  },
  typingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  inputBarContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.graphiteBorder,
    backgroundColor: Colors.backgroundDeepNavy,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.md,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    maxHeight: 100,
    minHeight: 48,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
