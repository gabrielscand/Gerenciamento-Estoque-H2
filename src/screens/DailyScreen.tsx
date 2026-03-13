import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { STOCK_CATEGORIES, getCategoryLabel, type StockCategory } from '../constants/categories';
import { listDailyInspectionItems, saveDailyInspection } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import type { DailyCountUpdateInput, DailyInspectionItem } from '../types/inventory';
import {
  formatDateLabel,
  getTodayLocalDateString,
  isFutureDate,
  isValidDateString,
} from '../utils/date';
import { DateField } from '../components/DateField';

type QuantityFormMap = Record<string, string>;
type QuantityErrorMap = Record<string, string>;
const TOAST_DURATION_MS = 2800;
const FILTER_ALL = '__all__';
const FILTER_UNCATEGORIZED = '__uncategorized__';

type CategoryFilterValue = typeof FILTER_ALL | typeof FILTER_UNCATEGORIZED | StockCategory;

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

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

type CategoryFilterSelectProps = {
  value: CategoryFilterValue;
  onChange: (nextValue: CategoryFilterValue) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

function getFilterLabel(value: CategoryFilterValue): string {
  if (value === FILTER_ALL) {
    return 'Todas as categorias';
  }

  if (value === FILTER_UNCATEGORIZED) {
    return 'Sem categoria';
  }

  return getCategoryLabel(value);
}

function CategoryFilterSelect({
  value,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: CategoryFilterSelectProps) {
  const options: CategoryFilterValue[] = [FILTER_ALL, ...STOCK_CATEGORIES, FILTER_UNCATEGORIZED];

  return (
    <View style={styles.filterSelectRoot}>
      <Pressable style={styles.filterSelectTrigger} onPress={onToggle}>
        <Text style={styles.filterSelectText}>{getFilterLabel(value)}</Text>
        <Text style={styles.filterSelectArrow}>{isOpen ? '^' : 'v'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.filterSelectMenu}>
          {options.map((option) => {
            const isSelected = value === option;

            return (
              <Pressable
                key={option}
                style={[styles.filterSelectOption, isSelected ? styles.filterSelectOptionActive : undefined]}
                onPress={() => {
                  onChange(option);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.filterSelectOptionText,
                    isSelected ? styles.filterSelectOptionTextActive : undefined,
                  ]}
                >
                  {getFilterLabel(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function DailyScreen() {
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDateString());
  const [selectedDateError, setSelectedDateError] = useState('');
  const [items, setItems] = useState<DailyInspectionItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(FILTER_ALL);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [quantities, setQuantities] = useState<QuantityFormMap>({});
  const [fieldErrors, setFieldErrors] = useState<QuantityErrorMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearToastTimer() {
    if (!toastTimeoutRef.current) {
      return;
    }

    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = null;
  }

  function showSuccessToast(message: string) {
    clearToastTimer();
    setToastMessage(message);
    setIsToastVisible(true);

    toastTimeoutRef.current = setTimeout(() => {
      setIsToastVisible(false);
      toastTimeoutRef.current = null;
    }, TOAST_DURATION_MS);
  }

  async function loadInspectionItems(date: string, syncFirst: boolean = false) {
    setIsLoading(true);
    setSubmitError('');

    if (!isValidDateString(date)) {
      setItems([]);
      setQuantities({});
      setFieldErrors({});
      setSelectedDateError('Informe uma data valida no formato DD/MM/AAAA.');
      setIsLoading(false);
      return;
    }

    try {
      setSelectedDateError('');
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listDailyInspectionItems(date);
      setItems(data);
      const nextQuantities: QuantityFormMap = {};

      for (const item of data) {
        nextQuantities[String(item.id)] =
          item.currentQuantity === null ? '' : String(item.currentQuantity);
      }

      setQuantities(nextQuantities);
      setFieldErrors({});
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Falha ao carregar vistoria do dia.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInspectionItems(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      clearToastTimer();
    };
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter === FILTER_ALL) {
        return true;
      }

      if (categoryFilter === FILTER_UNCATEGORIZED) {
        return item.category === null;
      }

      return item.category === categoryFilter;
    });
  }, [items, categoryFilter]);

  const summary = useMemo(() => {
    let needPurchase = 0;
    let okCount = 0;
    let totalMissingQuantity = 0;
    let evaluatedItems = 0;

    for (const item of filteredItems) {
      const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
      const currentStock = item.currentStockQuantity;
      const hasInitialStock = currentStock !== null;

      if (parsed !== null && parsed < 0) {
        continue;
      }

      if (hasInitialStock && currentStock !== null && parsed !== null && parsed > currentStock) {
        continue;
      }

      const projectedStock =
        parsed === null
          ? currentStock
          : hasInitialStock && currentStock !== null
            ? currentStock - parsed
            : parsed;

      if (projectedStock === null) {
        continue;
      }

      evaluatedItems += 1;

      if (projectedStock <= item.minQuantity) {
        needPurchase += 1;
        if (projectedStock < item.minQuantity) {
          totalMissingQuantity += item.minQuantity - projectedStock;
        }
      } else {
        okCount += 1;
      }
    }

    return { needPurchase, okCount, countedItems: evaluatedItems, totalMissingQuantity };
  }, [filteredItems, quantities]);

  function setInspectionDate(value: string) {
    setSelectedDate(value.trim());
    setIsCategoryFilterOpen(false);
    setSelectedDateError('');
    setSubmitError('');
  }

  function setQuantity(itemId: number, value: string) {
    setQuantities((prev) => ({ ...prev, [String(itemId)]: value }));
    setFieldErrors((prev) => ({ ...prev, [String(itemId)]: '' }));
    setSubmitError('');
  }

  async function confirmFutureDateSave(): Promise<boolean> {
    const message =
      'A data escolhida esta no futuro. Deseja salvar a vistoria mesmo assim?';

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
        'Data futura',
        message,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
          { text: 'Salvar mesmo assim', onPress: () => finish(true) },
        ],
        { cancelable: true, onDismiss: () => finish(false) },
      );
    });
  }

  async function handleSaveInspection() {
    if (!isValidDateString(selectedDate)) {
      setSelectedDateError('Informe uma data valida no formato DD/MM/AAAA.');
      return;
    }

    const nextErrors: QuantityErrorMap = {};
    const updates: DailyCountUpdateInput[] = [];

    for (const item of filteredItems) {
      const value = quantities[String(item.id)] ?? '';

      if (value.trim().length === 0) {
        continue;
      }

      const parsed = parseDecimalInput(value);

      if (parsed === null) {
        nextErrors[String(item.id)] = 'Informe uma quantidade valida.';
        continue;
      }

      if (parsed < 0) {
        nextErrors[String(item.id)] = 'A quantidade nao pode ser negativa.';
        continue;
      }

      if (item.currentStockQuantity !== null && parsed > item.currentStockQuantity) {
        nextErrors[String(item.id)] = 'Consumo maior que o saldo atual.';
        continue;
      }

      updates.push({ itemId: item.id, quantity: parsed });
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (updates.length === 0) {
      setSubmitError('Preencha ao menos um item visivel no filtro para salvar a vistoria.');
      return;
    }

    if (isFutureDate(selectedDate)) {
      const confirmed = await confirmFutureDateSave();

      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);
    setSubmitError('');

    try {
      await saveDailyInspection(updates, selectedDate);
      showSuccessToast(`Vistoria de ${formatDateLabel(selectedDate)} salva com sucesso.`);
      await loadInspectionItems(selectedDate);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nao foi possivel salvar a vistoria.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {isToastVisible ? (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadInspectionItems(selectedDate, true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <View style={styles.heroCard}>
              <Text style={styles.title}>Vistoria Diaria</Text>
              <Text style={styles.subtitle}>Data selecionada: {formatDateLabel(selectedDate)}</Text>
              <Text style={styles.description}>
                Registre o consumo do dia. Se o item ainda nao tiver saldo inicial, o primeiro valor vira estoque
                inicial.
              </Text>
              <Text style={styles.summaryText}>
                {summary.countedItems} avaliados | {summary.okCount} OK | {summary.needPurchase} comprar | Falta total:{' '}
                {formatQuantity(summary.totalMissingQuantity)}
              </Text>
            </View>

            <View style={styles.dateCard}>
              <DateField
                label="Dia da vistoria"
                value={selectedDate}
                onChange={setInspectionDate}
                error={selectedDateError}
              />
              <Pressable
                style={styles.todayButton}
                onPress={() => setInspectionDate(getTodayLocalDateString())}
              >
                <Text style={styles.todayButtonText}>Hoje</Text>
              </Pressable>
            </View>

            <View style={styles.filterCard}>
              <Text style={styles.filterLabel}>Filtrar por categoria</Text>
              <CategoryFilterSelect
                value={categoryFilter}
                onChange={(nextValue) => {
                  setCategoryFilter(nextValue);
                  setSubmitError('');
                }}
                isOpen={isCategoryFilterOpen}
                onToggle={() => setIsCategoryFilterOpen((prev) => !prev)}
                onClose={() => setIsCategoryFilterOpen(false)}
              />
            </View>

            {filteredItems.length > 0 ? (
              <Pressable
                style={[styles.submitButton, isSaving ? styles.submitButtonDisabled : undefined]}
                disabled={isSaving}
                onPress={() => {
                  void handleSaveInspection();
                }}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Salvar movimentacoes do dia</Text>
                )}
              </Pressable>
            ) : null}

            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

            <Text style={styles.listTitle}>Itens para movimentar ({filteredItems.length})</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum item cadastrado. Cadastre itens na aba Itens para iniciar a vistoria.
            </Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item encontrado para o filtro selecionado.</Text>
          )
        }
        renderItem={({ item }) => {
          const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
          const currentStock = item.currentStockQuantity;
          const hasInitialStock = currentStock !== null;
          const invalidOverConsumption =
            hasInitialStock && currentStock !== null && parsed !== null && parsed > currentStock;
          const projectedStock =
            parsed === null
              ? currentStock
              : hasInitialStock && currentStock !== null
                ? currentStock - parsed
                : parsed;
          const hasProjectedStock = projectedStock !== null && !invalidOverConsumption;
          const needsPurchase = hasProjectedStock && projectedStock <= item.minQuantity;
          const missingQuantity =
            hasProjectedStock && projectedStock < item.minQuantity ? item.minQuantity - projectedStock : 0;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    !hasProjectedStock
                      ? styles.statusPending
                      : invalidOverConsumption || needsPurchase
                        ? styles.statusNeedPurchase
                        : styles.statusOk,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {!hasProjectedStock
                      ? invalidOverConsumption
                        ? 'Consumo acima do saldo'
                        : 'Sem estoque inicial'
                      : needsPurchase
                        ? missingQuantity > 0
                          ? `Comprar ${formatQuantity(missingQuantity)} ${item.unit}`
                          : 'No minimo (comprar)'
                        : 'OK'}
                  </Text>
                </View>
              </View>

              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>Minimo necessario: {formatQuantity(item.minQuantity)}</Text>
              <Text style={styles.itemMeta}>
                Saldo atual: {currentStock === null ? '-' : formatQuantity(currentStock)}
              </Text>
              <Text style={styles.itemMeta}>
                Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}
              </Text>
              {hasProjectedStock && parsed !== null ? (
                <Text style={styles.itemMeta}>Saldo apos o dia: {formatQuantity(projectedStock as number)}</Text>
              ) : null}

              <Text style={styles.inputLabel}>{currentStock === null ? 'Estoque inicial' : 'Consumo do dia'}</Text>

              <TextInput
                value={quantities[String(item.id)] ?? ''}
                onChangeText={(value) => setQuantity(item.id, value)}
                placeholder={currentStock === null ? 'Ex.: 50' : 'Ex.: 3'}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  fieldErrors[String(item.id)] ? styles.inputError : undefined,
                ]}
              />

              {fieldErrors[String(item.id)] ? (
                <Text style={styles.errorText}>{fieldErrors[String(item.id)]}</Text>
              ) : null}
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
  toastContainer: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#4C1D95',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 4,
  },
  heroCard: {
    backgroundColor: '#6D28D9',
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F5F3FF',
  },
  subtitle: {
    fontSize: 13,
    color: '#DDD6FE',
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#EDE9FE',
  },
  summaryText: {
    marginTop: 4,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  dateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '700',
  },
  filterSelectRoot: {
    gap: 6,
  },
  filterSelectTrigger: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterSelectText: {
    color: '#3B0764',
    fontSize: 14,
    fontWeight: '600',
  },
  filterSelectArrow: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  filterSelectMenu: {
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  filterSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  filterSelectOptionActive: {
    backgroundColor: '#EDE9FE',
  },
  filterSelectOptionText: {
    color: '#4C1D95',
    fontSize: 14,
    fontWeight: '600',
  },
  filterSelectOptionTextActive: {
    color: '#5B21B6',
    fontWeight: '700',
  },
  todayButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    paddingVertical: 8,
    alignItems: 'center',
  },
  todayButtonText: {
    color: '#5B21B6',
    fontWeight: '700',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B0764',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#3B0764',
  },
  itemMeta: {
    color: '#5B21B6',
    fontSize: 13,
  },
  inputLabel: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: '#E9D5FF',
  },
  statusNeedPurchase: {
    backgroundColor: '#F5D0FE',
  },
  statusOk: {
    backgroundColor: '#DDD6FE',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4C1D95',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6D28D9',
    fontSize: 14,
    marginTop: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
});
