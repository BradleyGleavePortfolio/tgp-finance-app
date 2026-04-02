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

type OnboardingStep = 'quiz' | 'income' | 'dream_description' | 'dream_cost' | 'future_letter';

export default function QuizScreen() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyTakeHome, setMonthlyTakeHome] = useState('');
  const [step, setStep] = useState<OnboardingStep>('quiz');
  const [dreamDescription, setDreamDescription] = useState('');
  const [monthlyDreamCost, setMonthlyDreamCost] = useState('');
  const [futureSelfLetter, setFutureSelfLetter] = useState('');

  const handleAnswer = (questionId: string, answer: string) => {
    const updated = { ...answers, [questionId]: answer };
    setAnswers(updated);
    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else if (Object.keys(updated).length === QUIZ_QUESTIONS.length) {
      setStep('income');
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
      finalAnswers.dream_description = dreamDescription || undefined as any;
      finalAnswers.monthly_dream_cost = monthlyDreamCost || undefined as any;
      finalAnswers.future_self_letter = futureSelfLetter || undefined as any;
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

  const totalSteps = QUIZ_QUESTIONS.length + 4; // 4 MC + income + dream desc + dream cost + future letter
  const currentStepNumber =
    step === 'quiz' ? currentQuestion + 1 :
    step === 'income' ? QUIZ_QUESTIONS.length + 1 :
    step === 'dream_description' ? QUIZ_QUESTIONS.length + 2 :
    step === 'dream_cost' ? QUIZ_QUESTIONS.length + 3 :
    totalSteps;

  const question = QUIZ_QUESTIONS[currentQuestion];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Financial Profile</Text>
        <Text style={styles.subtitle}>Help us personalize your experience</Text>
      </View>

      <Text style={styles.progress}>
        Step {currentStepNumber} of {totalSteps}
      </Text>

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < currentStepNumber ? styles.dotCompleted : null,
              i === currentStepNumber - 1 ? styles.dotActive : null,
            ]}
          />
        ))}
      </View>

      {step === 'quiz' && (
        <>
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
        </>
      )}

      {step === 'income' && (
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
              onPress={() => setStep('dream_description')}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => setStep('dream_description')}
          >
            <Text style={styles.submitButtonText}>Continue →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'dream_description' && (
        <>
          <View style={styles.questionContainer}>
            <Text style={styles.question}>Describe your dream lifestyle</Text>
            <Text style={styles.incomeSubtitle}>
              In 3 sentences, paint the picture. Where do you live? What does your day look like?
            </Text>
            <TextInput
              style={[styles.incomeInput, styles.multilineInput]}
              multiline
              numberOfLines={4}
              placeholder="e.g. I live on the beach in Portugal, working 4 hours a day on projects I love. I travel monthly, eat well, and never check my bank account with worry..."
              placeholderTextColor={Colors.slateGray}
              value={dreamDescription}
              onChangeText={setDreamDescription}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.skipLink}
              onPress={() => setStep('dream_cost')}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => setStep('dream_cost')}
          >
            <Text style={styles.submitButtonText}>Continue →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'dream_cost' && (
        <>
          <View style={styles.questionContainer}>
            <Text style={styles.question}>What would that lifestyle cost per month?</Text>
            <Text style={styles.incomeSubtitle}>
              Be honest — this sets your real Financial Independence target
            </Text>
            <TextInput
              style={styles.incomeInput}
              keyboardType="numeric"
              placeholder="e.g. 15000"
              placeholderTextColor={Colors.slateGray}
              value={monthlyDreamCost}
              onChangeText={setMonthlyDreamCost}
            />
            <TouchableOpacity
              style={styles.skipLink}
              onPress={() => setStep('future_letter')}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => setStep('future_letter')}
          >
            <Text style={styles.submitButtonText}>Continue →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'future_letter' && (
        <>
          <View style={styles.questionContainer}>
            <Text style={styles.question}>Write a letter to your future self</Text>
            <Text style={styles.incomeSubtitle}>
              You'll open this in 90 days. Tell future-you what you're feeling right now and what you hope to achieve.
            </Text>
            <TextInput
              style={[styles.incomeInput, styles.letterInput]}
              multiline
              numberOfLines={6}
              placeholder="Dear future me..."
              placeholderTextColor={Colors.slateGray}
              value={futureSelfLetter}
              onChangeText={setFutureSelfLetter}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.skipLink}
              onPress={handleSubmit}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.backgroundDeepNavy} />
            ) : (
              <Text style={styles.submitButtonText}>Finish →</Text>
            )}
          </TouchableOpacity>
        </>
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
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  letterInput: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: 'Inter_400Regular',
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: Typography.bodySmall,
  },
});
