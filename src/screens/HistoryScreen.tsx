import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  archiveDailyHistoryDate,
  archiveDailyHistoryDateByMovement,
  archiveDailyHistoryEntry,
  listDailyHistoryGrouped,
  listFortnightlyHistoryGrouped,
  listMonthlyHistoryGrouped,
  updateDailyHistoryEntry,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import { AppButton, HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type {
  DailyHistoryEntry,
  DailyHistoryGroup,
  HistoryReportPeriod,
  PeriodHistoryGroup,
} from '../types/inventory';
import {
  formatDateLabel,
  formatMonthLabel,
  getCurrentMonthString,
} from '../utils/date';
import { generateHistoryReportPdf } from '../utils/history-report';
import { formatOriginalAndBaseQuantity } from '../utils/unit-conversion';

type HistoryMode = 'diario' | 'quinzenal' | 'mensal';
type DailyMovementFilter = 'entry' | 'exit';
type PeriodDayMovementFilter = 'all' | DailyMovementFilter;

type HistoryScreenProps = {
  canManageHistoryActions?: boolean;
};

type FallbackPromptConfig = {
  title: string;
  message: string;
  placeholder: string;
  secureTextEntry: boolean;
  keyboardType: 'default' | 'decimal-pad';
  defaultValue?: string;
};

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

const MAX_AUTOCOMPLETE_SUGGESTIONS = 6;

function normalizeSearchValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Um dia "qualifica" se TODOS os itens selecionados aparecem entre as entries informadas.
function entriesHaveAllSelected(
  entries: Array<{ name: string }>,
  selectedNormalized: string[],
): boolean {
  if (selectedNormalized.length === 0) {
    return true;
  }

  const present = new Set(entries.map((entry) => normalizeSearchValue(entry.name)));
  return selectedNormalized.every((selected) => present.has(selected));
}

// Mantém apenas as entries cujos itens estao selecionados (sem selecao = sem filtro).
function keepSelectedEntries<T extends { name: string }>(
  entries: T[],
  selectedNormalized: string[],
): T[] {
  if (selectedNormalized.length === 0) {
    return entries;
  }

  const selected = new Set(selectedNormalized);
  return entries.filter((entry) => selected.has(normalizeSearchValue(entry.name)));
}

function getMovementTypeLabel(movementType: DailyHistoryEntry['movementType']): string {
  if (movementType === 'entry') {
    return 'Entrada';
  }

  if (movementType === 'exit') {
    return 'Saida';
  }

  if (movementType === 'initial') {
    return 'Inicial';
  }

  if (movementType === 'legacy_snapshot') {
    return 'Registro anterior';
  }

  return 'Consumo';
}

function resolveMovementFilter(movementType: DailyHistoryEntry['movementType']): DailyMovementFilter {
  if (movementType === 'entry' || movementType === 'initial' || movementType === 'legacy_snapshot') {
    return 'entry';
  }

  return 'exit';
}

function getDailyMovementFilterLabel(filter: DailyMovementFilter): string {
  return filter === 'entry' ? 'Entrada' : 'Saida';
}

function getHistoryReportPeriodLabel(period: HistoryReportPeriod): string {
  if (period === 'diario') {
    return 'Diario';
  }

  if (period === 'quinzenal') {
    return 'Quinzenal';
  }

  return 'Mensal';
}

function parseDecimalInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (normalized.length === 0) {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function buildRecentMonthOptions(referenceDate: Date = new Date(), totalMonths: number = 12): string[] {
  const months: string[] = [];

  for (let index = 0; index < totalMonths; index += 1) {
    const baseDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - index, 1);
    months.push(getCurrentMonthString(baseDate));
  }

  return months;
}

export function HistoryScreen({ canManageHistoryActions = false }: HistoryScreenProps) {
  const initialMonth = getCurrentMonthString();
  const isFocused = useIsFocused();
  const [mode, setMode] = useState<HistoryMode>('diario');
  const [dailyMovementFilter, setDailyMovementFilter] = useState<DailyMovementFilter>('entry');
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);
  const [dailyGroups, setDailyGroups] = useState<DailyHistoryGroup[]>([]);
  const [periodGroups, setPeriodGroups] = useState<PeriodHistoryGroup[]>([]);
  const [isReportPickerOpen, setIsReportPickerOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [activeDailyReportDate, setActiveDailyReportDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [expandedPeriodDays, setExpandedPeriodDays] = useState<Record<string, boolean>>({});
  const [periodDayFilters, setPeriodDayFilters] = useState<Record<string, PeriodDayMovementFilter>>({});
  const [fallbackPromptConfig, setFallbackPromptConfig] = useState<FallbackPromptConfig | null>(null);
  const [fallbackPromptValue, setFallbackPromptValue] = useState('');
  const fallbackPromptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const skipNextModeMonthLoadRef = useRef(false);
  const { showTopPopup } = useTopPopup();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const isDailyMode = mode === 'diario';
  const monthOptions = useMemo(() => buildRecentMonthOptions(new Date(), 12), []);

  const normalizedSearchQuery = useMemo(() => normalizeSearchValue(searchQuery), [searchQuery]);
  const selectedNormalized = useMemo(
    () => selectedItems.map((name) => normalizeSearchValue(name)),
    [selectedItems],
  );
  const hasItemFilter = selectedItems.length > 0;

  // Nomes de item distintos presentes nos dados carregados (fonte das sugestoes).
  const availableItemNames = useMemo(() => {
    const names = new Map<string, string>();
    const collect = (name: string) => {
      const normalized = normalizeSearchValue(name);
      if (normalized && !names.has(normalized)) {
        names.set(normalized, name);
      }
    };

    for (const group of dailyGroups) {
      for (const entry of group.entries) {
        collect(entry.name);
      }
    }
    for (const group of periodGroups) {
      for (const day of group.days) {
        for (const entry of day.entries) {
          collect(entry.name);
        }
      }
    }

    return Array.from(names.values());
  }, [dailyGroups, periodGroups]);

  // Sugestoes so aparecem apos digitar (igual a Entrada/Saida/Itens/Estoque).
  const searchSuggestions = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const selectedSet = new Set(selectedNormalized);
    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];

    for (const name of availableItemNames) {
      const normalizedName = normalizeSearchValue(name);

      if (selectedSet.has(normalizedName)) {
        continue;
      }

      if (normalizedName.startsWith(normalizedSearchQuery)) {
        startsWithMatches.push(name);
        continue;
      }

      if (normalizedName.includes(normalizedSearchQuery)) {
        containsMatches.push(name);
      }
    }

    return [...startsWithMatches, ...containsMatches].slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS);
  }, [availableItemNames, normalizedSearchQuery, selectedNormalized]);

  function addSelectedItem(name: string) {
    const normalized = normalizeSearchValue(name);
    setSelectedItems((previous) =>
      previous.some((item) => normalizeSearchValue(item) === normalized) ? previous : [...previous, name],
    );
    setSearchQuery('');
  }

  function removeSelectedItem(name: string) {
    const normalized = normalizeSearchValue(name);
    setSelectedItems((previous) => previous.filter((item) => normalizeSearchValue(item) !== normalized));
  }

  function clearSelectedItems() {
    setSelectedItems([]);
    setSearchQuery('');
  }

  const displayedDailyGroups = useMemo(() => {
    if (!hasItemFilter) {
      return dailyGroups;
    }

    return dailyGroups.filter((group) => {
      const movementEntries = group.entries.filter(
        (entry) => resolveMovementFilter(entry.movementType) === dailyMovementFilter,
      );
      return entriesHaveAllSelected(movementEntries, selectedNormalized);
    });
  }, [dailyGroups, hasItemFilter, selectedNormalized, dailyMovementFilter]);

  const displayedPeriodGroups = useMemo(() => {
    if (!hasItemFilter) {
      return periodGroups;
    }

    return periodGroups
      .map((group) => ({
        ...group,
        days: group.days.filter((day) => entriesHaveAllSelected(day.entries, selectedNormalized)),
      }))
      .filter((group) => group.days.length > 0);
  }, [periodGroups, hasItemFilter, selectedNormalized]);

  async function loadHistory(nextMode: HistoryMode, nextMonth: string, syncFirst: boolean = false) {
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (syncFirst) {
        const syncOk = await syncAppData();

        if (!syncOk) {
          setDailyGroups([]);
          setPeriodGroups([]);
          throw new Error(
            'Falha ao sincronizar com o Supabase. Conecte-se e tente novamente para carregar o historico.',
          );
        }
      }

      if (nextMode === 'diario') {
        const dailyData = await listDailyHistoryGrouped();
        setDailyGroups(dailyData);
        setPeriodGroups([]);
      } else if (nextMode === 'quinzenal') {
        const fortnightData = await listFortnightlyHistoryGrouped(nextMonth);
        setPeriodGroups(fortnightData);
        setDailyGroups([]);
      } else {
        const monthlyData = await listMonthlyHistoryGrouped(nextMonth);
        setPeriodGroups(monthlyData);
        setDailyGroups([]);
      }
    } catch (error) {
      setDailyGroups([]);
      setPeriodGroups([]);
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar historico.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    skipNextModeMonthLoadRef.current = true;
    void loadHistory(mode, selectedMonth, true);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (skipNextModeMonthLoadRef.current) {
      skipNextModeMonthLoadRef.current = false;
      return;
    }

    void loadHistory(mode, selectedMonth, true);
  }, [mode, selectedMonth, isFocused]);

  useEffect(() => {
    setExpandedPeriodDays({});
    setPeriodDayFilters({});
    setIsMonthMenuOpen(false);
  }, [mode, selectedMonth]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    showTopPopup({
      type: 'success',
      message: successMessage,
      durationMs: 3000,
    });
  }, [showTopPopup, successMessage]);

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

  function selectMode(nextMode: HistoryMode) {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
  }

  function setCurrentMonth() {
    const currentMonth = getCurrentMonthString();
    setSelectedMonth(currentMonth);
    setIsMonthMenuOpen(false);
    setErrorMessage('');
    setSuccessMessage('');
  }

  function selectMonth(monthValue: string) {
    setSelectedMonth(monthValue);
    setIsMonthMenuOpen(false);
    setErrorMessage('');
    setSuccessMessage('');
  }

  function openFallbackPrompt(config: FallbackPromptConfig): Promise<string | null> {
    return new Promise((resolve) => {
      fallbackPromptResolverRef.current = resolve;
      setFallbackPromptValue(config.defaultValue ?? '');
      setFallbackPromptConfig(config);
    });
  }

  function closeFallbackPrompt(value: string | null) {
    const resolver = fallbackPromptResolverRef.current;
    fallbackPromptResolverRef.current = null;
    setFallbackPromptConfig(null);
    setFallbackPromptValue('');
    resolver?.(value);
  }

  async function requestTextValue(config: FallbackPromptConfig): Promise<string | null> {
    if (Platform.OS === 'web') {
      if (typeof globalThis.prompt === 'function') {
        const fullMessage = `${config.title}\n${config.message}`;
        return globalThis.prompt(fullMessage, config.defaultValue ?? '') ?? null;
      }

      return null;
    }

    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      return new Promise((resolve) => {
        let settled = false;

        const finish = (value: string | null) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };

        Alert.prompt(
          config.title,
          config.message,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => finish(null) },
            {
              text: 'Confirmar',
              onPress: (value?: string) => finish(typeof value === 'string' ? value : ''),
            },
          ],
          config.secureTextEntry ? 'secure-text' : 'plain-text',
          config.defaultValue ?? '',
          config.keyboardType,
        );
      });
    }

    return openFallbackPrompt(config);
  }

  async function confirmAction(title: string, message: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function') {
        return globalThis.confirm(message);
      }

      return true;
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      Alert.alert(
        title,
        message,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
          { text: 'Confirmar', style: 'destructive', onPress: () => finish(true) },
        ],
        { cancelable: true, onDismiss: () => finish(false) },
      );
    });
  }

  async function requestUpdatedQuantity(currentQuantity: number): Promise<number | null> {
    const value = await requestTextValue({
      title: 'Editar quantidade',
      message: 'Informe a nova quantidade desta movimentacao.',
      placeholder: 'Quantidade',
      secureTextEntry: false,
      keyboardType: 'decimal-pad',
      defaultValue: String(currentQuantity),
    });

    if (value === null) {
      return null;
    }

    const parsed = parseDecimalInput(value);

    if (parsed === null || parsed < 0) {
      setErrorMessage('Informe uma quantidade valida para editar a movimentacao.');
      return null;
    }

    return parsed;
  }

  async function handleEditEntry(entry: DailyHistoryEntry) {
    if (!canManageHistoryActions) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    const updatedQuantity = await requestUpdatedQuantity(entry.quantity);

    if (updatedQuantity === null) {
      return;
    }

    setActiveActionKey(`edit-${entry.id}`);

    try {
      await updateDailyHistoryEntry(entry.id, updatedQuantity);
      setSuccessMessage(`Movimentacao de ${formatDateLabel(entry.date)} atualizada com sucesso.`);
      await loadHistory('diario', selectedMonth, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao editar movimentacao.';
      await loadHistory('diario', selectedMonth);
      setErrorMessage(message);
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleArchiveEntry(entry: DailyHistoryEntry) {
    if (!canManageHistoryActions) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    const confirmed = await confirmAction(
      'Excluir movimentacao',
      `Deseja excluir esta movimentacao de ${entry.name} em ${formatDateLabel(entry.date)}?`,
    );

    if (!confirmed) {
      return;
    }

    setActiveActionKey(`delete-entry-${entry.id}`);

    try {
      await archiveDailyHistoryEntry(entry.id);
      setSuccessMessage(`Movimentacao removida de ${formatDateLabel(entry.date)}.`);
      await loadHistory('diario', selectedMonth, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao excluir movimentacao.';
      await loadHistory('diario', selectedMonth);
      setErrorMessage(message);
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleArchiveDate(date: string) {
    if (!canManageHistoryActions) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    const confirmed = await confirmAction(
      'Excluir movimentacoes do dia',
      `Deseja excluir todas as movimentacoes de ${formatDateLabel(date)}?`,
    );

    if (!confirmed) {
      return;
    }

    setActiveActionKey(`delete-date-${date}`);

    try {
      await archiveDailyHistoryDate(date);
      setSuccessMessage(`Movimentacoes de ${formatDateLabel(date)} excluidas com sucesso.`);
      await loadHistory('diario', selectedMonth, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao excluir movimentacoes do dia.';
      await loadHistory('diario', selectedMonth);
      setErrorMessage(message);
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleArchiveDateByMovement(date: string, movementFilter: DailyMovementFilter) {
    if (!canManageHistoryActions) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    const movementLabel = getDailyMovementFilterLabel(movementFilter);
    const confirmed = await confirmAction(
      `Excluir movimentacoes de ${movementLabel}`,
      `Deseja excluir apenas as movimentacoes de ${movementLabel} em ${formatDateLabel(date)}?`,
    );

    if (!confirmed) {
      return;
    }

    setActiveActionKey(`delete-date-movement-${date}-${movementFilter}`);

    try {
      await archiveDailyHistoryDateByMovement(date, movementFilter);
      setSuccessMessage(`Movimentacoes de ${movementLabel} excluidas de ${formatDateLabel(date)}.`);
      await loadHistory('diario', selectedMonth, true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Falha ao excluir movimentacoes de ${movementLabel}.`;
      await loadHistory('diario', selectedMonth);
      setErrorMessage(message);
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleGenerateReport(period: HistoryReportPeriod) {
    if (isGeneratingReport) {
      return;
    }

    setIsReportPickerOpen(false);
    setErrorMessage('');
    setSuccessMessage('');
    setIsGeneratingReport(true);

    try {
      const result = await generateHistoryReportPdf(period, { selectedMonth });
      const periodLabel = getHistoryReportPeriodLabel(period);

      showTopPopup({
        type: 'success',
        message:
          Platform.OS === 'web'
            ? `Relatorio ${periodLabel.toLowerCase()} enviado para visualizacao/impressao.`
            : result.totalMovements === 0
              ? `Relatorio ${periodLabel.toLowerCase()} gerado sem movimentacoes no periodo.`
            : result.shared
              ? `Relatorio ${periodLabel.toLowerCase()} gerado e pronto para compartilhar.`
              : `Relatorio ${periodLabel.toLowerCase()} gerado com sucesso.`,
        durationMs: 3600,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao gerar relatorio.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleGenerateDailyReportForDate(date: string) {
    if (isGeneratingReport) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsGeneratingReport(true);
    setActiveDailyReportDate(date);

    try {
      const [year, month, day] = date.split('-').map(Number);
      const referenceDate = new Date(year, month - 1, day, 12, 0, 0, 0);
      const result = await generateHistoryReportPdf('diario', { selectedMonth, referenceDate });

      showTopPopup({
        type: 'success',
        message:
          Platform.OS === 'web'
            ? `Relatorio diario de ${formatDateLabel(date)} enviado para visualizacao/impressao.`
            : result.totalMovements === 0
              ? `Relatorio diario de ${formatDateLabel(date)} gerado sem movimentacoes.`
              : result.shared
                ? `Relatorio diario de ${formatDateLabel(date)} gerado e pronto para compartilhar.`
                : `Relatorio diario de ${formatDateLabel(date)} gerado com sucesso.`,
        durationMs: 3600,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao gerar relatorio diario.');
    } finally {
      setIsGeneratingReport(false);
      setActiveDailyReportDate(null);
    }
  }

  const heroText = useMemo(() => {
    if (mode === 'diario') {
      return {
        title: 'Historico Diario',
        description: 'Veja cada movimentacao salva por dia, incluindo saldo apos cada lancamento.',
      };
    }

    if (mode === 'quinzenal') {
      return {
        title: 'Relatorio Quinzenal',
        description:
          'Acompanhe os dias com movimentacao em cada quinzena e abra os lancamentos para ver detalhes.',
      };
    }

    return {
      title: 'Relatorio Mensal',
      description:
        'Visualize os dias com entrada e saida no mes, com todos os itens movimentados e status de compra.',
    };
  }, [mode]);
  const totalGroups = isDailyMode ? displayedDailyGroups.length : displayedPeriodGroups.length;
  const periodLabel = isDailyMode ? 'Dia' : mode === 'quinzenal' ? 'Quinzena' : 'Mes';

  return (
    <ScreenShell>
      <FlatList<DailyHistoryGroup | PeriodHistoryGroup>
        data={isDailyMode ? displayedDailyGroups : displayedPeriodGroups}
        keyExtractor={(item) => ('date' in item ? item.date : item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadHistory(mode, selectedMonth, true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title={heroText.title}
                subtitle={`Visao: ${periodLabel}`}
                description={heroText.description}
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Registros" value={String(totalGroups)} />
                  <KpiTile
                    label="Filtro"
                    value={isDailyMode ? getDailyMovementFilterLabel(dailyMovementFilter) : 'Completo'}
                  />
                  <KpiTile
                    label="Mes"
                    value={isDailyMode ? '--' : formatMonthLabel(selectedMonth)}
                  />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.modeSwitcher}>
              <Pressable
                style={[styles.modeButton, mode === 'diario' ? styles.modeButtonActive : undefined]}
                onPress={() => selectMode('diario')}
              >
                <Text style={[styles.modeText, mode === 'diario' ? styles.modeTextActive : undefined]}>
                  Diario
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeButton, mode === 'quinzenal' ? styles.modeButtonActive : undefined]}
                onPress={() => selectMode('quinzenal')}
              >
                <Text style={[styles.modeText, mode === 'quinzenal' ? styles.modeTextActive : undefined]}>
                  Quinzenal
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeButton, mode === 'mensal' ? styles.modeButtonActive : undefined]}
                onPress={() => selectMode('mensal')}
              >
                <Text style={[styles.modeText, mode === 'mensal' ? styles.modeTextActive : undefined]}>
                  Mensal
                </Text>
              </Pressable>
            </View>

            <View style={styles.searchCard}>
              <View style={styles.searchHeader}>
                <Text style={styles.searchLabel}>Buscar item</Text>
                {hasItemFilter ? (
                  <Pressable style={styles.clearSearchButton} onPress={clearSelectedItems}>
                    <Text style={styles.clearSearchButtonText}>Limpar</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Digite o nome do item"
                style={styles.searchInput}
              />
              {searchSuggestions.length > 0 ? (
                <View style={styles.searchSuggestionsContainer}>
                  {searchSuggestions.map((suggestion, index) => (
                    <Pressable
                      key={`suggestion-${suggestion}`}
                      style={[
                        styles.searchSuggestionButton,
                        index === searchSuggestions.length - 1 ? styles.searchSuggestionButtonLast : undefined,
                      ]}
                      onPress={() => addSelectedItem(suggestion)}
                    >
                      <Text style={styles.searchSuggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {hasItemFilter ? (
                <View style={styles.selectedChipsRow}>
                  {selectedItems.map((item) => (
                    <Pressable
                      key={`selected-${item}`}
                      style={styles.selectedChip}
                      onPress={() => removeSelectedItem(item)}
                    >
                      <Text style={styles.selectedChipText} numberOfLines={1}>
                        {item}
                      </Text>
                      <Text style={styles.selectedChipRemove}>×</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {isDailyMode ? (
              <View style={styles.dailyFilterSwitcher}>
                <Pressable
                  style={[
                    styles.dailyFilterButton,
                    dailyMovementFilter === 'entry' ? styles.dailyFilterButtonActive : undefined,
                  ]}
                  onPress={() => setDailyMovementFilter('entry')}
                >
                  <Text
                    style={[
                      styles.dailyFilterText,
                      dailyMovementFilter === 'entry' ? styles.dailyFilterTextActive : undefined,
                    ]}
                  >
                    Entrada
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dailyFilterButton,
                    dailyMovementFilter === 'exit' ? styles.dailyFilterButtonActive : undefined,
                  ]}
                  onPress={() => setDailyMovementFilter('exit')}
                >
                  <Text
                    style={[
                      styles.dailyFilterText,
                      dailyMovementFilter === 'exit' ? styles.dailyFilterTextActive : undefined,
                    ]}
                  >
                    Saida
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {!isDailyMode ? (
              <View style={styles.monthCard}>
                <Text style={styles.monthLabel}>Mes do relatorio</Text>
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
                      {monthOptions.map((monthValue) => {
                        const isSelected = selectedMonth === monthValue;

                        return (
                          <Pressable
                            key={monthValue}
                            style={[styles.monthSelectOption, isSelected ? styles.monthSelectOptionActive : undefined]}
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
                <Pressable style={styles.monthButton} onPress={setCurrentMonth}>
                  <Text style={styles.monthButtonText}>Mes atual</Text>
                </Pressable>
              </View>
            ) : null}

            {!isDailyMode ? (
              <View style={styles.reportButtonWrap}>
                <AppButton
                  label={isGeneratingReport ? 'Gerando relatorio...' : 'Gerar Relatorio'}
                  onPress={() => {
                    setIsReportPickerOpen(true);
                  }}
                  disabled={isGeneratingReport}
                />
              </View>
            ) : null}

          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando historico...</Text>
          ) : hasItemFilter ? (
            <Text style={styles.emptyText}>
              Nenhuma movimentacao encontrada para os itens selecionados.
            </Text>
          ) : (
            <Text style={styles.emptyText}>
              {isDailyMode
                ? `Nenhuma movimentacao de ${getDailyMovementFilterLabel(dailyMovementFilter)} registrada para este filtro.`
                : 'Nenhuma movimentacao registrada para este filtro.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          if ('date' in item) {
            const dailyItem = item;
            const filteredEntries = keepSelectedEntries(
              dailyItem.entries.filter(
                (entry) => resolveMovementFilter(entry.movementType) === dailyMovementFilter,
              ),
              selectedNormalized,
            );
            const filteredCountedItems = filteredEntries.length;
            const filteredOkItems = filteredEntries.filter((entry) => !entry.needsPurchase).length;
            const filteredNeedPurchaseItems = filteredEntries.filter((entry) => entry.needsPurchase).length;
            const filteredTotalMissingQuantity = filteredEntries.reduce(
              (sum, entry) => sum + entry.missingQuantityInBaseUnits,
              0,
            );

            return (
              <View style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupDate}>{formatDateLabel(dailyItem.date)}</Text>
                  <View style={styles.groupHeaderActions}>
                    <Pressable
                      style={[
                        styles.generateDayReportButton,
                        activeDailyReportDate === dailyItem.date ? styles.actionDisabled : undefined,
                      ]}
                      onPress={() => {
                        void handleGenerateDailyReportForDate(dailyItem.date);
                      }}
                      disabled={isGeneratingReport}
                    >
                      <Text style={styles.generateDayReportButtonText}>
                        {activeDailyReportDate === dailyItem.date ? 'Gerando relatorio...' : 'Gerar relatorio'}
                      </Text>
                    </Pressable>
                    {canManageHistoryActions ? (
                      <Pressable
                        style={[
                          styles.deleteMovementButton,
                          activeActionKey ===
                            `delete-date-movement-${dailyItem.date}-${dailyMovementFilter}`
                            ? styles.actionDisabled
                            : undefined,
                          filteredEntries.length === 0 ? styles.actionDisabled : undefined,
                        ]}
                        onPress={() => {
                          void handleArchiveDateByMovement(dailyItem.date, dailyMovementFilter);
                        }}
                        disabled={activeActionKey !== null || filteredEntries.length === 0}
                      >
                        <Text style={styles.deleteMovementButtonText}>Excluir movimentacao</Text>
                      </Pressable>
                    ) : null}
                    {canManageHistoryActions ? (
                      <Pressable
                        style={[
                          styles.deleteDayButton,
                          activeActionKey === `delete-date-${dailyItem.date}` ? styles.actionDisabled : undefined,
                        ]}
                        onPress={() => {
                          void handleArchiveDate(dailyItem.date);
                        }}
                        disabled={activeActionKey !== null}
                      >
                        <Text style={styles.deleteDayButtonText}>Excluir dia</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.groupBadge}>
                      <Text style={styles.groupBadgeText}>{filteredCountedItems} mov.</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.groupSummary}>
                  Total itens: {dailyItem.totalItems} | Movimentacoes: {filteredCountedItems} | OK:{' '}
                  {filteredOkItems} | Comprar: {filteredNeedPurchaseItems} | Faltante total:{' '}
                  {formatQuantity(filteredTotalMissingQuantity)} und
                </Text>

                {filteredEntries.length === 0 ? (
                  <Text style={styles.entryMeta}>
                    Sem movimentacoes de {getDailyMovementFilterLabel(dailyMovementFilter)} neste dia.
                  </Text>
                ) : (
                  filteredEntries.map((entry) => (
                    <View key={String(entry.id)} style={styles.entryRow}>
                      <View style={styles.entryInfo}>
                        <View style={styles.entryTitleRow}>
                          <Text style={styles.entryName}>{entry.name}</Text>
                          {entry.itemDeleted ? (
                            <View style={styles.deletedBadge}>
                              <Text style={styles.deletedBadgeText}>Item arquivado</Text>
                            </View>
                          ) : null}
                        </View>
                        <StockEmphasis
                          label={getMovementTypeLabel(entry.movementType)}
                          value={formatOriginalAndBaseQuantity(
                            entry.quantity,
                            entry.unit,
                            entry.conversionFactor,
                            formatQuantity,
                          )}
                          tone="normal"
                        />
                        <Text style={styles.entryMeta}>
                          Saldo apos:{' '}
                          {entry.stockAfterQuantity === null
                            ? '-'
                            : formatOriginalAndBaseQuantity(
                                entry.stockAfterQuantity,
                                entry.unit,
                                entry.conversionFactor,
                                formatQuantity,
                              )}{' '}
                          | Min{' '}
                          {formatOriginalAndBaseQuantity(
                            entry.minQuantity,
                            entry.unit,
                            entry.conversionFactor,
                            formatQuantity,
                          )}
                        </Text>
                        <Text style={styles.entryMeta}>
                          Feito por: {entry.createdByUsername?.trim() ? entry.createdByUsername : 'Nao informado'}
                        </Text>
                        {canManageHistoryActions ? (
                          <View style={styles.entryActions}>
                            <Pressable
                              style={[
                                styles.entryActionButton,
                                activeActionKey === `edit-${entry.id}`
                                  ? styles.actionDisabled
                                  : undefined,
                              ]}
                              onPress={() => {
                                void handleEditEntry(entry);
                              }}
                              disabled={activeActionKey !== null}
                            >
                              <Text style={styles.entryActionButtonText}>Editar</Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.entryDeleteButton,
                                activeActionKey === `delete-entry-${entry.id}`
                                  ? styles.actionDisabled
                                  : undefined,
                              ]}
                              onPress={() => {
                                void handleArchiveEntry(entry);
                              }}
                              disabled={activeActionKey !== null}
                            >
                              <Text style={styles.entryDeleteButtonText}>Excluir item</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          entry.needsPurchase ? styles.statusNeedPurchase : styles.statusOk,
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {entry.needsPurchase
                            ? entry.missingQuantity > 0
                              ? `Comprar ${formatOriginalAndBaseQuantity(
                                  entry.missingQuantity,
                                  entry.unit,
                                  entry.conversionFactor,
                                  formatQuantity,
                                )}`
                              : 'No minimo (comprar)'
                            : 'OK'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          }

          const periodItem = item;

          return (
            <View style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDate}>{periodItem.label}</Text>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>
                    {hasItemFilter ? periodItem.days.length : periodItem.inspectedDays} dias
                  </Text>
                </View>
              </View>

              {hasItemFilter ? (
                <Text style={styles.groupSummary}>
                  Filtro de itens ativo · {periodItem.days.length} dia(s) ·{' '}
                  {periodItem.days.reduce(
                    (sum, day) => sum + keepSelectedEntries(day.entries, selectedNormalized).length,
                    0,
                  )}{' '}
                  movimentacao(oes)
                </Text>
              ) : (
                <Text style={styles.groupSummary}>
                  Registros: {periodItem.countedEntries} | Itens para comprar: {periodItem.itemsToBuyCount} | Faltante
                  total: {formatQuantity(periodItem.totalMissingQuantityInBaseUnits)} und | Consumo total:{' '}
                  {formatQuantity(periodItem.totalConsumedQuantityInBaseUnits)} und
                </Text>
              )}

              {periodItem.days.length === 0 ? (
                <Text style={styles.entryMeta}>Sem movimentacoes neste periodo.</Text>
              ) : (
                <View style={styles.periodDaysContainer}>
                  {periodItem.days.map((day) => {
                    const dayKey = `${periodItem.id}-${day.date}`;
                    const isExpanded = expandedPeriodDays[dayKey] === true;
                    const selectedDayFilter = periodDayFilters[dayKey] ?? 'all';
                    const baseDayEntries =
                      selectedDayFilter === 'all'
                        ? day.entries
                        : day.entries.filter(
                            (entry) => resolveMovementFilter(entry.movementType) === selectedDayFilter,
                          );
                    const filteredDayEntries = keepSelectedEntries(baseDayEntries, selectedNormalized);
                    const movementCount =
                      selectedDayFilter === 'all' && !hasItemFilter
                        ? day.entries.length
                        : filteredDayEntries.length;

                    return (
                      <View key={dayKey} style={styles.periodDayCard}>
                        <Pressable
                          style={styles.periodDayHeader}
                          onPress={() => {
                            const nextExpanded = !isExpanded;

                            setExpandedPeriodDays((previousState) => ({
                              ...previousState,
                              [dayKey]: nextExpanded,
                            }));

                            if (nextExpanded) {
                              setPeriodDayFilters((previousState) => ({
                                ...previousState,
                                [dayKey]: 'all',
                              }));
                            }
                          }}
                        >
                          <View style={styles.periodDayHeaderLeft}>
                            <Text style={styles.periodDayDate}>{formatDateLabel(day.date)}</Text>
                          </View>
                          <View style={styles.periodDayHeaderRight}>
                            <View style={styles.groupBadge}>
                              <Text style={styles.groupBadgeText}>{movementCount} mov.</Text>
                            </View>
                            <Text style={styles.periodExpandText}>{isExpanded ? 'Ocultar' : 'Ver itens'}</Text>
                          </View>
                        </Pressable>
                        <View style={styles.periodDayTypeBadges}>
                          {day.hasEntry ? (
                            <Pressable
                              style={[
                                styles.periodMovementBadge,
                                selectedDayFilter === 'entry'
                                  ? styles.periodMovementEntryActive
                                  : styles.periodMovementEntryInactive,
                              ]}
                              onPress={() => {
                                setExpandedPeriodDays((previousState) => ({
                                  ...previousState,
                                  [dayKey]: true,
                                }));
                                setPeriodDayFilters((previousState) => ({
                                  ...previousState,
                                  [dayKey]: 'entry',
                                }));
                              }}
                            >
                              <Text
                                style={[
                                  styles.periodMovementBadgeText,
                                  selectedDayFilter === 'entry'
                                    ? styles.periodMovementEntryTextActive
                                    : styles.periodMovementEntryTextInactive,
                                ]}
                              >
                                Entrada
                              </Text>
                            </Pressable>
                          ) : null}
                          {day.hasExit ? (
                            <Pressable
                              style={[
                                styles.periodMovementBadge,
                                selectedDayFilter === 'exit'
                                  ? styles.periodMovementExitActive
                                  : styles.periodMovementExitInactive,
                              ]}
                              onPress={() => {
                                setExpandedPeriodDays((previousState) => ({
                                  ...previousState,
                                  [dayKey]: true,
                                }));
                                setPeriodDayFilters((previousState) => ({
                                  ...previousState,
                                  [dayKey]: 'exit',
                                }));
                              }}
                            >
                              <Text
                                style={[
                                  styles.periodMovementBadgeText,
                                  selectedDayFilter === 'exit'
                                    ? styles.periodMovementExitTextActive
                                    : styles.periodMovementExitTextInactive,
                                ]}
                              >
                                Saida
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {isExpanded ? (
                          filteredDayEntries.length === 0 ? (
                            <Text style={styles.entryMeta}>
                              {selectedDayFilter === 'entry'
                                ? 'Sem movimentacoes de Entrada neste dia.'
                                : selectedDayFilter === 'exit'
                                  ? 'Sem movimentacoes de Saida neste dia.'
                                  : 'Sem movimentacoes neste dia.'}
                            </Text>
                          ) : (
                            filteredDayEntries.map((entry) => (
                              <View key={`${dayKey}-${entry.id}`} style={styles.entryRow}>
                                <View style={styles.entryInfo}>
                                  <View style={styles.entryTitleRow}>
                                    <Text style={styles.entryName}>{entry.name}</Text>
                                    {entry.itemDeleted ? (
                                      <View style={styles.deletedBadge}>
                                        <Text style={styles.deletedBadgeText}>Item arquivado</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <StockEmphasis
                                    label={getDailyMovementFilterLabel(resolveMovementFilter(entry.movementType))}
                                    value={formatOriginalAndBaseQuantity(
                                      entry.quantity,
                                      entry.unit,
                                      entry.conversionFactor,
                                      formatQuantity,
                                    )}
                                    tone="normal"
                                  />
                                  <Text style={styles.entryMeta}>
                                    Saldo apos:{' '}
                                    {entry.stockAfterQuantity === null
                                      ? '-'
                                      : formatOriginalAndBaseQuantity(
                                          entry.stockAfterQuantity,
                                          entry.unit,
                                          entry.conversionFactor,
                                          formatQuantity,
                                        )}{' '}
                                    | Min{' '}
                                    {formatOriginalAndBaseQuantity(
                                      entry.minQuantity,
                                      entry.unit,
                                      entry.conversionFactor,
                                      formatQuantity,
                                    )}
                                  </Text>
                                  <Text style={styles.entryMeta}>
                                    Feito por: {entry.createdByUsername?.trim() ? entry.createdByUsername : 'Nao informado'}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.statusBadge,
                                    entry.needsPurchase ? styles.statusNeedPurchase : styles.statusOk,
                                  ]}
                                >
                                  <Text style={styles.statusText}>
                                    {entry.needsPurchase
                                      ? entry.missingQuantity > 0
                                        ? `Comprar ${formatOriginalAndBaseQuantity(
                                            entry.missingQuantity,
                                            entry.unit,
                                            entry.conversionFactor,
                                            formatQuantity,
                                          )}`
                                        : 'No minimo (comprar)'
                                      : 'OK'}
                                  </Text>
                                </View>
                              </View>
                            ))
                          )
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />

      {isReportPickerOpen ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isGeneratingReport) {
              setIsReportPickerOpen(false);
            }
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Gerar Relatorio</Text>
              <Text style={styles.modalMessage}>Escolha o periodo para montar o PDF.</Text>
              <View style={styles.reportPeriodActions}>
                <Pressable
                  style={[
                    styles.reportPeriodButton,
                    isGeneratingReport ? styles.actionDisabled : undefined,
                  ]}
                  onPress={() => {
                    void handleGenerateReport('diario');
                  }}
                  disabled={isGeneratingReport}
                >
                  <Text style={styles.reportPeriodButtonText}>Diario</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.reportPeriodButton,
                    isGeneratingReport ? styles.actionDisabled : undefined,
                  ]}
                  onPress={() => {
                    void handleGenerateReport('quinzenal');
                  }}
                  disabled={isGeneratingReport}
                >
                  <Text style={styles.reportPeriodButtonText}>Quinzenal</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.reportPeriodButton,
                    isGeneratingReport ? styles.actionDisabled : undefined,
                  ]}
                  onPress={() => {
                    void handleGenerateReport('mensal');
                  }}
                  disabled={isGeneratingReport}
                >
                  <Text style={styles.reportPeriodButtonText}>Mensal</Text>
                </Pressable>
              </View>
              <Pressable
                style={[
                  styles.modalCancelButton,
                  isGeneratingReport ? styles.actionDisabled : undefined,
                ]}
                onPress={() => setIsReportPickerOpen(false)}
                disabled={isGeneratingReport}
              >
                <Text style={styles.modalCancelButtonText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {fallbackPromptConfig ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => closeFallbackPrompt(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{fallbackPromptConfig.title}</Text>
              <Text style={styles.modalMessage}>{fallbackPromptConfig.message}</Text>
              <TextInput
                value={fallbackPromptValue}
                onChangeText={setFallbackPromptValue}
                placeholder={fallbackPromptConfig.placeholder}
                secureTextEntry={fallbackPromptConfig.secureTextEntry}
                keyboardType={fallbackPromptConfig.keyboardType}
                style={styles.modalInput}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelButton} onPress={() => closeFallbackPrompt(null)}>
                  <Text style={styles.modalCancelButtonText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={styles.modalConfirmButton}
                  onPress={() => closeFallbackPrompt(fallbackPromptValue)}
                >
                  <Text style={styles.modalConfirmButtonText}>Confirmar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    marginBottom: 6,
    gap: 10,
  },
  heroCard: {
    display: 'none',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F5EEFB',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#EDE0F9',
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#EDE0F9',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#8A2AA3',
  },
  modeText: {
    color: '#77158E',
    fontWeight: '700',
    fontSize: 12,
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  dailyFilterSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#EAD9F6',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#D8C3EA',
  },
  dailyFilterButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyFilterButtonActive: {
    backgroundColor: '#77158E',
  },
  dailyFilterText: {
    color: '#77158E',
    fontWeight: '700',
    fontSize: 12,
  },
  dailyFilterTextActive: {
    color: '#FFFFFF',
  },
  monthCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    ...tokens.shadow.card,
  },
  monthLabel: {
    fontSize: 13,
    color: '#77158E',
    fontWeight: '700',
  },
  monthSelectRoot: {
    gap: 6,
  },
  monthSelectTrigger: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthSelectTriggerText: {
    color: '#2A0834',
    fontSize: 16,
    fontWeight: '600',
  },
  monthSelectArrow: {
    color: '#77158E',
    fontSize: 16,
    fontWeight: '700',
  },
  monthSelectMenu: {
    borderWidth: 1,
    borderColor: '#C6A8DD',
    borderRadius: 12,
    backgroundColor: '#FCF9FF',
    overflow: 'hidden',
  },
  monthSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#EFE3FA',
  },
  monthSelectOptionActive: {
    backgroundColor: '#EDE0F9',
  },
  monthSelectOptionText: {
    color: '#5F1175',
    fontSize: 14,
    fontWeight: '600',
  },
  monthSelectOptionTextActive: {
    color: '#3A0D49',
    fontWeight: '800',
  },
  monthButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    paddingVertical: 8,
    alignItems: 'center',
  },
  monthButtonText: {
    color: '#5F1175',
    fontWeight: '700',
    fontSize: 13,
  },
  reportButtonWrap: {
    marginTop: 2,
  },
  searchCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    ...tokens.shadow.card,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  searchLabel: {
    fontSize: 13,
    color: '#77158E',
    fontWeight: '700',
  },
  clearSearchButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearSearchButtonText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2A0834',
    fontSize: 14,
  },
  searchSuggestionsContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8C3EA',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  searchSuggestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAD9F6',
  },
  searchSuggestionButtonLast: {
    borderBottomWidth: 0,
  },
  searchSuggestionText: {
    color: '#3A0D49',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9D63C4',
    backgroundColor: '#EDE0F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedChipText: {
    flexShrink: 1,
    color: '#441055',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedChipRemove: {
    color: '#5F1175',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 16,
  },
  successText: {
    color: '#2F8A5F',
    backgroundColor: '#EDF8F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    marginTop: 16,
    fontWeight: '700',
  },
  groupCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    ...tokens.shadow.card,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  groupDate: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#3A0D49',
  },
  groupHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteDayButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#EFA0A0',
  },
  deleteDayButtonText: {
    color: '#A12020',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteMovementButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  deleteMovementButtonText: {
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '700',
  },
  generateDayReportButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  generateDayReportButtonText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
  },
  groupBadge: {
    borderRadius: 999,
    backgroundColor: '#EDE0F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupBadgeText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
  },
  groupSummary: {
    fontSize: 13,
    color: '#77158E',
  },
  periodDaysContainer: {
    gap: 8,
  },
  periodDayCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8C3EA',
    backgroundColor: '#F8F1FD',
    padding: 10,
    gap: 8,
  },
  periodDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  periodDayHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  periodDayDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3A0D49',
  },
  periodDayTypeBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  periodMovementBadge: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodMovementEntryActive: {
    backgroundColor: '#2C8A5A',
    borderColor: '#237047',
  },
  periodMovementExitActive: {
    backgroundColor: '#CF2D2D',
    borderColor: '#B02323',
  },
  periodMovementEntryInactive: {
    backgroundColor: '#EDF8F2',
    borderColor: '#86EFAC',
  },
  periodMovementExitInactive: {
    backgroundColor: '#FDECEC',
    borderColor: '#EFA0A0',
  },
  periodMovementBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  periodMovementEntryTextActive: {
    color: '#FFFFFF',
  },
  periodMovementExitTextActive: {
    color: '#FFFFFF',
  },
  periodMovementEntryTextInactive: {
    color: '#166534',
  },
  periodMovementExitTextInactive: {
    color: '#A12020',
  },
  periodDayHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  periodExpandText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#77158E',
  },
  entryRow: {
    backgroundColor: '#F8F1FD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8C3EA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  entryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2A0834',
  },
  deletedBadge: {
    backgroundColor: '#FDECEC',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deletedBadgeText: {
    color: '#A12020',
    fontSize: 10,
    fontWeight: '700',
  },
  entryMeta: {
    fontSize: 12,
    color: '#77158E',
  },
  entryActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  entryActionButton: {
    borderRadius: 8,
    backgroundColor: '#EDE0F9',
    borderWidth: 1,
    borderColor: '#B690D2',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryActionButtonText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
  },
  entryDeleteButton: {
    borderRadius: 8,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#EFA0A0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryDeleteButtonText: {
    color: '#A12020',
    fontSize: 12,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.55,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOk: {
    backgroundColor: '#D8C3EA',
  },
  statusNeedPurchase: {
    backgroundColor: '#E8CFF3',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3A0D49',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: tokens.colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    padding: 14,
    gap: 10,
    ...tokens.shadow.card,
  },
  modalTitle: {
    color: '#3A0D49',
    fontSize: 16,
    fontWeight: '800',
  },
  modalMessage: {
    color: '#77158E',
    fontSize: 13,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#2A0834',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  reportPeriodActions: {
    gap: 8,
  },
  reportPeriodButton: {
    borderRadius: 10,
    backgroundColor: '#8A2AA3',
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6D1F89',
  },
  reportPeriodButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B690D2',
    borderRadius: 10,
    backgroundColor: '#F5EEFB',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#5F1175',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#8A2AA3',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
