// AI Chat panel — slide-up chat panel with dark bg
import React, { useRef, useState } from 'react';
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
  const { messages, isLoading, sendMessage } = useChatStore();

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await sendMessage(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.fpAvatar}>
          <Text style={styles.fpText}>FP</Text>
        </View>
        <View>
          <Text style={styles.headerName}>FP — Financial Coach</Text>
          <Text style={styles.headerSub}>Powered by Perplexity sonar-pro</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>
              Ask me anything about your finances. I have full context on your net worth, debts, and goals.
            </Text>
          </View>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={Colors.accentGold} />
            <Text style={styles.typingText}>FP is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Quick suggestions */}
      <QuickSuggestions onSelect={handleSuggestion} />

      {/* Input bar */}
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
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={18} color={Colors.backgroundDeepNavy} />
        </TouchableOpacity>
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
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.graphiteBorder,
  },
  fpAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  emptyChat: {
    padding: Spacing.xl,
    alignItems: 'center',
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
  },
  typingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.base,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.graphiteBorder,
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
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
});
