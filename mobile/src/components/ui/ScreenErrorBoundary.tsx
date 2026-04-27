// Per-screen error boundary — catches crashes and shows recovery UI
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  children: React.ReactNode;
  screenName?: string;
  fallback?: React.ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: string;
  errorCount: number;
}

export class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '', errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const screen = this.props.screenName || 'Unknown';
    // Diagnostic for a real issue: preserved across builds so Sentry/native log capture can pick it up.
    console.warn(
      `[ScreenErrorBoundary] ${screen} crashed:`,
      error?.message,
      errorInfo?.componentStack?.slice(0, 500)
    );
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: '',
      errorCount: prev.errorCount + 1,
    }));
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <Text style={styles.eyebrow}>SOMETHING WENT WRONG</Text>
          <Text style={styles.title}>This screen hit an issue.</Text>
          <Text style={styles.subtitle}>
            {this.props.screenName
              ? `The ${this.props.screenName} screen hit an issue.`
              : 'This screen hit an issue.'}
          </Text>
          {__DEV__ && (
            <Text style={styles.debug} numberOfLines={4}>
              {this.state.error}
            </Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
          {this.state.errorCount >= 2 && (
            <Text style={styles.hint}>
              If this keeps happening, try closing and reopening the app.
            </Text>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: '#8895A7',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#F9C74F',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#8895A7',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  debug: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 11,
    color: '#F97066',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  retryBtn: {
    backgroundColor: '#F9C74F',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4, // radius.lg
    marginBottom: 12,
  },
  retryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#0D1117',
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#5A6577',
    textAlign: 'center',
    marginTop: 8,
  },
});
