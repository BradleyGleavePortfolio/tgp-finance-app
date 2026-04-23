import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
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

type ExtraStep = 'income' | 'future_letter' | 'dream_description' | 'dream_cost';

export default function QuizScreen() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraStep, setExtraStep] = useState<ExtraStep | null>(null);
  const [monthlyTakeHome, setMonthlyTakeHome] = useState('');
  const [futureSelfLetter, setFutureSelfLetter] = useState('');
  const [dreamDescription, setDreamDescription] = useState('');
  const [monthlyDreamCost, setMonthlyDreamCost] = useState('');

  const handleAnswer = (questionId: string, answer: string) => {
    const updated = { ...answers, [questionId]: answer };
    setAnswers(updated);
    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else if (Object.keys(updated).length === QUIZ_QUESTIONS.length) {
      setExtraStep('income');
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const finalAnswers = { ...answers };
      if (monthlyTakeHome) {
        finalAnswers.monthly_take_home = monthlyTakeHome;
      }
      if (futureSelfLetter) finalAnswers.future_self_letter = futureSelfLetter;
      if (dreamDescription) finalAnswers.dream_description = dreamDescription;
      if (monthlyDreamCost) finalAnswers.monthly_dream_cost = monthlyDreamCost;
      await AsyncStorage.setItem('quiz_answers', JSON.stringify(finalAnswers));
      await onboardingApi.submitQuiz(finalAnswers);
      await refreshUser();
      router.replace('/(tabs)');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Failed to save your profile. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const question = QUIZ_QUESTIONS[currentQuestion];

  const renderExtraStep = () => {
    switch (extraStep) {
      case 'income':
        return (
          <>
            <View style={styles.questionContainer}>
              <Text style={styles.question}>One more thing</Text>
              <Text style={styles.incomeSubtitle}>
                What's your monthly take-home pay? (after taxes)
              </Text>
              <TextInput
                style={styles.incomeInput}
                keyboardType="numeric"
                placeholder="e.g. 4500"
                placeholderTextColor={Colors.slateGray}
                value={monthlyTakeHome}
                onChangeText={setMonthlyTakeHome}
              />
              <TouchableOpacity
                style={styles.skipLink}
                onPress={() => setExtraStep('future_letter')}
                accessibilityRole="button"
                accessibilityLabel="Skip this step"
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={() => setExtraStep('future_letter')}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.submitButtonText}>Continue →</Text>
            </TouchableOpacity>
          </>
        );

      case 'future_letter':
        return (
          <>
            <View style={styles.questionContainer}>
              <Text style={styles.question}>Write a letter to your future self</Text>
              <Text style={styles.incomeSubtitle}>
                You'll open this in 90 days. Tell future-you what you're feeling right now and what you hope to achieve.
              </Text>
              <TextInput
                style={[styles.incomeInput, { minHeight: 150, textAlignVertical: 'top' }]}
                multiline
                numberOfLines={6}
                placeholder="Dear future me..."
                placeholderTextColor={Colors.slateGray}
                value={futureSelfLetter}
                onChangeText={setFutureSelfLetter}
              />
            </View>
            <View style={styles.extraStepButtons}>
              <TouchableOpacity
                style={styles.skipLink}
                onPress={() => setExtraStep('dream_description')}
                accessibilityRole="button"
                accessibilityLabel="Skip this step"
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => setExtraStep('dream_description')}
                accessibilityRole="button"
                accessibilityLabel="Continue"
              >
                <Text style={styles.submitButtonText}>Continue →</Text>
              </TouchableOpacity>
            </View>
          </>
        );

      case 'dream_description':
        return (
          <>
            <View style={styles.questionContainer}>
              <Text style={styles.question}>Describe your dream lifestyle</Text>
              <Text style={styles.incomeSubtitle}>
                In 3 sentences, paint the picture. Where do you live? What does your day look like?
              </Text>
              <TextInput
                style={[styles.incomeInput, { minHeight: 120, textAlignVertical: 'top' }]}
                multiline
                numberOfLines={4}
                placeholder="I live on the coast, work 4 hours a day on passion projects, travel monthly..."
                placeholderTextColor={Colors.slateGray}
                value={dreamDescription}
                onChangeText={setDreamDescription}
              />
            </View>
            <View style={styles.extraStepButtons}>
              <TouchableOpacity
                style={styles.skipLink}
                onPress={() => setExtraStep('dream_cost')}
                accessibilityRole="button"
                accessibilityLabel="Skip this step"
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => setExtraStep('dream_cost')}
                accessibilityRole="button"
                accessibilityLabel="Continue"
              >
                <Text style={styles.submitButtonText}>Continue →</Text>
              </TouchableOpacity>
            </View>
          </>
        );

      case 'dream_cost':
        return (
          <>
            <View style={styles.questionContainer}>
              <Text style={styles.question}>What would that lifestyle cost per month?</Text>
              <Text style={styles.incomeSubtitle}>
                Be real — this sets your Financial Independence target.
              </Text>
              <TextInput
                style={styles.incomeInput}
                keyboardType="numeric"
                placeholder="e.g. 15000"
                placeholderTextColor={Colors.slateGray}
                value={monthlyDreamCost}
                onChangeText={setMonthlyDreamCost}
              />
            </View>
            <View style={styles.extraStepButtons}>
              <TouchableOpacity
                style={styles.skipLink}
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="Skip and finish quiz"
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.backgroundDeepNavy} />
                ) : (
                  <Text style={styles.submitButtonText}>Finish Setup →</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Financial Profile</Text>
        <Text style={styles.subtitle}>Help us personalize your experience</Text>
      </View>

      {!extraStep ? (
        <>
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
                accessibilityRole="radio"
                accessibilityLabel={option}
                accessibilityState={{ selected: answers[question.id] === option }}
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
                accessibilityRole="button"
                accessibilityLabel="Previous question"
              >
                <Text style={styles.navButtonText}>← Previous</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {currentQuestion < QUIZ_QUESTIONS.length - 1 && answers[question.id] && (
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => setCurrentQuestion((prev) => prev + 1)}
                accessibilityRole="button"
                accessibilityLabel="Next question"
              >
                <Text style={styles.navButtonText}>Next →</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        renderExtraStep()
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
  incomeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    marginBottom: Spacing.base,
  },
  incomeInput: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1.5,
    borderColor: Colors.graphiteBorder,
    borderRadius: 12,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  skipLink: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textDecorationLine: 'underline',
  },
  extraStepButtons: {
    gap: Spacing.sm,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: Typography.bodySmall,
  },
});
