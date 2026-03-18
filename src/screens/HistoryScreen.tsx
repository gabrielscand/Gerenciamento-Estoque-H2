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
  archiveDailyHistoryEntry,
  listDailyHistoryGrouped,
  listFortnightlyHistoryGrouped,
  listMonthlyHistoryGrouped,
  updateDailyHistoryEntry,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import type { DailyHistoryEntry, DailyHistoryGroup, PeriodHistoryGroup } from '../types/inventory';
import {
  formatDateLabel,
  formatMonthLabel,
  getCurrentMonthString,
  parseDisplayMonthToIso,
} from '../utils/date';

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

export function HistoryScreen({ canManageHistoryActions = false }: HistoryScreenProps) {
  const initialMonth = getCurrentMonthString();
  const isFocused = useIsFocused();
  const [mode, setMode] = useState<HistoryMode>('diario');
  const [dailyMovementFilter, setDailyMovementFilter] = useState<DailyMovementFilter>('entry');
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [monthInputValue, setMonthInputValue] = useState(formatMonthLabel(initialMonth));
  const [monthInputError, setMonthInputError] = useState('');
  const [dailyGroups, setDailyGroups] = useState<DailyHistoryGroup[]>([]);
  const [periodGroups, setPeriodGroups] = useState<PeriodHistoryGroup[]>([]);
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

  const isDailyMode = mode === 'diario';

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
    setMonthInputValue(formatMonthLabel(selectedMonth));
  }, [selectedMonth]);

  useEffect(() => {
    setExpandedPeriodDays({});
    setPeriodDayFilters({});
  }, [mode, selectedMonth]);

  function selectMode(nextMode: HistoryMode) {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
  }

  function handleMonthInputChange(nextValue: string) {
    setMonthInputValue(nextValue);
    setErrorMessage('');
    setSuccessMessage('');

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

  return (
    <View style={styles.container}>
      <FlatList<DailyHistoryGroup | PeriodHistoryGroup>
        data={isDailyMode ? dailyGroups : periodGroups}
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

            <View style={styles.heroCard}>
              <Text style={styles.title}>{heroText.title}</Text>
              <Text style={styles.description}>{heroText.description}</Text>
            </View>

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
                <TextInput
                  value={monthInputValue}
                  onChangeText={handleMonthInputChange}
                  placeholder="MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                  style={[styles.monthInput, monthInputError ? styles.inputError : undefined]}
                />
                <Pressable style={styles.monthButton} onPress={setCurrentMonth}>
                  <Text style={styles.monthButtonText}>Mes atual</Text>
                </Pressable>
                {monthInputError ? <Text style={styles.errorText}>{monthInputError}</Text> : null}
              </View>
            ) : null}

            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando historico...</Text>
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
            const filteredEntries = dailyItem.entries.filter(
              (entry) => resolveMovementFilter(entry.movementType) === dailyMovementFilter,
            );
            const filteredCountedItems = filteredEntries.length;
            const filteredOkItems = filteredEntries.filter((entry) => !entry.needsPurchase).length;
            const filteredNeedPurchaseItems = filteredEntries.filter((entry) => entry.needsPurchase).length;
            const filteredTotalMissingQuantity = filteredEntries.reduce(
              (sum, entry) => sum + entry.missingQuantity,
              0,
            );

            return (
              <View style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupDate}>{formatDateLabel(dailyItem.date)}</Text>
                  <View style={styles.groupHeaderActions}>
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
                  {formatQuantity(filteredTotalMissingQuantity)}
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
                        <Text style={styles.entryMeta}>
                          {getMovementTypeLabel(entry.movementType)}: {formatQuantity(entry.quantity)} {entry.unit} | Min{' '}
                          {formatQuantity(entry.minQuantity)}
                        </Text>
                        <StockEmphasis
                          label="Saldo apos"
                          value={
                            entry.stockAfterQuantity === null
                              ? '-'
                              : `${formatQuantity(entry.stockAfterQuantity)} ${entry.unit}`
                          }
                          tone={
                            entry.stockAfterQuantity === null
                              ? 'empty'
                              : entry.needsPurchase
                                ? 'warning'
                                : 'normal'
                          }
                          helperText={entry.stockAfterQuantity === null ? 'Sem saldo registrado' : undefined}
                        />
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
                              ? `Comprar ${formatQuantity(entry.missingQuantity)} ${entry.unit}`
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
                  <Text style={styles.groupBadgeText}>{periodItem.inspectedDays} dias</Text>
                </View>
              </View>

              <Text style={styles.groupSummary}>
                Registros: {periodItem.countedEntries} | Itens para comprar: {periodItem.itemsToBuyCount} | Faltante
                total: {formatQuantity(periodItem.totalMissingQuantity)} | Consumo total:{' '}
                {formatQuantity(periodItem.totalConsumedQuantity)}
              </Text>

              {periodItem.days.length === 0 ? (
                <Text style={styles.entryMeta}>Sem movimentacoes neste periodo.</Text>
              ) : (
                <View style={styles.periodDaysContainer}>
                  {periodItem.days.map((day) => {
                    const dayKey = `${periodItem.id}-${day.date}`;
                    const isExpanded = expandedPeriodDays[dayKey] === true;
                    const selectedDayFilter = periodDayFilters[dayKey] ?? 'all';
                    const filteredDayEntries =
                      selectedDayFilter === 'all'
                        ? day.entries
                        : day.entries.filter(
                            (entry) => resolveMovementFilter(entry.movementType) === selectedDayFilter,
                          );
                    const movementCount =
                      selectedDayFilter === 'all' ? day.entries.length : filteredDayEntries.length;

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
                                  <Text style={styles.entryMeta}>
                                    {getDailyMovementFilterLabel(resolveMovementFilter(entry.movementType))}:{' '}
                                    {formatQuantity(entry.quantity)} {entry.unit} | Min{' '}
                                    {formatQuantity(entry.minQuantity)}
                                  </Text>
                                  <StockEmphasis
                                    label="Saldo apos"
                                    value={
                                      entry.stockAfterQuantity === null
                                        ? '-'
                                        : `${formatQuantity(entry.stockAfterQuantity)} ${entry.unit}`
                                    }
                                    tone={
                                      entry.stockAfterQuantity === null
                                        ? 'empty'
                                        : entry.needsPurchase
                                          ? 'warning'
                                          : 'normal'
                                    }
                                    helperText={entry.stockAfterQuantity === null ? 'Sem saldo registrado' : undefined}
                                  />
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
                                        ? `Comprar ${formatQuantity(entry.missingQuantity)} ${entry.unit}`
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
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
    backgroundColor: '#6D28D9',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F5F3FF',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#EDE9FE',
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#EDE9FE',
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
    backgroundColor: '#7C3AED',
  },
  modeText: {
    color: '#6D28D9',
    fontWeight: '700',
    fontSize: 12,
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  dailyFilterSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  dailyFilterButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyFilterButtonActive: {
    backgroundColor: '#6D28D9',
  },
  dailyFilterText: {
    color: '#6D28D9',
    fontWeight: '700',
    fontSize: 12,
  },
  dailyFilterTextActive: {
    color: '#FFFFFF',
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  monthLabel: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '700',
  },
  monthInput: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
  },
  monthButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    paddingVertical: 8,
    alignItems: 'center',
  },
  monthButtonText: {
    color: '#5B21B6',
    fontWeight: '700',
    fontSize: 13,
  },
  successText: {
    color: '#065F46',
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6D28D9',
    fontSize: 14,
    marginTop: 16,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 14,
    gap: 8,
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
    color: '#4C1D95',
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
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteDayButtonText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
  },
  groupBadge: {
    borderRadius: 999,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupBadgeText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  groupSummary: {
    fontSize: 13,
    color: '#6D28D9',
  },
  periodDaysContainer: {
    gap: 8,
  },
  periodDayCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    backgroundColor: '#F8F5FF',
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
    color: '#4C1D95',
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
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  periodMovementExitActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  periodMovementEntryInactive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  periodMovementExitInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
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
    color: '#991B1B',
  },
  periodDayHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  periodExpandText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  entryRow: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9D5FF',
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
    color: '#3B0764',
  },
  deletedBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deletedBadgeText: {
    color: '#991B1B',
    fontSize: 10,
    fontWeight: '700',
  },
  entryMeta: {
    fontSize: 12,
    color: '#6D28D9',
  },
  entryActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  entryActionButton: {
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryActionButtonText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  entryDeleteButton: {
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryDeleteButtonText: {
    color: '#991B1B',
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
    backgroundColor: '#DDD6FE',
  },
  statusNeedPurchase: {
    backgroundColor: '#F5D0FE',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4C1D95',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: '#4C1D95',
    fontSize: 16,
    fontWeight: '800',
  },
  modalMessage: {
    color: '#6D28D9',
    fontSize: 13,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#3B0764',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#5B21B6',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
