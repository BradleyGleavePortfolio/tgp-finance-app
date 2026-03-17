import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { onboardingApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

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
      const { data: responseData } = await onboardingApi.submitQuiz(answers);
      const result = responseData;

      await refreshUser();

      if (result.nextStep) {
        router.replace(result.nextStep);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const question = QUIZ_QUESTIONS[currentQuestion];
  const allAnswered = Object.keys(answers).length === QUIZ_QUESTIONS.length;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Financial Profile Quiz</Text>
      <Text style={styles.progress}>
        Question {currentQuestion + 1} of {QUIZ_QUESTIONS.length}
      </Text>

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
            <Text style={styles.navButtonText}>Previous</Text>
          </TouchableOpacity>
        )}
        {currentQuestion < QUIZ_QUESTIONS.length - 1 && answers[question.id] && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentQuestion((prev) => prev + 1)}
          >
            <Text style={styles.navButtonText}>Next</Text>
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
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
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  progress: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  questionContainer: {
    marginBottom: 24,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  option: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  selectedOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 16,
  },
  selectedOptionText: {
    color: '#fff',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  navButton: {
    padding: 12,
  },
  navButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginTop: 12,
  },
});
