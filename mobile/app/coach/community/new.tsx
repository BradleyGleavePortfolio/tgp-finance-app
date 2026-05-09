/**
 * NewCommunityPostScreen — compose a community post.
 *
 * Single-page form: eyebrow + title + body + optional resource URL +
 * status (draft/published) + audience. Save publishes (or saves as draft)
 * via coachApi.createCommunityPost and pops back to the list.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import type {
  CommunityPostStatus,
  CommunityPostAudience,
} from '../../../src/types/coach';

export default function NewCommunityPostScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [status, setStatus] = useState<CommunityPostStatus>('published');
  const [audience, setAudience] = useState<CommunityPostAudience>('own_clients');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await coachApi.createCommunityPost({
        title: title.trim(),
        body: body.trim(),
        resource_url: resourceUrl.trim() || undefined,
        status,
        audience,
      });
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>NEW POST</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={styles.headerSave}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Publish"
        >
          <Text style={[styles.headerSaveText, !canSubmit && { opacity: 0.4 }]}>SAVE</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="A precise, declarative title."
            placeholderTextColor={colors.stone}
            style={[styles.input, styles.titleInput]}
            accessibilityLabel="Post title"
          />

          <Text style={styles.fieldLabel}>BODY</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="The piece. Plain text. Periods, not exclamation marks."
            placeholderTextColor={colors.stone}
            multiline
            numberOfLines={10}
            style={[styles.input, styles.bodyInput]}
            accessibilityLabel="Post body"
          />

          <Text style={styles.fieldLabel}>RESOURCE URL (OPTIONAL)</Text>
          <TextInput
            value={resourceUrl}
            onChangeText={setResourceUrl}
            placeholder="https://…"
            placeholderTextColor={colors.stone}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel="Resource URL"
          />

          <Text style={styles.fieldLabel}>STATUS</Text>
          <View style={styles.row}>
            {(['draft', 'published'] as CommunityPostStatus[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, status === s && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: status === s }}
                accessibilityLabel={`Status: ${s}`}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>AUDIENCE</Text>
          <View style={styles.row}>
            {(['own_clients', 'all_clients'] as CommunityPostAudience[]).map((a) => (
              <Pressable
                key={a}
                onPress={() => setAudience(a)}
                style={[styles.chip, audience === a && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: audience === a }}
                accessibilityLabel={`Audience: ${a.replace('_', ' ')}`}
              >
                <Text style={[styles.chipText, audience === a && styles.chipTextActive]}>
                  {a.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helpText}>
            Owner-only: "all clients" broadcasts to every client across coaches.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerSave: { width: 56, alignItems: 'flex-end' },
  headerSaveText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginTop: spacing.md,
  },
  input: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  titleInput: {
    fontFamily: typography.families.serif,
    fontSize: 22,
  },
  bodyInput: {
    minHeight: 200,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.stone,
    backgroundColor: colors.cream,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  chipTextActive: {
    color: colors.bone,
  },
  helpText: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 4,
  },
});
