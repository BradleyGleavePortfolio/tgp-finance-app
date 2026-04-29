// Text input with validation for The Growth Project: Finance
import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  secureToggle?: boolean;
  leftIcon?: IoniconsName;
  rightIcon?: IoniconsName;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  secureToggle = false,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  ...props
}: InputProps) {
  const [isSecure, setIsSecure] = useState(props.secureTextEntry || false);
  const [isFocused, setIsFocused] = useState(false);

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
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={Colors.slateGray}
            style={styles.leftIcon}
          />
        )}

        <TextInput
          {...props}
          secureTextEntry={secureToggle ? isSecure : props.secureTextEntry}
          style={[styles.input, leftIcon ? styles.inputWithLeft : null]}
          placeholderTextColor={Colors.slateGray}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          accessibilityLabel={props.accessibilityLabel || label || (typeof props.placeholder === 'string' ? props.placeholder : undefined)}
          accessibilityHint={error || props.accessibilityHint}
        />

        {secureToggle && (
          <TouchableOpacity
            onPress={() => setIsSecure(!isSecure)}
            style={styles.rightIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={isSecure ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={Colors.slateGray}
            />
          </TouchableOpacity>
        )}

        {rightIcon && !secureToggle && (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={styles.rightIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`${label || 'Input'} action`}
          >
            <Ionicons name={rightIcon} size={18} color={Colors.slateGray} />
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
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
    height: 52,
    maxHeight: 52,
  },
  focused: {
    borderColor: Colors.accentGold,
  },
  errorBorder: {
    borderColor: Colors.debtCrimson,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: 0,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    height: 50,
  },
  inputWithLeft: {
    paddingLeft: Spacing.xs,
  },
  leftIcon: {
    marginLeft: Spacing.base,
  },
  rightIconBtn: {
    paddingHorizontal: Spacing.base,
    height: '100%',
    justifyContent: 'center',
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.debtCrimson,
    marginTop: Spacing.xs,
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    marginTop: Spacing.xs,
  },
});
