import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { useTopPopup } from '../components/TopPopupProvider';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { InteractiveBarChart } from '../components/charts/InteractiveBarChart';
import { InteractiveAbcChart } from '../components/charts/InteractiveAbcChart';
import { DailySeriesChart } from '../components/charts/DailySeriesChart';
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
import {
  formatMonthLabel,
  getCurrentMonthString,
  parseDisplayMonthToIso,
} from '../utils/date';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
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
      entryQuantity: item.entryQuantity,
      exitQuantity: item.exitQuantity,
      movementTotal: item.movementTotal,
      metricValue,
      sharePercent,
      cumulativePercent: normalizedCumulative,
      abcClass: classifyAbc(normalizedCumulative),
    };
  });
}

type DashboardChartInfoKey = 'abcCurve' | 'topEntries' | 'topExits' | 'dailySeries';

const DASHBOARD_CHART_INFO_CONTENT: Record<
  DashboardChartInfoKey,
  { title: string; description: string }
> = {
  abcCurve: {
    title: 'Curva ABC',
    description:
      'Mostra a participacao acumulada dos itens no periodo. Classe A concentra os itens mais relevantes (ate 80%), B ate 95% e C os demais. Toque nos pontos para ver detalhes de cada item.',
  },
  topEntries: {
    title: 'Itens mais comprados no mes',
    description:
      'Ranking dos itens com maior entrada no mes selecionado. Toque nas barras para ver a quantidade e o percentual do total.',
  },
  topExits: {
    title: 'Itens que mais sairam no mes',
    description:
      'Ranking dos itens com maior saida no mes selecionado. Toque nas barras para ver a quantidade e o percentual do total.',
  },
  dailySeries: {
    title: 'Movimentacao diaria',
    description:
      'Mostra as entradas (verde) e saidas (vermelho) empilhadas por dia. Toque numa barra para ver os valores detalhados daquele dia.',
  },
};

