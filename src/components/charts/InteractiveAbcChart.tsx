import { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Circle,
  Line,
  Text as SvgText,
  Rect,
} from 'react-native-svg';
import type { DashboardAbcPoint } from '../../types/inventory';

interface InteractiveAbcChartProps {
  points: DashboardAbcPoint[];
  metricLabel: string;
}

const CHART_HEIGHT = 220;
const CHART_PADDING_TOP = 22;
const CHART_PADDING_BOTTOM = 32;
const CHART_PADDING_LEFT = 42;
const CHART_PADDING_RIGHT = 16;
const DOT_RADIUS = 5;
const DOT_TOUCH_RADIUS = 18;

function formatQty(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function buildLinePath(
  coords: { x: number; y: number }[],
  smooth = true,
): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  if (!smooth || coords.length < 3) {
    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      d += ` L ${coords[i].x} ${coords[i].y}`;
    }
    return d;
  }

  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cpx = (curr.x + next.x) / 2;
    d += ` C ${cpx} ${curr.y}, ${cpx} ${next.y}, ${next.x} ${next.y}`;
  }
  return d;
}

function buildAreaPath(
  coords: { x: number; y: number }[],
  bottomY: number,
  smooth = true,
): string {
  if (coords.length === 0) return '';
  const linePath = buildLinePath(coords, smooth);
  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  return `${linePath} L ${lastCoord.x} ${bottomY} L ${firstCoord.x} ${bottomY} Z`;
}

const CLASS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  B: { bg: '#FEF9C3', text: '#A16207', border: '#FDE047' },
  C: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
};

