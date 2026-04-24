import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  VictoryArea,
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryStack,
} from 'victory-native';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { useTopPopup } from '../components/TopPopupProvider';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import { getDashboardAnalytics } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import type {
  DashboardAbcClass,
  DashboardAbcMetric,
  DashboardAbcPoint,
  DashboardAnalyticsData,
  DashboardItemAnalyticsRow,
} from '../types/inventory';
import { formatMonthLabel, getCurrentMonthString } from '../utils/date';
import { formatOriginalAndBaseQuantity } from '../utils/unit-conversion';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactQuantity(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `${formatQuantity(value / 1000000)} mi`;
  }

  if (Math.abs(value) >= 1000) {
    return `${formatQuantity(value / 1000)} mil`;
  }

  return formatQuantity(value);
}

function buildRecentMonthOptions(referenceDate: Date = new Date(), totalMonths: number = 12): string[] {
  const months: string[] = [];

  for (let index = 0; index < totalMonths; index += 1) {
    const baseDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - index, 1);
    months.push(getCurrentMonthString(baseDate));
  }

  return months;
}

function getMetricLabel(metric: DashboardAbcMetric): string {
  if (metric === 'entry') {
    return 'Entrada';
  }

  if (metric === 'exit') {
    return 'Saida';
  }

  return 'Entrada + Saida';
}

function getMetricValue(item: DashboardItemAnalyticsRow, metric: DashboardAbcMetric): number {
  if (metric === 'entry') {
    return item.entryQuantityInBaseUnits;
  }

  if (metric === 'exit') {
    return item.exitQuantityInBaseUnits;
  }

  return item.movementTotalInBaseUnits;
}

function getMetricValueOriginal(
  item: Pick<DashboardItemAnalyticsRow, 'entryQuantity' | 'exitQuantity' | 'movementTotal'>,
  metric: DashboardAbcMetric,
): number {
  if (metric === 'entry') {
    return item.entryQuantity;
  }

  if (metric === 'exit') {
    return item.exitQuantity;
  }

  return item.movementTotal;
}

function classifyAbc(cumulativePercent: number): DashboardAbcClass {
  if (cumulativePercent <= 80) {
    return 'A';
  }

  if (cumulativePercent <= 95) {
    return 'B';
  }

  return 'C';
}

function buildAbcPoints(
  items: DashboardItemAnalyticsRow[],
  metric: DashboardAbcMetric,
): DashboardAbcPoint[] {
  const sorted = items
    .filter((item) => getMetricValue(item, metric) > 0)
    .sort(
      (left, right) =>
        getMetricValue(right, metric) - getMetricValue(left, metric) ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
    );

  if (sorted.length === 0) {
    return [];
  }

  const total = sorted.reduce((sum, item) => sum + getMetricValue(item, metric), 0);

  if (total <= 0) {
    return [];
  }

  let cumulativePercent = 0;

  return sorted.map((item, index) => {
    const metricValue = getMetricValue(item, metric);
    const sharePercent = (metricValue / total) * 100;
    cumulativePercent += sharePercent;
    const normalizedCumulative = Math.min(cumulativePercent, 100);

    return {
      rank: index + 1,
      itemId: item.itemId,
      name: item.name,
      unit: item.unit,
      conversionFactor: item.conversionFactor,
      entryQuantity: item.entryQuantity,
      entryQuantityInBaseUnits: item.entryQuantityInBaseUnits,
      exitQuantity: item.exitQuantity,
      exitQuantityInBaseUnits: item.exitQuantityInBaseUnits,
      movementTotal: item.movementTotal,
      movementTotalInBaseUnits: item.movementTotalInBaseUnits,
      metricValue,
      sharePercent,
      cumulativePercent: normalizedCumulative,
      abcClass: classifyAbc(normalizedCumulative),
    };
  });
}

type DashboardChartInfoKey = 'abcCurve' | 'topEntries' | 'topExits' | 'dailySeries';

const DASHBOARD_CHART_INFO_CONTENT: Record<DashboardChartInfoKey, { title: string; description: string }> = {
  abcCurve: {
    title: 'Curva ABC',
    description:
      'Mostra a participacao acumulada dos itens no periodo. Classe A concentra os itens mais relevantes (ate 80%), B ate 95% e C os demais.',
  },
  topEntries: {
    title: 'Itens mais comprados no mes',
    description:
      'Ranking dos itens com maior entrada no mes selecionado. As quantidades do grafico usam a base convertida em unidades.',
  },
  topExits: {
    title: 'Itens que mais sairam no mes',
    description:
      'Ranking dos itens com maior saida no mes selecionado. Ajuda a identificar os produtos de maior giro.',
  },
  dailySeries: {
    title: 'Movimentacao diaria',
    description:
      'Mostra entradas e saidas por dia no mes selecionado, usando a quantidade convertida para unidades.',
  },
};