function ChartCardHeader({
  title,
  onPressInfo,
}: {
  title: string;
  onPressInfo: () => void;
}) {
  return (
    <View style={styles.chartHeaderRow}>
      <Text style={styles.cardTitle}>{title}</Text>
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

export function DashboardScreen() {
  const initialMonth = getCurrentMonthString();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [monthInputValue, setMonthInputValue] = useState(formatMonthLabel(initialMonth));
  const [monthInputError, setMonthInputError] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<DashboardAbcMetric>('movement');
  const [viewMode, setViewMode] = useState<'item' | 'category'>('item');
  const [activeChartInfo, setActiveChartInfo] = useState<DashboardChartInfoKey | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isFocused = useIsFocused();
  const { showTopPopup } = useTopPopup();

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
    setMonthInputValue(formatMonthLabel(selectedMonth));
  }, [selectedMonth]);

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

  function handleMonthInputChange(nextValue: string) {
    setMonthInputValue(nextValue);
    setErrorMessage('');

    const parsedMonth = parseDisplayMonthToIso(nextValue);

    if (parsedMonth) {
      setMonthInputError('');
      setSelectedMonth(parsedMonth);
      return;
    }

    if (nextValue.trim().length === 0) {
      setMonthInputError('Informe o mes no formato MM/AAAA.');
      return;
    }

    if (nextValue.trim().length >= 7) {
      setMonthInputError('Use um mes valido no formato MM/AAAA.');
    } else {
      setMonthInputError('');
    }
  }

  function setCurrentMonth() {
    const currentMonth = getCurrentMonthString();
    setSelectedMonth(currentMonth);
    setMonthInputValue(formatMonthLabel(currentMonth));
    setMonthInputError('');
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
        existing.exitQuantity += item.exitQuantity;
        existing.movementTotal += item.movementTotal;
      } else {
        map.set(cat, {
          itemId: idCounter--,
          name: cat,
          category: cat,
          unit: '', // Ocultamos a unidade pois uma categoria pode englobar várias unidades
          entryQuantity: item.entryQuantity,
          exitQuantity: item.exitQuantity,
          movementTotal: item.movementTotal,
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
        .filter((item) => item.entryQuantity > 0)
        .sort(
          (left, right) =>
            right.entryQuantity - left.entryQuantity ||
            left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
        )
        .slice(0, 6),
    [activeDataList],
  );
  const topExitItems = useMemo(
    () =>
      activeDataList
        .filter((item) => item.exitQuantity > 0)
        .sort(
          (left, right) =>
            right.exitQuantity - left.exitQuantity ||
            left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
        )
        .slice(0, 6),
    [activeDataList],
  );
  const hasMovement = (dashboardData?.totals.movementEntries ?? 0) > 0;

  const entryBarData = useMemo(
    () =>
      topEntryItems.map((item) => ({
        id: item.itemId,
        label: item.name,
        value: item.entryQuantity,
        unit: item.unit,
      })),
    [topEntryItems],
  );

  const exitBarData = useMemo(
    () =>
      topExitItems.map((item) => ({
        id: item.itemId,
        label: item.name,
        value: item.exitQuantity,
        unit: item.unit,
      })),
    [topExitItems],
  );

  const activeInfoContent = activeChartInfo ? DASHBOARD_CHART_INFO_CONTENT[activeChartInfo] : null;
  const totalEntry = dashboardData?.totals.entryQuantity ?? 0;
  const totalExit = dashboardData?.totals.exitQuantity ?? 0;
  const totalMovement = dashboardData?.totals.movementTotal ?? 0;
  const totalItems = dashboardData?.totals.activeItems ?? 0;

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
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
            subtitle="Analise mensal"
            description="Curva ABC e ranking de compras/saidas para apoiar reposicao e giro."
          >
            <View style={styles.heroKpis}>
              <KpiTile label="Entrada" value={formatQuantity(totalEntry)} />
              <KpiTile label="Saida" value={formatQuantity(totalExit)} />
              <KpiTile label="Movimentacao" value={formatQuantity(totalMovement)} />
              <KpiTile label="Itens ativos" value={String(totalItems)} />
            </View>
          </HeroHeader>
        </MotionEntrance>

        <View style={styles.controlsCard}>
          <Text style={styles.cardTitle}>Periodo do dashboard</Text>
          <TextInput
            value={monthInputValue}
            onChangeText={handleMonthInputChange}
            placeholder="MM/AAAA"
            keyboardType="numbers-and-punctuation"
            style={[styles.monthInput, monthInputError ? styles.inputError : undefined]}
          />
          <Pressable style={styles.currentMonthButton} onPress={setCurrentMonth}>
            <Text style={styles.currentMonthButtonText}>Mes atual</Text>
          </Pressable>
          {monthInputError ? <Text style={styles.errorText}>{monthInputError}</Text> : null}
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.cardTitle}>Visao (Agrupamento)</Text>
          <View style={styles.metricButtons}>
            <Pressable
              style={[
                styles.metricButton,
                viewMode === 'item' ? styles.metricButtonActive : undefined,
              ]}
              onPress={() => setViewMode('item')}
            >
              <Text
                style={[
                  styles.metricButtonText,
                  viewMode === 'item' ? styles.metricButtonTextActive : undefined,
                ]}
              >
                Por Item
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.metricButton,
                viewMode === 'category' ? styles.metricButtonActive : undefined,
              ]}
              onPress={() => setViewMode('category')}
            >
              <Text
                style={[
                  styles.metricButtonText,
                  viewMode === 'category' ? styles.metricButtonTextActive : undefined,
                ]}
              >
                Por Categoria
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.cardTitle}>Metrica da Curva ABC</Text>
          <View style={styles.metricButtons}>
            <Pressable
              style={[
                styles.metricButton,
                selectedMetric === 'movement' ? styles.metricButtonActive : undefined,
              ]}
              onPress={() => setSelectedMetric('movement')}
            >
              <Text
                style={[
                  styles.metricButtonText,
                  selectedMetric === 'movement' ? styles.metricButtonTextActive : undefined,
                ]}
              >
                Entrada + Saida
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.metricButton,
                selectedMetric === 'entry' ? styles.metricButtonActive : undefined,
              ]}
              onPress={() => setSelectedMetric('entry')}
            >
              <Text
                style={[
                  styles.metricButtonText,
                  selectedMetric === 'entry' ? styles.metricButtonTextActive : undefined,
                ]}
              >
                Entrada
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.metricButton,
                selectedMetric === 'exit' ? styles.metricButtonActive : undefined,
              ]}
              onPress={() => setSelectedMetric('exit')}
            >
              <Text
                style={[
                  styles.metricButtonText,
                  selectedMetric === 'exit' ? styles.metricButtonTextActive : undefined,
                ]}
              >
                Saida
              </Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? <Text style={styles.emptyText}>Carregando dashboard...</Text> : null}

        {!isLoading && dashboardData && hasMovement ? (
          <>
            {/* ─── KPI Grid ─── */}
            <MotionEntrance delay={100}>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <View style={styles.kpiIconRow}>
                    <View style={[styles.kpiIconDot, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.kpiIconText, { color: '#15803D' }]}>▲</Text>
                    </View>
                    <Text style={styles.kpiLabel}>Total entrada</Text>
                  </View>
                  <Text style={styles.kpiValue}>{formatQuantity(dashboardData.totals.entryQuantity)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <View style={styles.kpiIconRow}>
                    <View style={[styles.kpiIconDot, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.kpiIconText, { color: '#DC2626' }]}>▼</Text>
                    </View>
                    <Text style={styles.kpiLabel}>Total saida</Text>
                  </View>
                  <Text style={styles.kpiValue}>{formatQuantity(dashboardData.totals.exitQuantity)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <View style={styles.kpiIconRow}>
                    <View style={[styles.kpiIconDot, { backgroundColor: '#EDE0F9' }]}>
                      <Text style={[styles.kpiIconText, { color: '#5F1175' }]}>⇄</Text>
                    </View>
                    <Text style={styles.kpiLabel}>Movimentacao</Text>
                  </View>
                  <Text style={styles.kpiValue}>{formatQuantity(dashboardData.totals.movementTotal)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <View style={styles.kpiIconRow}>
                    <View style={[styles.kpiIconDot, { backgroundColor: '#F5EEFB' }]}>
                      <Text style={[styles.kpiIconText, { color: '#77158E' }]}>▣</Text>
                    </View>
                    <Text style={styles.kpiLabel}>Itens ativos</Text>
                  </View>
                  <Text style={styles.kpiValue}>{dashboardData.totals.activeItems}</Text>
                </View>
              </View>
            </MotionEntrance>

            {/* ─── Curva ABC Interativa ─── */}
            <MotionEntrance delay={200}>
              <View style={styles.chartCard}>
                <ChartCardHeader
                  title={`Curva ABC (${getMetricLabel(selectedMetric)})`}
                  onPressInfo={() => setActiveChartInfo('abcCurve')}
                />
                <Text style={styles.cardSubtitle}>
                  Classes: A ate 80%, B ate 95%, C acima de 95% de participacao acumulada.
                </Text>
                <InteractiveAbcChart
                  points={abcPoints}
                  metricLabel={getMetricLabel(selectedMetric)}
                />

                {/* ABC Item List */}
                {abcPoints.length > 0 ? (
                  <View style={styles.abcList}>
                    {abcPoints.slice(0, 10).map((point) => (
                      <View key={`${point.itemId}-${point.rank}`} style={styles.abcRow}>
                        <View style={styles.abcInfo}>
                          <Text style={styles.abcItemName}>{point.rank}. {point.name}</Text>
                          <Text style={styles.abcItemMeta}>
                            {getMetricLabel(selectedMetric)}: {formatQuantity(point.metricValue)} {point.unit}{point.unit ? ' | ' : ''}Acumulado:{' '}
                            {point.cumulativePercent.toFixed(1)}%
                          </Text>
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

            {/* ─── Movimentação Diária (NOVO) ─── */}
            <MotionEntrance delay={300}>
              <View style={styles.chartCard}>
                <ChartCardHeader
                  title="Movimentacao diaria"
                  onPressInfo={() => setActiveChartInfo('dailySeries')}
                />
                <Text style={styles.cardSubtitle}>
                  Entradas e saidas empilhadas por dia no mes selecionado.
                </Text>
                <DailySeriesChart series={dashboardData.dailySeries} />
              </View>
            </MotionEntrance>

            {/* ─── Top Entradas Interativo ─── */}
            <MotionEntrance delay={400}>
              <View style={styles.chartCard}>
                <ChartCardHeader
                  title={viewMode === 'item' ? "Itens mais comprados no mes" : "Categorias mais compradas"}
                  onPressInfo={() => setActiveChartInfo('topEntries')}
                />
                <InteractiveBarChart
                  data={entryBarData}
                  accentFrom="#22C55E"
                  accentTo="#16A34A"
                  emptyMessage="Sem compras registradas neste periodo."
                />
              </View>
            </MotionEntrance>

            {/* ─── Top Saídas Interativo ─── */}
            <MotionEntrance delay={500}>
              <View style={styles.chartCard}>
                <ChartCardHeader
                  title={viewMode === 'item' ? "Itens que mais sairam no mes" : "Categorias que mais sairam"}
                  onPressInfo={() => setActiveChartInfo('topExits')}
                />
                <InteractiveBarChart
                  data={exitBarData}
                  accentFrom="#EF4444"
                  accentTo="#DC2626"
                  emptyMessage="Sem saidas registradas neste periodo."
                />
              </View>
            </MotionEntrance>
          </>
        ) : null}

        {!isLoading && dashboardData && !hasMovement ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sem movimentacoes neste periodo</Text>
            <Text style={styles.emptyText}>
              Registre entradas/saidas no mes selecionado para visualizar a Curva ABC e os graficos.
            </Text>
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
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  heroCard: {
    display: 'none',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: '#EDE0F9',
    fontSize: 14,
    lineHeight: 20,
  },
  heroSummary: {
    color: '#D8C3EA',
    fontSize: 13,
    fontWeight: '700',
  },
  controlsCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    ...tokens.shadow.card,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3A0D49',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#77158E',
    lineHeight: 18,
  },
  monthInput: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2A0834',
  },
  inputError: {
    borderColor: '#CF2D2D',
  },
  currentMonthButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    paddingVertical: 8,
    alignItems: 'center',
  },
  currentMonthButtonText: {
    color: '#5F1175',
    fontWeight: '700',
    fontSize: 13,
  },
  metricCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    ...tokens.shadow.card,
  },
  metricButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  metricButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  metricButtonActive: {
    backgroundColor: '#77158E',
    borderColor: '#5F1175',
  },
  metricButtonText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  metricButtonTextActive: {
    color: '#FFFFFF',
  },
  errorText: {
    color: '#B02323',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    color: '#77158E',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 16,
    padding: 12,
    gap: 6,
    ...tokens.shadow.card,
  },
  kpiIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiIconDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconText: {
    fontSize: 12,
    fontWeight: '800',
  },
  kpiLabel: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  kpiValue: {
    color: '#2A0834',
    fontSize: 20,
    fontWeight: '900',
  },
  chartCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...tokens.shadow.card,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chartInfoButton: {
    width: 28,
    height: 28,
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
    fontWeight: '800',
  },
  chart: {
    borderRadius: 12,
  },
  abcList: {
    gap: 8,
    marginTop: 4,
  },
  abcRow: {
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 10,
    backgroundColor: '#F8F1FD',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  abcInfo: {
    flex: 1,
    gap: 2,
  },
  abcItemName: {
    color: '#2A0834',
    fontSize: 13,
    fontWeight: '700',
  },
  abcItemMeta: {
    color: '#77158E',
    fontSize: 12,
  },
  abcBadge: {
    minWidth: 28,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  abcBadgeA: {
    backgroundColor: '#DCFCE7',
  },
  abcBadgeB: {
    backgroundColor: '#FEF9C3',
  },
  abcBadgeC: {
    backgroundColor: '#FEE2E2',
  },
  abcBadgeText: {
    color: '#3A0D49',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    alignItems: 'center',
    ...tokens.shadow.card,
  },
  emptyTitle: {
    color: '#3A0D49',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: tokens.colors.overlay,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  infoModalCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    padding: 16,
    gap: 12,
    ...tokens.shadow.card,
  },
  infoModalTitle: {
    color: '#2A0834',
    fontSize: 18,
    fontWeight: '800',
  },
  infoModalDescription: {
    color: '#5F1175',
    fontSize: 14,
    lineHeight: 20,
  },
  infoModalCloseButton: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoModalCloseButtonText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '800',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
