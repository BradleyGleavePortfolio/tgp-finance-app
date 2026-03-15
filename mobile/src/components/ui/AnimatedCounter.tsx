// Number count-up animation — 300ms ease-out on update
import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, TextStyle } from 'react-native';
import { Colors, Typography } from '../../theme/finance';

interface AnimatedCounterProps {
  value: number;
  previousValue?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  duration?: number;
  decimals?: number;
  mono?: boolean;
}

export function AnimatedCounter({
  value,
  previousValue,
  prefix = '$',
  suffix = '',
  style,
  duration = 300,
  decimals = 0,
  mono = true,
}: AnimatedCounterProps) {
  const animatedValue = useRef(new Animated.Value(previousValue ?? value)).current;
  const displayValue = useRef(previousValue ?? value);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <AnimatedNumber
      animatedValue={animatedValue}
      prefix={prefix}
      suffix={suffix}
      style={style}
      decimals={decimals}
      mono={mono}
    />
  );
}

function AnimatedNumber({
  animatedValue,
  prefix,
  suffix,
  style,
  decimals,
  mono,
}: {
  animatedValue: Animated.Value;
  prefix: string;
  suffix: string;
  style?: TextStyle;
  decimals: number;
  mono: boolean;
}) {
  const [displayText, setDisplayText] = React.useState('');

  useEffect(() => {
    const listener = animatedValue.addListener(({ value }) => {
      const formatted = Math.abs(value).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const sign = value < 0 ? '-' : '';
      setDisplayText(`${sign}${prefix}${formatted}${suffix}`);
    });
    return () => animatedValue.removeListener(listener);
  }, []);

  return (
    <Text
      style={[
        mono ? styles.mono : styles.normal,
        style,
      ]}
    >
      {displayText || `${prefix}0${suffix}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.heroNumber,
    color: Colors.accentGold,
    textAlign: 'center',
  },
  normal: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.heroNumber,
    color: Colors.accentGold,
    textAlign: 'center',
  },
});
