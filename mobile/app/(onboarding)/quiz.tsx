import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardingApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Typography, Spacing } from '../../src/theme/finance';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'risk_tolerance',
    question: 'How would you describe your risk tolerance?',
    options: ['Conservative', 'Moderate', 'Aggressive', 'Very Aggressive'],
  },
  {
    id: 'investment_horizon',
    question: 'What is your investment time horizon?',
    options: ['Less than 1 year', '1-3 years', '3-5 years', '5+ years'],
  },
  {
    id: 'financial_goal',
    question: 'What is your primary financial goal?',
    options: ['Debt payoff', 'Emergency fund', 'Retirement', 'Wealth building'],
  },
  {
    id: 'income_range',
    question: 'What is your annual income range?',
    options: ['Under $50k', '$50k-$100k', '$100k-$200k', '$200k+'],
  },
];

export default function QuizScreen() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Save quiz answers locally so they persist
      await AsyncStorage.setItem('quiz_answers', JSON.stringify(answers));

      // Try to submit to backend — may fail if endpoint not deployed yet
      try {
        await onboardingApi.submitQuiz(answers);
      } catch (apiErr: any) {
        // If the backend doesn't have this endpoint yet (404), continue anyway
        // The quiz answers are saved locally
        console.log('Quiz API submit failed (non-blocking):', apiErr?.response?.status);
      }

      // Refresh user data from /me
      await refreshUser();

      // Navigate to command center
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const question = QUIZ_QUESTIONS[currentQuestion];
  const allAnswered = Object.keys(answers).length === QUIZ_QUESTIONS.length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Financial Profile</Text>
        <Text style={styles.subtitle}>Help us personalize your experience</Text>
      </View>

      <Text style={styles.progress}>
        Question {currentQuestion + 1} of {QUIZ_QUESTIONS.length}
      </Text>

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {QUIZ_QUESTIONS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i <= currentQuestion ? styles.dotActive : null,
              answers[QUIZ_QUESTIONS[i].id] ? styles.dotCompleted : null,
            ]}
          />
        ))}
      </View>

      <View style={styles.questionContainer}>
        <Text style={styles.question}>{question.question}</Text>
        {question.options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.option,
              answers[question.id] === option && styles.selectedOption,
            ]}
            onPress={() => handleAnswer(question.id, option)}
          >
            <Text
              style={[
                styles.optionText,
                answers[question.id] === option && styles.selectedOptionText,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.navigation}>
        {currentQuestion > 0 && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentQuestion((prev) => prev - 1)}
          >
            <Text style={styles.navButtonText}>← Previous</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {currentQuestion < QUIZ_QUESTIONS.length - 1 && answers[question.id] && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentQuestion((prev) => prev + 1)}
          >
            <Text style={styles.navButtonText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>

      {allAnswered && (
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.backgroundDeepNavy} />
          ) : (
            <Text style={styles.submitButtonText}>Go to Command Center →</Text>
          )}
        </TouchableOpacity>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.xl,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.section,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
  },
  progress: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.base,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: Spacing.xl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.graphiteBorder,
  },
  dotActive: {
    backgroundColor: Colors.slateGray,
  },
  dotCompleted: {
    backgroundColor: Colors.accentGold,
  },
  questionContainer: {
    marginBottom: Spacing.xl,
  },
  question: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.base,
  },
  option: {
    padding: Spacing.base,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.graphiteBorder,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.cardSurfaceNavy,
  },
  selectedOption: {
    backgroundColor: 'rgba(249,199,79,0.12)',
    borderColor: Colors.accentGold,
  },
  optionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  selectedOptionText: {
    color: Colors.accentGold,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  navButton: {
    padding: Spacing.sm,
  },
  navButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
  },
  submitButton: {
    backgroundColor: Colors.accentGold,
    padding: Spacing.base,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: 'Inter_700Bold',
    color: Colors.backgroundDeepNavy,
    fontSize: Typography.titleSmall,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: Typography.bodySmall,
  },
});
