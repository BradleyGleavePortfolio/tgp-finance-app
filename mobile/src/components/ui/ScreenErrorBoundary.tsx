// Per-screen error boundary — catches crashes and renders a quiet recovery
// surface. Colours come from the canonical token set so the boundary
// doesn't leak the legacy dark-navy / amber palette into a luxury build.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';

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
    console.warn(
      `[ScreenErrorBoundary] ${screen} crashed:`,
      error?.message,
      errorInfo?.componentStack?.slice(0, 500),
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
          <Text style={styles.title}>
            {this.props.screenName
              ? `The ${this.props.screenName} screen hit an issue.`
              : 'This screen hit an issue.'}
          </Text>
          <Text style={styles.subtitle}>
            The rest of the app is unaffected. Try again, or come back to the
            screen in a moment.
          </Text>
          {__DEV__ && (
            <Text style={styles.debug} numberOfLines={4}>
              {this.state.error}
            </Text>
          )}
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
          {this.state.errorCount >= 2 && (
            <Text style={styles.hint}>
              If this keeps happening, close and reopen the app.
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
    backgroundColor: colors.bone,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  eyebrow: {
    fontFamily: typography.families.medium,
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: colors.stone,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: typography.families.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: typography.families.regular,
    fontSize: 14,
    color: colors.charcoal,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
    maxWidth: 320,
  },
  debug: {
    fontFamily: typography.families.mono,
    fontSize: 11,
    color: colors.charcoal,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.base,
    opacity: 0.6,
  },
  retryBtn: {
    backgroundColor: colors.oxblood,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: 14,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  retryText: {
    fontFamily: typography.families.semiBold,
    fontSize: 16,
    color: colors.bone,
  },
  hint: {
    fontFamily: typography.families.regular,
    fontSize: 12,
    color: colors.stone,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
