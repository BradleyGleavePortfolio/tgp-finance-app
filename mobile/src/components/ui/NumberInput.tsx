// Currency/number input with formatting
import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

interface NumberInputProps {
  label?: string;
  value: string;
  onChangeValue: (value: string, numeric: number) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  error?: string;
  containerStyle?: ViewStyle;
  min?: number;
  max?: number;
  decimals?: number;
}

export function NumberInput({
  label,
  value,
  onChangeValue,
  prefix = '$',
  suffix,
  placeholder = '0.00',
  error,
  containerStyle,
  decimals = 2,
}: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (text: string) => {
    // Allow only digits and one decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    const numeric = parseFloat(formatted) || 0;
    onChangeValue(formatted, numeric);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.focused,
          !!error && styles.errorBorder,
        ]}
      >
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}

        <TextInput
          value={value}
          onChangeText={handleChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={Colors.slateGray}
          style={styles.input}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          returnKeyType="done"
        />

        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.base,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    borderRadius: BorderRadius.md,
    minHeight: 48,
  },
  focused: {
    borderColor: Colors.accentGold,
  },
  errorBorder: {
    borderColor: Colors.debtCrimson,
  },
  prefix: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
    paddingLeft: Spacing.base,
    paddingRight: Spacing.xs,
  },
  suffix: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    paddingRight: Spacing.base,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.base,
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    minHeight: 48,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.debtCrimson,
    marginTop: Spacing.xs,
  },
});