const ENTRY_COLOR = '#25A55F';
const ENTRY_SOFT = '#DFF6E9';
const EXIT_COLOR = '#D64545';
const EXIT_SOFT = '#FDEAEA';
const ACCENT_COLOR = tokens.colors.accent;
const ACCENT_DARK = tokens.colors.accentDeep;
const GRID_COLOR = '#E9D8F3';

function ChartCardHeader({
  title,
  eyebrow,
  onPressInfo,
}: {
  title: string;
  eyebrow?: string;
  onPressInfo: () => void;
}) {
  return (
    <View style={styles.chartHeaderRow}>
      <View style={styles.chartTitleBlock}>
        {eyebrow ? <Text style={styles.chartEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Pressable
        onPress={onPressInfo}
        style={({ pressed }) => [styles.chartInfoButton, pressed ? styles.chartInfoButtonPressed : undefined]}
        hitSlop={8}
      >
        <Text style={styles.chartInfoButtonText}>i</Text>
      </Pressable>
    </View>
  );
}

function ControlSegment<T extends string>({
  title,
  options,
  value,
  onChange,
  onBeforeChange,
}: {
  title: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  onBeforeChange?: () => void;
}) {
  function handleChange(nextValue: T) {
    onBeforeChange?.();
    onChange(nextValue);
  }

  return (
    <View style={styles.controlSegment}>
      <Text style={styles.controlLabel}>{title}</Text>
      <View style={styles.segmentButtons}>
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.segmentButton,
                isActive ? styles.segmentButtonActive : undefined,
                pressed ? styles.segmentButtonPressed : undefined,
              ]}
              onPress={() => handleChange(option.value)}
            >
              <Text
                pointerEvents="none"
                style={[styles.segmentButtonText, isActive ? styles.segmentButtonTextActive : undefined]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function InsightCard({
  label,
  value,
  detail,
  tone = 'accent',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'accent' | 'entry' | 'exit' | 'neutral';
}) {
  return (
    <View style={[styles.insightCard, styles[`insightCard_${tone}`]]}>
      <View style={[styles.insightMarker, styles[`insightMarker_${tone}`]]} />
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightValue}>{value}</Text>
      <Text style={styles.insightDetail}>{detail}</Text>
    </View>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={styles.emptyChart}>
      <Text style={styles.emptyChartTitle}>Sem dados para este grafico</Text>
      <Text style={styles.emptyChartText}>{message}</Text>
    </View>
  );
}

function DailyMovementChart({
  data,
  width,
  chartKey,
}: {
  data: DashboardAnalyticsData['dailySeries'];
  width: number;
  chartKey: string;
}) {
  const activeDays = data.filter((point) => point.entryQuantityInBaseUnits > 0 || point.exitQuantityInBaseUnits > 0);

  if (activeDays.length === 0) {
    return <EmptyChart message="Registre entradas ou saidas para visualizar o movimento diario." />;
  }

  const chartData = activeDays.map((point) => ({
    x: point.dayLabel,
    entry: point.entryQuantityInBaseUnits,
    exit: point.exitQuantityInBaseUnits,
  }));
  const tickStep = Math.max(1, Math.ceil(chartData.length / 8));
  const tickValues = chartData
    .filter((_, index) => index % tickStep === 0 || index === chartData.length - 1)
    .map((point) => point.x);

  return (
    <View style={styles.chartCanvas}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: ENTRY_COLOR }]} />
          <Text style={styles.legendLabel}>Entrada</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: EXIT_COLOR }]} />
          <Text style={styles.legendLabel}>Saida</Text>
        </View>
      </View>
      <VictoryChart
        key={chartKey}
        width={width}
        height={280}
        padding={{ top: 22, right: 28, bottom: 42, left: 58 }}
        domainPadding={{ x: 14, y: 18 }}
      >
        <VictoryAxis
          tickValues={tickValues}
          style={{
            axis: { stroke: GRID_COLOR },
            tickLabels: { fill: '#6B5177', fontSize: 10, fontWeight: 700 },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(tick) => formatCompactQuantity(Number(tick))}
          style={{
            axis: { stroke: 'transparent' },
            grid: { stroke: GRID_COLOR, strokeDasharray: '5,5' },
            tickLabels: { fill: '#6B5177', fontSize: 10, fontWeight: 700, padding: 6 },
          }}
        />
        <VictoryStack>
          <VictoryBar
            data={chartData}
            x="x"
            y="entry"
            cornerRadius={{ top: 5, bottom: 5 }}
            style={{ data: { fill: ENTRY_COLOR, width: 12 } }}
            animate={{ duration: 450, onLoad: { duration: 450 } }}
          />
          <VictoryBar
            data={chartData}
            x="x"
            y="exit"
            cornerRadius={{ top: 5, bottom: 5 }}
            style={{ data: { fill: EXIT_COLOR, width: 12 } }}
            animate={{ duration: 450, onLoad: { duration: 450 } }}
          />
        </VictoryStack>
      </VictoryChart>
    </View>
  );
}

