import { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import type { DashboardDailySeriesPoint } from '../../types/inventory';

interface DailySeriesChartProps {
  series: DashboardDailySeriesPoint[];
}

const CHART_HEIGHT = 220;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 38;
const CHART_PADDING_LEFT = 42;
const CHART_PADDING_RIGHT = 8;

function formatQty(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function AnimatedBarSegment({
  x,
  y,
  width,
  height,
  fill,
  rx,
  index,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rx: number;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scaleAnim.setValue(0);
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 450,
      delay: index * 30,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [scaleAnim, index]);

  const animHeight = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });
  const animY = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [y + height, y],
  });

  return (
    <AnimatedRect
      x={x}
      y={animY}
      width={width}
      height={animHeight}
      fill={fill}
      rx={rx}
    />
  );
}

export function DailySeriesChart({ series }: DailySeriesChartProps) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 56);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const tooltipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selectedIndex !== null) {
      Animated.spring(tooltipAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
      }).start();
    } else {
      Animated.timing(tooltipAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedIndex, tooltipAnim]);

  const activeDays = useMemo(
    () => series.filter((d) => d.entryQuantity > 0 || d.exitQuantity > 0),
    [series],
  );

  if (activeDays.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Sem movimentações diárias neste período.</Text>
      </View>
    );
  }

  const plotWidth = chartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const barSpacing = 2;
  const barWidth = Math.max(4, Math.min(20, (plotWidth - barSpacing * activeDays.length) / activeDays.length));
  const totalBarsWidth = activeDays.length * (barWidth + barSpacing) - barSpacing;
  const offsetX = CHART_PADDING_LEFT + (plotWidth - totalBarsWidth) / 2;

  const maxTotal = activeDays.reduce((mx, d) => Math.max(mx, d.entryQuantity + d.exitQuantity), 0);
  const niceMax = maxTotal > 0 ? Math.ceil(maxTotal / 5) * 5 : 10;

  const yLabels = useMemo(() => {
    const steps = 5;
    const step = niceMax / steps;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(i * step));
  }, [niceMax]);

  const selectedDay = selectedIndex !== null ? activeDays[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {/* Tooltip */}
      {selectedDay ? (
        <Animated.View
          style={[
            styles.tooltip,
            {
              opacity: tooltipAnim,
              transform: [{ scale: tooltipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
        >
          <Text style={styles.tooltipDate}>Dia {selectedDay.dayLabel}</Text>
          <View style={styles.tooltipMetrics}>
            <View style={styles.tooltipMetricItem}>
              <View style={[styles.tooltipDot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.tooltipMetricText}>
                Entrada: {formatQty(selectedDay.entryQuantity)}
              </Text>
            </View>
            <View style={styles.tooltipMetricItem}>
              <View style={[styles.tooltipDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.tooltipMetricText}>
                Saída: {formatQty(selectedDay.exitQuantity)}
              </Text>
            </View>
          </View>
          <Text style={styles.tooltipTotal}>
            Total: {formatQty(selectedDay.movementTotal)}
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.tooltipPlaceholder}>
          <Text style={styles.tooltipHint}>Toque numa barra para ver o dia</Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.legendLabel}>Entrada</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendLabel}>Saída</Text>
        </View>
      </View>

      {/* Chart */}
      <View>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="entryGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#22C55E" stopOpacity="1" />
              <Stop offset="1" stopColor="#16A34A" stopOpacity="0.8" />
            </LinearGradient>
            <LinearGradient id="exitGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EF4444" stopOpacity="1" />
              <Stop offset="1" stopColor="#DC2626" stopOpacity="0.8" />
            </LinearGradient>
          </Defs>

          {/* Grid lines + Y labels */}
          {yLabels.map((val) => {
            const y = CHART_PADDING_TOP + plotHeight - (val / niceMax) * plotHeight;
            return (
              <Line
                key={`grid-${val}`}
                x1={CHART_PADDING_LEFT}
                y1={y}
                x2={chartWidth - CHART_PADDING_RIGHT}
                y2={y}
                stroke="#E8D5F5"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            );
          })}
          {yLabels.map((val) => {
            const y = CHART_PADDING_TOP + plotHeight - (val / niceMax) * plotHeight;
            return (
              <SvgText
                key={`ylabel-${val}`}
                x={CHART_PADDING_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fontWeight="700"
                fill="#77158E"
              >
                {val}
              </SvgText>
            );
          })}

          {/* Stacked bars */}
          {activeDays.map((day, i) => {
            const x = offsetX + i * (barWidth + barSpacing);
            const entryH = niceMax > 0 ? (day.entryQuantity / niceMax) * plotHeight : 0;
            const exitH = niceMax > 0 ? (day.exitQuantity / niceMax) * plotHeight : 0;
            const exitY = CHART_PADDING_TOP + plotHeight - exitH - entryH;
            const entryY = CHART_PADDING_TOP + plotHeight - entryH;
            const isSelected = selectedIndex === i;

            return (
              <Svg key={`bar-${day.date}`}>
                {/* Selected highlight */}
                {isSelected ? (
                  <Rect
                    x={x - 2}
                    y={CHART_PADDING_TOP}
                    width={barWidth + 4}
                    height={plotHeight}
                    fill="rgba(119, 21, 142, 0.06)"
                    rx={4}
                  />
                ) : null}

                {/* Exit bar (top) */}
                {day.exitQuantity > 0 ? (
                  <AnimatedBarSegment
                    x={x}
                    y={exitY}
                    width={barWidth}
                    height={exitH}
                    fill="url(#exitGrad)"
                    rx={Math.min(3, barWidth / 2)}
                    index={i}
                  />
                ) : null}

                {/* Entry bar (bottom) */}
                {day.entryQuantity > 0 ? (
                  <AnimatedBarSegment
                    x={x}
                    y={entryY}
                    width={barWidth}
                    height={entryH}
                    fill="url(#entryGrad)"
                    rx={Math.min(3, barWidth / 2)}
                    index={i}
                  />
                ) : null}
              </Svg>
            );
          })}

          {/* X labels — show every Nth */}
          {(() => {
            const step = Math.max(1, Math.ceil(activeDays.length / 10));
            return activeDays.map((day, i) => {
              if (i % step !== 0 && i !== activeDays.length - 1) return null;
              const x = offsetX + i * (barWidth + barSpacing) + barWidth / 2;
              return (
                <SvgText
                  key={`xlabel-${day.date}`}
                  x={x}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="700"
                  fill="#77158E"
                >
                  {day.dayLabel}
                </SvgText>
              );
            });
          })()}
        </Svg>

        {/* Touch overlay */}
        {activeDays.map((day, i) => {
          const x = offsetX + i * (barWidth + barSpacing);
          return (
            <Pressable
              key={`touch-${day.date}`}
              onPress={() => setSelectedIndex(selectedIndex === i ? null : i)}
              style={[
                styles.barTouchArea,
                {
                  left: x - barSpacing,
                  top: CHART_PADDING_TOP,
                  width: barWidth + barSpacing * 2,
                  height: plotHeight,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.xAxisLabel}>Dias do mês</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  tooltipDate: {
    color: '#F5EAFB',
    fontSize: 15,
    fontWeight: '800',
  },
  tooltipMetrics: {
    flexDirection: 'row',
    gap: 16,
  },
  tooltipMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tooltipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tooltipMetricText: {
    color: '#D8C3EA',
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipTotal: {
    color: '#EDE0F9',
    fontSize: 13,
    fontWeight: '800',
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
  legendRow: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F1175',
  },
  barTouchArea: {
    position: 'absolute',
  },
  xAxisLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#77158E',
  },
});
