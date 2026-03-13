import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  listDailyHistoryGrouped,
  listFortnightlyHistoryGrouped,
  listMonthlyHistoryGrouped,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import type { DailyHistoryGroup, PeriodHistoryGroup } from '../types/inventory';
import {
  formatDateLabel,
  formatMonthLabel,
  getCurrentMonthString,
  parseDisplayMonthToIso,
} from '../utils/date';

type HistoryMode = 'diario' | 'quinzenal' | 'mensal';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function HistoryScreen() {
  const initialMonth = getCurrentMonthString();
  const [mode, setMode] = useState<HistoryMode>('diario');
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [monthInputValue, setMonthInputValue] = useState(formatMonthLabel(initialMonth));
  const [monthInputError, setMonthInputError] = useState('');
  const [dailyGroups, setDailyGroups] = useState<DailyHistoryGroup[]>([]);
  const [periodGroups, setPeriodGroups] = useState<PeriodHistoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const isDailyMode = mode === 'diario';

  async function loadHistory(nextMode: HistoryMode, nextMonth: string, syncFirst: boolean = false) {
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (syncFirst) {
        await syncAppData();
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
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar historico.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory(mode, selectedMonth);
  }, [mode, selectedMonth]);

  useEffect(() => {
    setMonthInputValue(formatMonthLabel(selectedMonth));
  }, [selectedMonth]);

  function selectMode(nextMode: HistoryMode) {
    setMode(nextMode);
    setErrorMessage('');
  }

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

  const heroText = useMemo(() => {
    if (mode === 'diario') {
      return {
        title: 'Historico Diario',
        description: 'Veja cada vistoria salva por dia, incluindo o quanto faltou comprar por item.',
      };
    }

    if (mode === 'quinzenal') {
      return {
        title: 'Relatorio Quinzenal',
        description:
          'Consolidacao por quinzena no mes escolhido, somando os faltantes de cada item nas vistorias.',
      };
    }

    return {
      title: 'Relatorio Mensal',
      description:
        'Consolidacao mensal do mes selecionado, somando os faltantes de cada item nas vistorias.',
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

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando historico...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhuma vistoria registrada para este filtro.</Text>
          )
        }
        renderItem={({ item }) => {
          if ('date' in item) {
            const dailyItem = item;

            return (
              <View style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupDate}>{formatDateLabel(dailyItem.date)}</Text>
                  <View style={styles.groupBadge}>
                    <Text style={styles.groupBadgeText}>{dailyItem.countedItems} contados</Text>
                  </View>
                </View>

                <Text style={styles.groupSummary}>
                  Total itens: {dailyItem.totalItems} | OK: {dailyItem.okItems} | Comprar:{' '}
                  {dailyItem.needPurchaseItems} | Faltante total: {formatQuantity(dailyItem.totalMissingQuantity)}
                </Text>

                {dailyItem.entries.map((entry) => (
                  <View key={`${dailyItem.date}-${entry.itemId}`} style={styles.entryRow}>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entryMeta}>
                        {formatQuantity(entry.quantity)} {entry.unit} | Min {formatQuantity(entry.minQuantity)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        entry.needsPurchase ? styles.statusNeedPurchase : styles.statusOk,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {entry.needsPurchase ? `Comprar ${formatQuantity(entry.missingQuantity)} ${entry.unit}` : 'OK'}
                      </Text>
                    </View>
                  </View>
                ))}
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
                total: {formatQuantity(periodItem.totalMissingQuantity)}
              </Text>

              {periodItem.entries.length === 0 ? (
                <Text style={styles.entryMeta}>Sem itens abaixo do minimo neste periodo.</Text>
              ) : (
                periodItem.entries.map((entry) => (
                  <View key={`${periodItem.id}-${entry.itemId}`} style={styles.entryRow}>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entryMeta}>Apareceu em {entry.countedDays} dia(s) com falta.</Text>
                    </View>
                    <View style={[styles.statusBadge, styles.statusNeedPurchase]}>
                      <Text style={styles.statusText}>
                        Comprar {formatQuantity(entry.totalMissingQuantity)} {entry.unit}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
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
  entryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B0764',
  },
  entryMeta: {
    fontSize: 12,
    color: '#6D28D9',
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
});
