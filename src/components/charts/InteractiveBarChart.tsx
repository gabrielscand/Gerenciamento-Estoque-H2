import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Easing } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Text as SvgText } from 'react-native-svg';
import { tokens } from '../../theme/tokens';

export interface BarChartDataPoint {
  id: number | string;
  label: string;
  value: number;
  unit: string;
}

interface InteractiveBarChartProps {
  data: BarChartDataPoint[];
  title?: string;
  accentFrom?: string;
  accentTo?: string;
  emptyMessage?: string;
  maxBars?: number;
}

const BAR_HEIGHT = 36;
const BAR_GAP = 10;
const LABEL_WIDTH = 90;
const VALUE_WIDTH = 60;
const CHART_PADDING_H = 4;

function formatQty(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function AnimatedBar({
  index,
  widthPercent,
  y,
  maxBarWidth,
  gradientId,
}: {
  index: number;
  widthPercent: number;
  y: number;
  maxBarWidth: number;
  gradientId: string;
}) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 500,
      delay: index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animValue, index]);

  const barWidth = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(6, (widthPercent / 100) * maxBarWidth)],
  });

  const AnimatedRect = Animated.createAnimatedComponent(Rect);

  return (
    <AnimatedRect
      x={0}
      y={y}
      width={barWidth}
      height={BAR_HEIGHT - 4}
      rx={8}
      ry={8}
      fill={`url(#${gradientId})`}
    />
  );
}

export function InteractiveBarChart({
  data,
  title,
  accentFrom = '#9B30FF',
  accentTo = '#5B21B6',
  emptyMessage = 'Sem dados para exibir.',
  maxBars = 6,
}: InteractiveBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.9)).current;

  const items = data.slice(0, maxBars);
  const maxVal = items.reduce((mx, item) => Math.max(mx, item.value), 0);
  const totalVal = items.reduce((sum, item) => sum + item.value, 0);

  useEffect(() => {
    if (selectedIndex !== null) {
      Animated.parallel([
        Animated.spring(tooltipOpacity, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
        }),
        Animated.spring(tooltipScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
        }),
      ]).start();
    } else {
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
      tooltipScale.setValue(0.9);
    }
  }, [selectedIndex, tooltipOpacity, tooltipScale]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const svgHeight = items.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + 8;
  const gradientId = `barGrad-${title?.replace(/\s/g, '') ?? 'default'}`;
  const selectedItem = selectedIndex !== null ? items[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      {selectedItem ? (
        <Animated.View
          style={[
            styles.tooltip,
            {
              opacity: tooltipOpacity,
              transform: [{ scale: tooltipScale }],
            },
          ]}
        >
          <Text style={styles.tooltipName}>{selectedItem.label}</Text>
          <Text style={styles.tooltipDetail}>
            {formatQty(selectedItem.value)} {selectedItem.unit}
            {'  ·  '}
            {totalVal > 0 ? ((selectedItem.value / totalVal) * 100).toFixed(1) : '0'}% do total
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.tooltipPlaceholder}>
          <Text style={styles.tooltipHint}>Toque numa barra para ver detalhes</Text>
        </View>
      )}

      <View style={styles.chartRow}>
        <View style={styles.labels}>
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedIndex(selectedIndex === i ? null : i)}
              style={[styles.labelRow, { height: BAR_HEIGHT, marginBottom: i < items.length - 1 ? BAR_GAP : 0 }]}
            >
              <Text
                style={[
                  styles.labelText,
                  selectedIndex === i ? styles.labelTextActive : undefined,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1, paddingHorizontal: CHART_PADDING_H }}>
          <Svg width="100%" height={svgHeight}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={accentFrom} stopOpacity="1" />
                <Stop offset="1" stopColor={accentTo} stopOpacity="0.85" />
              </LinearGradient>
            </Defs>
            {items.map((item, i) => {
              const widthPercent = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
              const y = i * (BAR_HEIGHT + BAR_GAP) + 2;
              return (
                <AnimatedBar
                  key={item.id}
                  index={i}
                  widthPercent={widthPercent}
                  y={y}
                  maxBarWidth={280}
                  gradientId={gradientId}
                />
              );
            })}
          </Svg>

          {items.map((item, i) => {
            const y = i * (BAR_HEIGHT + BAR_GAP);
            return (
              <Pressable
                key={`touch-${item.id}`}
                onPress={() => setSelectedIndex(selectedIndex === i ? null : i)}
                style={[
                  styles.barTouchArea,
                  { top: y, height: BAR_HEIGHT },
                  selectedIndex === i ? styles.barTouchAreaActive : undefined,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.values}>
          {items.map((item, i) => (
            <View
              key={item.id}
              style={[styles.valueRow, { height: BAR_HEIGHT, marginBottom: i < items.length - 1 ? BAR_GAP : 0 }]}
            >
              <Text style={styles.valueText}>{formatQty(item.value)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3A0D49',
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#77158E',
    fontSize: 13,
    textAlign: 'center',
  },
  tooltip: {
    backgroundColor: '#2A0834',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  tooltipName: {
    color: '#F5EAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  tooltipDetail: {
    color: '#D8C3EA',
    fontSize: 12,
    fontWeight: '600',
  },
  tooltipPlaceholder: {
    backgroundColor: '#F5EEFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8C3EA',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tooltipHint: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labels: {
    width: LABEL_WIDTH,
  },
  labelRow: {
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F1175',
  },
  labelTextActive: {
    color: '#2A0834',
    fontWeight: '800',
  },
  values: {
    width: VALUE_WIDTH,
    alignItems: 'flex-end',
  },
  valueRow: {
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0D49',
  },
  barTouchArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 8,
  },
  barTouchAreaActive: {
    backgroundColor: 'rgba(119, 21, 142, 0.06)',
  },
});
