// NetWorthChart — standard + luxury variants
// Standard: original gifted-charts presentation (bone/cream context)
// Luxury: single 1.5pt oxblood stroke on navy, no fill, no grid, no axis labels,
//         start/end annotations in stone, 700ms decel entry animation
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { colors, typography } from '../../theme/tokens';
import { formatCurrency } from '../../utils/formatters';
import type { NetWorthHistory } from '../../types';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function sortedValues(history: NetWorthHistory[]): { sorted: NetWorthHistory[]; values: number[] } {
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((h) => h.net_worth);
  return { sorted, values };
}

/** Build an SVG polyline path string from data values fitted to the view box */
function buildPath(values: number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const pad = { x: 0, y: 8 }; // small vertical inset so stroke isn't clipped

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad.y + (1 - (v - minVal) / range) * (height - pad.y * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return 'M ' + points.join(' L ');
}

// ─── Luxury variant ───────────────────────────────────────────────────────────

interface LuxuryChartProps {
  history: NetWorthHistory[];
  height: number;
}

function LuxuryChart({ history, height }: LuxuryChartProps) {
  const { values } = sortedValues(history);
  const width = Dimensions.get('window').width - 64; // paddingHorizontal: 32 × 2

  const first = values[0];
  const last = values[values.length - 1];

  const pathD = buildPath(values, width, height);

  // 700ms decel stroke animation: animate a clip-rect translateX from -width to 0
  // We use an Animated.Value controlling opacity of a masking overlay that slides away
  // (react-native-svg doesn't support SVG animateMotion directly, so we overlay a
  //  solid-navy rectangle that slides right to reveal the line beneath)
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset then animate
    revealAnim.setValue(0);
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: 700,
      // Approximate cubic-bezier(0.16, 1, 0.3, 1) with native Easing.out(Easing.exp)
      easing: (t: number) => 1 - Math.pow(1 - t, 4), // approx expo-out
      useNativeDriver: true,
    }).start();
  }, [history.length]);

  // The overlay slides from x=0 to x=width (left → right), revealing the path
  const overlayTranslateX = revealAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width + 2],
  });

  // Annotation text style
  const annotStyle = {
    fontFamily: typography.families.regular,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
    fontWeight: '400' as const,
    color: colors.stone,
  };

  return (
    <View style={{ width, height }}>
      {/* SVG line — no fill, no grid, no axis */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {pathD ? (
          <Path
            d={pathD}
            stroke={colors.oxblood}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>

      {/* Reveal overlay — navy rect slides right to expose the path */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          backgroundColor: colors.navy,
          transform: [{ translateX: overlayTranslateX }],
        }}
      />

      {/* Start value — bottom-left */}
      <View style={{ position: 'absolute', bottom: 0, left: 0 }}>
        <Text style={annotStyle}>{formatCurrency(first, { compact: true })}</Text>
      </View>

      {/* End value — bottom-right */}
      <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
        <Text style={[annotStyle, { textAlign: 'right' }]}>{formatCurrency(last, { compact: true })}</Text>
      </View>
    </View>
  );
}

// ─── Standard variant (preserved for non-home screens) ────────────────────────

// Lazy-import gifted-charts only when needed to avoid bundling cost in luxury path
let LineChartComponent: React.ComponentType<any> | null = null;

interface StandardChartProps {
  history: NetWorthHistory[];
  height: number;
  showIndicator?: boolean;
}

function StandardChart({ history, height, showIndicator = true }: StandardChartProps) {
  // Dynamically require — works fine at module eval time in RN
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LineChart } = require('react-native-gifted-charts');

  const { sorted, values } = sortedValues(history);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const isPositiveTrend = change >= 0;
  const lineColor = isPositiveTrend ? colors.oxblood : colors.oxblood;

  if (history.length === 1) {
    return (
      <View style={[styles.singlePoint, { height }]}>
        <Text style={styles.singleValue}>{formatCurrency(first)}</Text>
        <Text style={styles.emptyText}>Keep submitting EOD check-ins to see your trend</Text>
      </View>
    );
  }

  const data = sorted.map((h) => ({ value: h.net_worth, hideDataPoint: true }));
  const width = Dimensions.get('window').width - 64;

  return (
    <View style={styles.standardContainer}>
      {showIndicator && (
        <View style={styles.indicatorRow}>
          <Text style={[styles.indicatorArrow, { color: lineColor }]}>
            {isPositiveTrend ? '\u25B2' : '\u25BC'}
          </Text>
          <Text style={[styles.indicatorText, { color: lineColor }]}>
            {isPositiveTrend ? '+' : ''}{formatCurrency(change)} ({history.length} days)
          </Text>
        </View>
      )}
      <LineChart
        data={data}
        width={width}
        height={height}
        curved
        color={lineColor}
        thickness={2}
        startFillColor={`rgba(74,4,4,0.10)`}
        endFillColor="transparent"
        areaChart
        noOfSections={4}
        yAxisColor="transparent"
        xAxisColor="transparent"
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        backgroundColor={colors.cream}
        rulesColor="rgba(177,168,159,0.2)"
        rulesType="solid"
        hideDataPoints
        showVerticalLines={false}
        formatYLabel={(value: string) => formatCurrency(parseFloat(value), { compact: true })}
      />
    </View>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface NetWorthChartProps {
  history: NetWorthHistory[];
  height?: number;
  showIndicator?: boolean;
  /** 'luxury' = single oxblood stroke on navy, 700ms reveal. 'standard' = original. */
  variant?: 'luxury' | 'standard';
}

export function NetWorthChart({
  history,
  height = 200,
  showIndicator = true,
  variant = 'standard',
}: NetWorthChartProps) {
  if (!history || history.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Submit EOD check-ins to see your net worth trend</Text>
      </View>
    );
  }

  if (variant === 'luxury') {
    return <LuxuryChart history={history} height={height} />;
  }

  return <StandardChart history={history} height={height} showIndicator={showIndicator} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  standardContainer: {
    borderRadius: 4, // radius.lg
    overflow: 'hidden',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  indicatorArrow: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  indicatorText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.stone,
    textAlign: 'center',
  },
  singlePoint: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  singleValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 16,
    color: colors.oxblood,
  },
  axisText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: colors.stone,
  },
});