function RankingChart({
  items,
  metric,
  color,
  softColor,
  width,
  emptyMessage,
  chartKey,
  showOriginalUnitDetails = true,
}: {
  items: DashboardItemAnalyticsRow[];
  metric: 'entry' | 'exit';
  color: string;
  softColor: string;
  width: number;
  emptyMessage: string;
  chartKey: string;
  showOriginalUnitDetails?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyChart message={emptyMessage} />;
  }

  const chartItems = items.slice(0, 6).reverse();
  const chartData = chartItems.map((item) => ({
    x: item.name.length > 18 ? `${item.name.slice(0, 16)}...` : item.name,
    y: metric === 'entry' ? item.entryQuantityInBaseUnits : item.exitQuantityInBaseUnits,
  }));

  return (
    <View style={styles.chartCanvas}>
      <VictoryChart
        key={chartKey}
        horizontal
        width={width}
        height={Math.max(230, chartData.length * 46)}
        padding={{ top: 14, right: 52, bottom: 34, left: 116 }}
        domainPadding={{ x: 18, y: 20 }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: 'transparent' },
            grid: { stroke: 'transparent' },
            tickLabels: { fill: '#34223D', fontSize: 11, fontWeight: 800, padding: 6 },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(tick) => formatCompactQuantity(Number(tick))}
          style={{
            axis: { stroke: 'transparent' },
            grid: { stroke: GRID_COLOR, strokeDasharray: '5,5' },
            tickLabels: { fill: '#755984', fontSize: 10, fontWeight: 700, padding: 4 },
          }}
        />
        <VictoryBar
          data={chartData}
          labels={({ datum }) => formatCompactQuantity(Number(datum.y))}
          cornerRadius={{ top: 8, bottom: 8 }}
          style={{
            data: { fill: color, width: 20 },
            labels: { fill: ACCENT_DARK, fontSize: 10, fontWeight: 800 },
          }}
          animate={{ duration: 520, onLoad: { duration: 520 } }}
        />
      </VictoryChart>
      <View style={styles.rankingList}>
        {items.slice(0, 4).map((item, index) => {
          const originalValue = metric === 'entry' ? item.entryQuantity : item.exitQuantity;
          const baseValue = metric === 'entry' ? item.entryQuantityInBaseUnits : item.exitQuantityInBaseUnits;

          return (
            <View key={`${metric}-${item.itemId}`} style={[styles.rankingRow, { backgroundColor: index === 0 ? softColor : '#FFFFFF' }]}>
              <Text style={styles.rankingPosition}>{index + 1}</Text>
              <View style={styles.rankingTextBlock}>
                <Text style={styles.rankingName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rankingMeta} numberOfLines={1}>
                  {showOriginalUnitDetails
                    ? formatOriginalAndBaseQuantity(originalValue, item.unit, item.conversionFactor, formatQuantity)
                    : `${formatQuantity(baseValue)} und no periodo`}
                </Text>
              </View>
              <Text style={styles.rankingValue}>{formatCompactQuantity(baseValue)} und</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AbcVictoryChart({ points, width, chartKey }: { points: DashboardAbcPoint[]; width: number; chartKey: string }) {
  if (points.length === 0) {
    return <EmptyChart message="Escolha uma metrica com movimentacao para montar a Curva ABC." />;
  }

  const maxRank = Math.max(points.length, 2);
  const data = points.map((point) => ({
    x: point.rank,
    y: point.cumulativePercent,
    abcClass: point.abcClass,
  }));
  const xStep = Math.max(1, Math.ceil(points.length / 7));
  const xTicks = points
    .filter((point) => point.rank === 1 || point.rank % xStep === 0 || point.rank === points.length)
    .map((point) => point.rank);

  return (
    <View style={styles.chartCanvas}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendPill, { backgroundColor: '#2F8A5F' }]} />
          <Text style={styles.legendLabel}>A ate 80%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendPill, { backgroundColor: '#B87914' }]} />
          <Text style={styles.legendLabel}>B ate 95%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendPill, { backgroundColor: '#B73636' }]} />
          <Text style={styles.legendLabel}>C restante</Text>
        </View>
      </View>
      <VictoryChart
        key={chartKey}
        width={width}
        height={300}
        padding={{ top: 24, right: 28, bottom: 46, left: 56 }}
        domain={{ x: [1, maxRank], y: [0, 100] }}
      >
        <VictoryAxis
          tickValues={xTicks}
          tickFormat={(tick) => `#${tick}`}
          style={{
            axis: { stroke: GRID_COLOR },
            tickLabels: { fill: '#6B5177', fontSize: 10, fontWeight: 700 },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickValues={[0, 20, 40, 60, 80, 100]}
          tickFormat={(tick) => `${tick}%`}
          style={{
            axis: { stroke: 'transparent' },
            grid: { stroke: GRID_COLOR, strokeDasharray: '5,5' },
            tickLabels: { fill: '#6B5177', fontSize: 10, fontWeight: 700, padding: 6 },
          }}
        />
        <VictoryLine
          data={[{ x: 1, y: 80 }, { x: maxRank, y: 80 }]}
          style={{ data: { stroke: '#2F8A5F', strokeDasharray: '7,5', strokeWidth: 1.5 } }}
        />
        <VictoryLine
          data={[{ x: 1, y: 95 }, { x: maxRank, y: 95 }]}
          style={{ data: { stroke: '#B87914', strokeDasharray: '7,5', strokeWidth: 1.5 } }}
        />
        <VictoryArea
          data={data}
          interpolation="monotoneX"
          style={{ data: { fill: 'rgba(119, 21, 142, 0.14)', stroke: 'transparent' } }}
        />
        <VictoryLine
          data={data}
          interpolation="monotoneX"
          style={{ data: { stroke: ACCENT_COLOR, strokeWidth: 4 } }}
          animate={{ duration: 520, onLoad: { duration: 520 } }}
        />
        <VictoryScatter
          data={data}
          size={4.5}
          style={{
            data: {
              fill: ({ datum }) => {
                if (datum.abcClass === 'A') return '#2F8A5F';
                if (datum.abcClass === 'B') return '#B87914';
                return '#B73636';
              },
              stroke: '#FFFFFF',
              strokeWidth: 2,
            },
          }}
        />
      </VictoryChart>
    </View>
  );
}

export function DashboardScreen() {
  const { width } = useWindowDimensions();
  const initialMonth = getCurrentMonthString();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DashboardAbcMetric>('movement');
  const [viewMode, setViewMode] = useState<'item' | 'category'>('item');
  const [activeChartInfo, setActiveChartInfo] = useState<DashboardChartInfoKey | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isFocused = useIsFocused();
  const { showTopPopup } = useTopPopup();
  const monthOptions = useMemo(() => buildRecentMonthOptions(new Date(), 12), []);
  const isWide = width >= 900;
  const contentWidth = Math.max(320, Math.min(width - 32, 1180));
  const fullChartWidth = Math.max(320, Math.min(contentWidth - 34, 1040));
  const splitChartWidth = Math.max(310, Math.min(isWide ? (contentWidth - 50) / 2 : contentWidth - 34, 560));

  async function loadDashboard(month: string, syncFirst: boolean = false) {
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await getDashboardAnalytics(month);
      setDashboardData(data);
    } catch (error) {
      setDashboardData(null);
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar dashboard.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadDashboard(selectedMonth);
  }, [selectedMonth, isFocused]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    showTopPopup({
      type: 'error',
      message: errorMessage,
      durationMs: 4200,
    });
  }, [errorMessage, showTopPopup]);

  function setCurrentMonth() {
    const currentMonth = getCurrentMonthString();
    setSelectedMonth(currentMonth);
    setIsMonthMenuOpen(false);
    setErrorMessage('');
  }

  function selectMonth(monthValue: string) {
    setSelectedMonth(monthValue);
    setIsMonthMenuOpen(false);
    setErrorMessage('');
  }

  const groupedByCategory = useMemo(() => {
    if (!dashboardData?.items) {
      return [];
    }

    const map = new Map<string, DashboardItemAnalyticsRow>();
    let idCounter = -1;

    for (const item of dashboardData.items) {
      const cat = item.category?.trim() || 'Sem categoria';
      const existing = map.get(cat);
      if (existing) {
        existing.entryQuantity += item.entryQuantity;
        existing.entryQuantityInBaseUnits += item.entryQuantityInBaseUnits;
        existing.exitQuantity += item.exitQuantity;
        existing.exitQuantityInBaseUnits += item.exitQuantityInBaseUnits;
        existing.movementTotal += item.movementTotal;
        existing.movementTotalInBaseUnits += item.movementTotalInBaseUnits;
      } else {
        map.set(cat, {
          itemId: idCounter--,
          name: cat,
          category: cat,
          unit: '',
          conversionFactor: 1,
          entryQuantity: item.entryQuantity,
          entryQuantityInBaseUnits: item.entryQuantityInBaseUnits,
          exitQuantity: item.exitQuantity,
          exitQuantityInBaseUnits: item.exitQuantityInBaseUnits,
          movementTotal: item.movementTotal,
          movementTotalInBaseUnits: item.movementTotalInBaseUnits,
        });
      }
    }

    return Array.from(map.values());
  }, [dashboardData]);

  const activeDataList = viewMode === 'item' ? (dashboardData?.items ?? []) : groupedByCategory;

  const abcPoints = useMemo(
    () => buildAbcPoints(activeDataList, selectedMetric),
    [activeDataList, selectedMetric],
  );

  const topEntryItems = useMemo(
    () =>
      activeDataList
        .filter((item) => item.entryQuantityInBaseUnits > 0)
        .sort(
          (left, right) =>
            right.entryQuantityInBaseUnits - left.entryQuantityInBaseUnits ||
            left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
        )
        .slice(0, 6),
    [activeDataList],
  );

  const topExitItems = useMemo(
    () =>
      activeDataList
        .filter((item) => item.exitQuantityInBaseUnits > 0)
        .sort(
          (left, right) =>
            right.exitQuantityInBaseUnits - left.exitQuantityInBaseUnits ||
            left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
        )
        .slice(0, 6),
    [activeDataList],
  );

  const hasMovement = (dashboardData?.totals.movementEntries ?? 0) > 0;
  const activeInfoContent = activeChartInfo ? DASHBOARD_CHART_INFO_CONTENT[activeChartInfo] : null;
  const totalEntry = dashboardData?.totals.entryQuantityInBaseUnits ?? 0;
  const totalExit = dashboardData?.totals.exitQuantityInBaseUnits ?? 0;
  const totalMovement = dashboardData?.totals.movementTotalInBaseUnits ?? 0;
  const totalItems = dashboardData?.totals.activeItems ?? 0;
  const movementDays = dashboardData?.dailySeries.filter(
    (point) => point.entryQuantityInBaseUnits > 0 || point.exitQuantityInBaseUnits > 0,
  ).length ?? 0;
  const leadingEntryName = topEntryItems[0]?.name ?? 'Sem entrada';
  const leadingExitName = topExitItems[0]?.name ?? 'Sem saida';
  const dashboardChartKey = `${selectedMonth}-${viewMode}-${selectedMetric}`;

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentWidth }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadDashboard(selectedMonth, true);
            }}
          />
        }
      >
        <SyncStatusCard />

        <MotionEntrance delay={80}>
          <HeroHeader
            title="Dashboard"
            subtitle="Painel mensal de inteligencia do estoque"
            description="Veja compras, saidas, itens de maior giro e Curva ABC em um unico lugar."
          >
            <View style={styles.heroKpis}>
              <KpiTile label="Entrada (und)" value={formatQuantity(totalEntry)} />
              <KpiTile label="Saida (und)" value={formatQuantity(totalExit)} />
              <KpiTile label="Movimentacao (und)" value={formatQuantity(totalMovement)} />
              <KpiTile label="Itens ativos" value={String(totalItems)} />
            </View>
          </HeroHeader>
        </MotionEntrance>

        <MotionEntrance delay={120}>
          <View style={[styles.commandPanel, isWide ? styles.commandPanelWide : undefined]}>
            <View style={styles.monthControl}>
              <Text style={styles.controlLabel}>Mes analisado</Text>
              <View style={styles.monthSelectRoot}>
                <Pressable
                  style={styles.monthSelectTrigger}
                  onPress={() => setIsMonthMenuOpen((previousState) => !previousState)}
                >
                  <Text style={styles.monthSelectTriggerText}>{formatMonthLabel(selectedMonth)}</Text>
                  <Text style={styles.monthSelectArrow}>{isMonthMenuOpen ? '^' : 'v'}</Text>
                </Pressable>
                {isMonthMenuOpen ? (
                  <View style={styles.monthSelectMenu}>
                    {monthOptions.map((monthValue, index) => {
                      const isSelected = selectedMonth === monthValue;

                      return (
                        <Pressable
                          key={monthValue}
                          style={[
                            styles.monthSelectOption,
                            index === 0 ? styles.monthSelectOptionFirst : undefined,
                            isSelected ? styles.monthSelectOptionActive : undefined,
                          ]}
                          onPress={() => selectMonth(monthValue)}
                        >
                          <Text
                            style={[
                              styles.monthSelectOptionText,
                              isSelected ? styles.monthSelectOptionTextActive : undefined,
                            ]}
                          >
                            {formatMonthLabel(monthValue)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              <Pressable style={styles.currentMonthButton} onPress={setCurrentMonth}>
                <Text style={styles.currentMonthButtonText}>Mes atual</Text>
              </Pressable>
            </View>

            <ControlSegment
              title="Agrupamento"
              value={viewMode}
              onBeforeChange={() => setIsMonthMenuOpen(false)}
              onChange={setViewMode}
              options={[
                { label: 'Por item', value: 'item' },
                { label: 'Por categoria', value: 'category' },
              ]}
            />

            <ControlSegment
              title="Metrica da Curva ABC"
              value={selectedMetric}
              onBeforeChange={() => setIsMonthMenuOpen(false)}
              onChange={setSelectedMetric}
              options={[
                { label: 'Entrada + Saida', value: 'movement' },
                { label: 'Entrada', value: 'entry' },
                { label: 'Saida', value: 'exit' },
              ]}
            />
          </View>
        </MotionEntrance>

        {isLoading ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingTitle}>Carregando dashboard...</Text>
            <Text style={styles.loadingText}>Buscando dados do mes selecionado.</Text>
          </View>
        ) : null}

        {!isLoading && dashboardData && hasMovement ? (
          <>
            <MotionEntrance delay={160}>
              <View style={styles.insightGrid}>
                <InsightCard
                  label="Dia(s) com movimento"
                  value={String(movementDays)}
                  detail="Dias do mes com entrada ou saida registrada."
                  tone="accent"
                />
                <InsightCard
                  label="Mais comprado"
                  value={leadingEntryName}
                  detail="Item/categoria lider em entradas no periodo."
                  tone="entry"
                />
                <InsightCard
                  label="Maior saida"
                  value={leadingExitName}
                  detail="Item/categoria com maior consumo no periodo."
                  tone="exit"
                />
              </View>
            </MotionEntrance>

            <MotionEntrance delay={210}>
              <View style={styles.chartCardLarge}>
                <ChartCardHeader
                  title="Movimentacao diaria"
                  eyebrow="Entrada x saida"
                  onPressInfo={() => setActiveChartInfo('dailySeries')}
                />
                <Text style={styles.cardSubtitle}>
                  Barras empilhadas por dia em unidade base. Use para enxergar picos de compra e consumo.
                </Text>
                <DailyMovementChart
                  data={dashboardData.dailySeries}
                  width={fullChartWidth}
                  chartKey={`${dashboardChartKey}-daily`}
                />
              </View>
            </MotionEntrance>

            <View style={[styles.splitGrid, isWide ? styles.splitGridWide : undefined]}>
              <MotionEntrance delay={260}>
                <View style={styles.chartCardSplit}>
                  <ChartCardHeader
                    title={viewMode === 'item' ? 'Mais comprados' : 'Categorias mais compradas'}
                    eyebrow="Ranking de entrada"
                    onPressInfo={() => setActiveChartInfo('topEntries')}
                  />
                  <RankingChart
                    items={topEntryItems}
                    metric="entry"
                    color={ENTRY_COLOR}
                    softColor={ENTRY_SOFT}
                    width={splitChartWidth}
                    emptyMessage="Sem compras registradas neste periodo."
                    chartKey={`${dashboardChartKey}-entry`}
                    showOriginalUnitDetails={viewMode === 'item'}
                  />
                </View>
              </MotionEntrance>

              <MotionEntrance delay={310}>
                <View style={styles.chartCardSplit}>
                  <ChartCardHeader
                    title={viewMode === 'item' ? 'Mais sairam' : 'Categorias que mais sairam'}
                    eyebrow="Ranking de saida"
                    onPressInfo={() => setActiveChartInfo('topExits')}
                  />
                  <RankingChart
                    items={topExitItems}
                    metric="exit"
                    color={EXIT_COLOR}
                    softColor={EXIT_SOFT}
                    width={splitChartWidth}
                    emptyMessage="Sem saidas registradas neste periodo."
                    chartKey={`${dashboardChartKey}-exit`}
                    showOriginalUnitDetails={viewMode === 'item'}
                  />
                </View>
              </MotionEntrance>
            </View>

            <MotionEntrance delay={360}>
              <View style={styles.chartCardLarge}>
                <ChartCardHeader
                  title={`Curva ABC (${getMetricLabel(selectedMetric)})`}
                  eyebrow="Prioridade operacional"
                  onPressInfo={() => setActiveChartInfo('abcCurve')}
                />
                <Text style={styles.cardSubtitle}>
                  Classe A concentra o maior impacto, B complementa a faixa critica e C representa a cauda longa.
                </Text>
                <AbcVictoryChart
                  points={abcPoints}
                  width={fullChartWidth}
                  chartKey={`${dashboardChartKey}-abc`}
                />

                {abcPoints.length > 0 ? (
                  <View style={styles.abcList}>
                    {abcPoints.slice(0, 10).map((point) => (
                      <View key={`${point.itemId}-${point.rank}`} style={styles.abcRow}>
                        <View style={styles.abcRankBubble}>
                          <Text style={styles.abcRankText}>{point.rank}</Text>
                        </View>
                        <View style={styles.abcInfo}>
                          <Text style={styles.abcItemName}>{point.name}</Text>
                          <Text style={styles.abcItemMeta}>
                            {getMetricLabel(selectedMetric)}: {formatQuantity(point.metricValue)} und
                            {viewMode === 'item'
                              ? ` | ${formatOriginalAndBaseQuantity(
                                  getMetricValueOriginal(point, selectedMetric),
                                  point.unit,
                                  point.conversionFactor,
                                  formatQuantity,
                                )}`
                              : ''}
                          </Text>
                          <View style={styles.abcProgressTrack}>
                            <View style={[styles.abcProgressFill, { width: `${Math.min(point.cumulativePercent, 100)}%` }]} />
                          </View>
                        </View>
                        <View
                          style={[
                            styles.abcBadge,
                            point.abcClass === 'A'
                              ? styles.abcBadgeA
                              : point.abcClass === 'B'
                                ? styles.abcBadgeB
                                : styles.abcBadgeC,
                          ]}
                        >
                          <Text style={styles.abcBadgeText}>{point.abcClass}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </MotionEntrance>
          </>
        ) : null}

        {!isLoading && dashboardData && !hasMovement ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sem movimentacoes neste periodo</Text>
            <Text style={styles.emptyText}>
              Registre entradas ou saidas no mes selecionado para visualizar rankings, Curva ABC e movimento diario.
            </Text>
          </View>
        ) : null}

        {!isLoading && !dashboardData && errorMessage ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nao foi possivel carregar a Dashboard</Text>
            <Text style={styles.emptyText}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={activeInfoContent !== null}
        onRequestClose={() => setActiveChartInfo(null)}
      >
        <View style={styles.infoModalBackdrop}>
          <View style={styles.infoModalCard}>
            <Text style={styles.infoModalTitle}>{activeInfoContent?.title}</Text>
            <Text style={styles.infoModalDescription}>{activeInfoContent?.description}</Text>
            <Pressable style={styles.infoModalCloseButton} onPress={() => setActiveChartInfo(null)}>
              <Text style={styles.infoModalCloseButtonText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commandPanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 24,
    padding: 14,
    gap: 14,
    ...tokens.shadow.card,
  },
  commandPanelWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  monthControl: {
    gap: 8,
    flex: 1,
    minWidth: 220,
    position: 'relative',
    zIndex: 3,
  },
  controlSegment: {
    gap: 8,
    flex: 1,
    minWidth: 220,
    zIndex: 1,
  },
  controlLabel: {
    color: '#4A155A',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  monthSelectRoot: {
    gap: 6,
    position: 'relative',
    zIndex: 4,
  },
  monthSelectTrigger: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthSelectTriggerText: {
    color: '#2A0834',
    fontSize: 15,
    fontWeight: '800',
  },
  monthSelectArrow: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '900',
  },
  monthSelectMenu: {
    borderWidth: 1,
    borderColor: '#C6A8DD',
    borderRadius: 14,
    backgroundColor: '#FCF9FF',
    overflow: 'hidden',
    maxHeight: 310,
  },
  monthSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFE3FA',
  },
  monthSelectOptionFirst: {
    borderTopWidth: 0,
  },
  monthSelectOptionActive: {
    backgroundColor: '#EDE0F9',
  },
  monthSelectOptionText: {
    color: '#5F1175',
    fontSize: 14,
    fontWeight: '700',
  },
  monthSelectOptionTextActive: {
    color: '#3A0D49',
    fontWeight: '900',
  },
  currentMonthButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    paddingVertical: 9,
    alignItems: 'center',
  },
  currentMonthButtonText: {
    color: '#5F1175',
    fontWeight: '900',
    fontSize: 13,
  },
  segmentButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    zIndex: 1,
  },
  segmentButton: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    cursor: 'pointer',
    zIndex: 2,
  },
  segmentButtonActive: {
    backgroundColor: '#77158E',
    borderColor: '#5F1175',
  },
  segmentButtonPressed: {
    opacity: 0.88,
  },
  segmentButtonText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 20,
    padding: 18,
    gap: 4,
    alignItems: 'center',
    ...tokens.shadow.card,
  },
  loadingTitle: {
    color: '#2A0834',
    fontSize: 16,
    fontWeight: '900',
  },
  loadingText: {
    color: '#77158E',
    fontSize: 13,
    fontWeight: '700',
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  insightCard: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    overflow: 'hidden',
    ...tokens.shadow.card,
  },
  insightCard_accent: {
    borderColor: '#D8C3EA',
  },
  insightCard_entry: {
    borderColor: '#BDE8CE',
  },
  insightCard_exit: {
    borderColor: '#F2BFC0',
  },
  insightCard_neutral: {
    borderColor: '#D8C3EA',
  },
  insightMarker: {
    width: 42,
    height: 5,
    borderRadius: 999,
  },
  insightMarker_accent: {
    backgroundColor: ACCENT_COLOR,
  },
  insightMarker_entry: {
    backgroundColor: ENTRY_COLOR,
  },
  insightMarker_exit: {
    backgroundColor: EXIT_COLOR,
  },
  insightMarker_neutral: {
    backgroundColor: '#6F617A',
  },
  insightLabel: {
    color: '#755984',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  insightValue: {
    color: '#1F1028',
    fontSize: 20,
    fontWeight: '900',
  },
  insightDetail: {
    color: '#6F617A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  chartCardLarge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 24,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    ...tokens.shadow.card,
  },
  splitGrid: {
    gap: 14,
  },
  splitGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  chartCardSplit: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 24,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    ...tokens.shadow.card,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chartTitleBlock: {
    flex: 1,
    gap: 2,
  },
  chartEyebrow: {
    color: '#77158E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2A0834',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6F617A',
    lineHeight: 18,
    fontWeight: '700',
  },
  chartInfoButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartInfoButtonPressed: {
    backgroundColor: '#EDE0F9',
  },
  chartInfoButtonText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '900',
  },
  chartCanvas: {
    gap: 8,
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'stretch',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendPill: {
    width: 20,
    height: 8,
    borderRadius: 999,
  },
  legendLabel: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '800',
  },
  rankingList: {
    alignSelf: 'stretch',
    gap: 8,
  },
  rankingRow: {
    borderWidth: 1,
    borderColor: '#E6D6F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankingPosition: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#2A0834',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 12,
    fontWeight: '900',
  },
  rankingTextBlock: {
    flex: 1,
    gap: 1,
  },
  rankingName: {
    color: '#2A0834',
    fontSize: 13,
    fontWeight: '900',
  },
  rankingMeta: {
    color: '#755984',
    fontSize: 11,
    fontWeight: '700',
  },
  rankingValue: {
    color: '#4A155A',
    fontSize: 12,
    fontWeight: '900',
  },
  abcList: {
    gap: 8,
    marginTop: 4,
  },
  abcRow: {
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 16,
    backgroundColor: '#FCF9FF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  abcRankBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#2A0834',
    alignItems: 'center',
    justifyContent: 'center',
  },
  abcRankText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  abcInfo: {
    flex: 1,
    gap: 4,
  },
  abcItemName: {
    color: '#2A0834',
    fontSize: 13,
    fontWeight: '900',
  },
  abcItemMeta: {
    color: '#6F617A',
    fontSize: 12,
    fontWeight: '700',
  },
  abcProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EDE0F9',
    overflow: 'hidden',
  },
  abcProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#77158E',
  },
  abcBadge: {
    minWidth: 34,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  abcBadgeA: {
    backgroundColor: '#DFF6E9',
  },
  abcBadgeB: {
    backgroundColor: '#FFF2C7',
  },
  abcBadgeC: {
    backgroundColor: '#FDEAEA',
  },
  abcBadgeText: {
    color: '#2A0834',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyChart: {
    alignSelf: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6D6F0',
    backgroundColor: '#FCF9FF',
    padding: 18,
    gap: 4,
    alignItems: 'center',
  },
  emptyChartTitle: {
    color: '#2A0834',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyChartText: {
    color: '#755984',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 22,
    padding: 18,
    gap: 8,
    alignItems: 'center',
    ...tokens.shadow.card,
  },
  emptyTitle: {
    color: '#2A0834',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#77158E',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '700',
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: tokens.colors.overlay,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  infoModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D8C3EA',
    padding: 18,
    gap: 12,
    ...tokens.shadow.card,
  },
  infoModalTitle: {
    color: '#2A0834',
    fontSize: 18,
    fontWeight: '900',
  },
  infoModalDescription: {
    color: '#5F1175',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  infoModalCloseButton: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoModalCloseButtonText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '900',
  },
});