export function InteractiveAbcChart({ points, metricLabel }: InteractiveAbcChartProps) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 56);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    lineAnim.setValue(0);
    Animated.timing(lineAnim, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [points.length, lineAnim]);

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

  const plotWidth = chartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: CHART_PADDING_LEFT + (points.length > 1 ? (i / (points.length - 1)) * plotWidth : plotWidth / 2),
        y: CHART_PADDING_TOP + plotHeight - (p.cumulativePercent / 100) * plotHeight,
      })),
    [points, plotWidth, plotHeight],
  );

  const linePath = useMemo(() => buildLinePath(coords, true), [coords]);
  const areaPath = useMemo(
    () => buildAreaPath(coords, CHART_PADDING_TOP + plotHeight, true),
    [coords, plotHeight],
  );

  const yForPercent = (pct: number) =>
    CHART_PADDING_TOP + plotHeight - (pct / 100) * plotHeight;

  const yLabels = [0, 20, 40, 60, 80, 100];
  const selectedPoint = selectedIndex !== null ? points[selectedIndex] : null;
  const selectedCoord = selectedIndex !== null ? coords[selectedIndex] : null;
  const classInfo = selectedPoint ? CLASS_COLORS[selectedPoint.abcClass] : null;

  if (points.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Sem dados de {metricLabel} para este período.</Text>
      </View>
    );
  }

  // Compute ABC distribution for legend
  const classA = points.filter((p) => p.abcClass === 'A').length;
  const classB = points.filter((p) => p.abcClass === 'B').length;
  const classC = points.filter((p) => p.abcClass === 'C').length;

  return (
    <View style={styles.container}>
      {/* Tooltip Area */}
      {selectedPoint && classInfo ? (
        <Animated.View
          style={[
            styles.tooltip,
            {
              opacity: tooltipAnim,
              transform: [{ scale: tooltipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
        >
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipRank}>#{selectedPoint.rank}</Text>
            <View style={[styles.classBadge, { backgroundColor: classInfo.bg, borderColor: classInfo.border }]}>
              <Text style={[styles.classBadgeText, { color: classInfo.text }]}>Classe {selectedPoint.abcClass}</Text>
            </View>
          </View>
          <Text style={styles.tooltipName}>{selectedPoint.name}</Text>
          <Text style={styles.tooltipDetail}>
            {metricLabel}: {formatQty(selectedPoint.metricValue)} {selectedPoint.unit}
          </Text>
          <Text style={styles.tooltipDetail}>
            Participação: {selectedPoint.sharePercent.toFixed(1)}% · Acumulado: {selectedPoint.cumulativePercent.toFixed(1)}%
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.tooltipPlaceholder}>
          <Text style={styles.tooltipHint}>Toque num ponto da curva para ver detalhes</Text>
        </View>
      )}

      {/* ABC Class Distribution Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#15803D' }]} />
          <Text style={styles.legendLabel}>A: {classA} itens (≤80%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#A16207' }]} />
          <Text style={styles.legendLabel}>B: {classB} itens (≤95%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
          <Text style={styles.legendLabel}>C: {classC} itens (&gt;95%)</Text>
        </View>
      </View>

      {/* SVG Chart */}
      <View>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="abcAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#7C3AED" stopOpacity="0.25" />
              <Stop offset="1" stopColor="#7C3AED" stopOpacity="0.03" />
            </LinearGradient>
            <LinearGradient id="abcLineGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#9B30FF" stopOpacity="1" />
              <Stop offset="1" stopColor="#5B21B6" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Y axis labels + grid lines */}
          {yLabels.map((pct) => {
            const y = yForPercent(pct);
            return (
              <Line
                key={`grid-${pct}`}
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
          {yLabels.map((pct) => (
            <SvgText
              key={`ylabel-${pct}`}
              x={CHART_PADDING_LEFT - 6}
              y={yForPercent(pct) + 4}
              textAnchor="end"
              fontSize={10}
              fontWeight="700"
              fill="#77158E"
            >
              {pct}%
            </SvgText>
          ))}

          {/* Reference lines at 80% and 95% */}
          <Line
            x1={CHART_PADDING_LEFT}
            y1={yForPercent(80)}
            x2={chartWidth - CHART_PADDING_RIGHT}
            y2={yForPercent(80)}
            stroke="#22C55E"
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          <Rect
            x={chartWidth - CHART_PADDING_RIGHT - 36}
            y={yForPercent(80) - 9}
            width={36}
            height={16}
            rx={4}
            fill="#DCFCE7"
          />
          <SvgText
            x={chartWidth - CHART_PADDING_RIGHT - 18}
            y={yForPercent(80) + 4}
            textAnchor="middle"
            fontSize={9}
            fontWeight="800"
            fill="#15803D"
          >
            A 80%
          </SvgText>

          <Line
            x1={CHART_PADDING_LEFT}
            y1={yForPercent(95)}
            x2={chartWidth - CHART_PADDING_RIGHT}
            y2={yForPercent(95)}
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          <Rect
            x={chartWidth - CHART_PADDING_RIGHT - 36}
            y={yForPercent(95) - 9}
            width={36}
            height={16}
            rx={4}
            fill="#FEE2E2"
          />
          <SvgText
            x={chartWidth - CHART_PADDING_RIGHT - 18}
            y={yForPercent(95) + 4}
            textAnchor="middle"
            fontSize={9}
            fontWeight="800"
            fill="#DC2626"
          >
            B 95%
          </SvgText>

          {/* Area fill */}
          <Path d={areaPath} fill="url(#abcAreaGrad)" />

          {/* The line */}
          <Path
            d={linePath}
            fill="none"
            stroke="url(#abcLineGrad)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {coords.map((c, i) => {
            const point = points[i];
            const isSelected = selectedIndex === i;
            const dotColor = point.abcClass === 'A' ? '#15803D' : point.abcClass === 'B' ? '#A16207' : '#DC2626';
            return (
              <Circle
                key={`dot-${point.itemId}`}
                cx={c.x}
                cy={c.y}
                r={isSelected ? DOT_RADIUS + 3 : DOT_RADIUS}
                fill={isSelected ? dotColor : '#7C3AED'}
                stroke="#FFFFFF"
                strokeWidth={isSelected ? 3 : 2}
              />
            );
          })}

          {/* X axis — rank labels (every Nth) */}
          {(() => {
            const step = Math.max(1, Math.ceil(points.length / 8));
            return coords.map((c, i) => {
              if (i % step !== 0 && i !== coords.length - 1) return null;
              return (
                <SvgText
                  key={`xlabel-${i}`}
                  x={c.x}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="700"
                  fill="#77158E"
                >
                  {points[i].rank}
                </SvgText>
              );
            });
          })()}

          {/* Selected dot highlight ring */}
          {selectedCoord ? (
            <Circle
              cx={selectedCoord.x}
              cy={selectedCoord.y}
              r={DOT_RADIUS + 8}
              fill="none"
              stroke="#7C3AED"
              strokeWidth={2}
              strokeOpacity={0.3}
            />
          ) : null}
        </Svg>

        {/* Touch targets overlay */}
        {coords.map((c, i) => (
          <Pressable
            key={`touch-${points[i].itemId}`}
            onPress={() => setSelectedIndex(selectedIndex === i ? null : i)}
            style={[
              styles.dotTouchArea,
              {
                left: c.x - DOT_TOUCH_RADIUS,
                top: c.y - DOT_TOUCH_RADIUS,
                width: DOT_TOUCH_RADIUS * 2,
                height: DOT_TOUCH_RADIUS * 2,
              },
            ]}
          />
        ))}
      </View>

      {/* X axis label */}
      <Text style={styles.xAxisLabel}>Ranking dos itens (por {metricLabel.toLowerCase()})</Text>
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
    gap: 4,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tooltipRank: {
    color: '#D8C3EA',
    fontSize: 13,
    fontWeight: '800',
  },
  classBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  tooltipName: {
    color: '#F5EAFB',
    fontSize: 15,
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
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F1175',
  },
  dotTouchArea: {
    position: 'absolute',
    borderRadius: DOT_TOUCH_RADIUS,
  },
  xAxisLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#77158E',
  },
});
