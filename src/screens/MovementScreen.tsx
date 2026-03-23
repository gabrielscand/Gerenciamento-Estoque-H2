import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
import { getCategoryLabel } from '../constants/categories';
import {
  listStockMovementItems,
  saveStockEntries,
  saveStockExits,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import type { DailyCountUpdateInput, StockMovementItem } from '../types/inventory';
import {
  formatDateLabel,
  getTodayLocalDateString,
  isFutureDate,
  isValidDateString,
} from '../utils/date';
import { DateField } from '../components/DateField';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';

type MovementMode = 'entry' | 'exit';
type QuantityFormMap = Record<string, string>;
type QuantityErrorMap = Record<string, string>;

const FILTER_ALL = '__all__';
const FILTER_UNCATEGORIZED = '__uncategorized__';
const MAX_AUTOCOMPLETE_SUGGESTIONS = 6;

type CategoryFilterValue = typeof FILTER_ALL | typeof FILTER_UNCATEGORIZED | string;

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

function normalizeSearchValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type CategoryFilterSelectProps = {
  value: CategoryFilterValue;
  options: string[];
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

  return getCategoryLabel(String(value));
}

function CategoryFilterSelect({
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: CategoryFilterSelectProps) {
  const filterOptions: CategoryFilterValue[] = [FILTER_ALL, ...options, FILTER_UNCATEGORIZED];

  return (
    <View style={styles.filterSelectRoot}>
      <Pressable style={styles.filterSelectTrigger} onPress={onToggle}>
        <Text style={styles.filterSelectText}>{getFilterLabel(value)}</Text>
        <Text style={styles.filterSelectArrow}>{isOpen ? '^' : 'v'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.filterSelectMenu}>
          {filterOptions.map((option) => {
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

function getHeroText(mode: MovementMode): { title: string; description: string; button: string } {
  if (mode === 'entry') {
    return {
      title: 'Entrada',
      description: 'Registre o estoque inicial e as reposicoes. Toda entrada soma no saldo atual.',
      button: 'Salvar entradas',
    };
  }

  return {
    title: 'Saida',
    description: 'Registre as saidas do dia. Toda saida reduz o saldo atual e nunca pode ultrapassar o saldo.',
    button: 'Salvar saidas',
  };
}

export function EntryScreen() {
  return <StockMovementScreen mode="entry" />;
}

export function ExitScreen() {
  return <StockMovementScreen mode="exit" />;
}

function StockMovementScreen({ mode }: { mode: MovementMode }) {
  const isFocused = useIsFocused();
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDateString());
  const [selectedDateError, setSelectedDateError] = useState('');
  const [items, setItems] = useState<StockMovementItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(FILTER_ALL);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantities, setQuantities] = useState<QuantityFormMap>({});
  const [focusedInputItemId, setFocusedInputItemId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<QuantityErrorMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const skipNextDateModeLoadRef = useRef(false);
  const heroText = getHeroText(mode);
  const { showTopPopup } = useTopPopup();

  async function loadMovementItems(date: string, syncFirst: boolean = false) {
    setIsLoading(true);

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

      const data = await listStockMovementItems(mode, date);
      setItems(data);
      const nextQuantities: QuantityFormMap = {};

      for (const item of data) {
        nextQuantities[String(item.id)] = '';
      }

      setQuantities(nextQuantities);
      setFieldErrors({});
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar movimentacoes.',
        durationMs: 4200,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    skipNextDateModeLoadRef.current = true;
    void loadMovementItems(selectedDate);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (skipNextDateModeLoadRef.current) {
      skipNextDateModeLoadRef.current = false;
      return;
    }

    void loadMovementItems(selectedDate);
  }, [selectedDate, mode, isFocused]);

  const modeVisibleItems = useMemo(() => {
    if (mode === 'entry') {
      return items;
    }

    return items.filter((item) => item.currentStockQuantity !== null && item.currentStockQuantity > 0);
  }, [items, mode]);

  const categoryFilteredItems = useMemo(() => {
    return modeVisibleItems.filter((item) => {
      if (categoryFilter === FILTER_ALL) {
        return true;
      }

      if (categoryFilter === FILTER_UNCATEGORIZED) {
        return item.category === null;
      }

      return item.category === categoryFilter;
    });
  }, [modeVisibleItems, categoryFilter]);

  const availableCategories = useMemo(() => {
    const uniqueCategories = new Set<string>();

    for (const item of modeVisibleItems) {
      if (item.category) {
        uniqueCategories.add(item.category);
      }
    }

    return Array.from(uniqueCategories).sort((left, right) =>
      left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [modeVisibleItems]);

  useEffect(() => {
    if (categoryFilter === FILTER_ALL || categoryFilter === FILTER_UNCATEGORIZED) {
      return;
    }

    if (!availableCategories.includes(categoryFilter)) {
      setCategoryFilter(FILTER_ALL);
    }
  }, [availableCategories, categoryFilter]);

  const normalizedSearchQuery = useMemo(() => normalizeSearchValue(searchQuery), [searchQuery]);

  const filteredItems = useMemo(() => {
    if (!normalizedSearchQuery) {
      return categoryFilteredItems;
    }

    return categoryFilteredItems.filter((item) =>
      normalizeSearchValue(item.name).includes(normalizedSearchQuery),
    );
  }, [categoryFilteredItems, normalizedSearchQuery]);

  const searchSuggestions = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const startsWithMatches: StockMovementItem[] = [];
    const containsMatches: StockMovementItem[] = [];

    for (const item of categoryFilteredItems) {
      const normalizedName = normalizeSearchValue(item.name);

      if (normalizedName.startsWith(normalizedSearchQuery)) {
        startsWithMatches.push(item);
        continue;
      }

      if (normalizedName.includes(normalizedSearchQuery)) {
        containsMatches.push(item);
      }
    }

    return [...startsWithMatches, ...containsMatches].slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS);
  }, [categoryFilteredItems, normalizedSearchQuery]);

  const summary = useMemo(() => {
    let needPurchase = 0;
    let okCount = 0;
    let totalMissingQuantity = 0;
    let evaluatedItems = 0;

    for (const item of filteredItems) {
      const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
      const currentStock = item.currentStockQuantity;

      if (parsed !== null && parsed < 0) {
        continue;
      }

      if (mode === 'exit' && parsed !== null && currentStock !== null && parsed > currentStock) {
        continue;
      }

      const projectedStock =
        parsed === null
          ? currentStock
          : mode === 'entry'
            ? (currentStock ?? 0) + parsed
            : currentStock === null
              ? null
              : currentStock - parsed;

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
  }, [filteredItems, quantities, mode]);

  function setMovementDate(value: string) {
    setSelectedDate(value.trim());
    setIsCategoryFilterOpen(false);
    setSelectedDateError('');
  }

  function setSearchValue(value: string) {
    setSearchQuery(value);
  }

  function setQuantity(itemId: number, value: string) {
    setQuantities((prev) => ({ ...prev, [String(itemId)]: value }));
    setFieldErrors((prev) => ({ ...prev, [String(itemId)]: '' }));
  }

  async function confirmFutureDateSave(): Promise<boolean> {
    const message =
      'A data escolhida esta no futuro. Deseja salvar a movimentacao mesmo assim?';

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

  async function handleSaveMovements() {
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

      if (mode === 'exit') {
        if (item.currentStockQuantity === null) {
          nextErrors[String(item.id)] = 'Item sem estoque inicial. Registre entrada primeiro.';
          continue;
        }

        if (parsed > item.currentStockQuantity) {
          nextErrors[String(item.id)] = 'Saida maior que o saldo atual.';
          continue;
        }
      }

      updates.push({ itemId: item.id, quantity: parsed });
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (updates.length === 0) {
      showTopPopup({
        type: 'warning',
        message: 'Preencha ao menos um item visivel no filtro para salvar.',
        durationMs: 3800,
      });
      return;
    }

    if (isFutureDate(selectedDate)) {
      const confirmed = await confirmFutureDateSave();

      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);

    try {
      if (mode === 'entry') {
        await saveStockEntries(updates, selectedDate);
      } else {
        await saveStockExits(updates, selectedDate);
      }

      showTopPopup({
        type: 'success',
        message: `${heroText.title} de ${formatDateLabel(selectedDate)} salva com sucesso.`,
        durationMs: 3000,
      });
      await loadMovementItems(selectedDate);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel salvar movimentacao.',
        durationMs: 4200,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenShell>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadMovementItems(selectedDate, true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title={heroText.title}
                subtitle={`Data selecionada: ${formatDateLabel(selectedDate)}`}
                description={heroText.description}
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Avaliados" value={String(summary.countedItems)} />
                  <KpiTile label="OK" value={String(summary.okCount)} />
                  <KpiTile label="Comprar" value={String(summary.needPurchase)} />
                  <KpiTile label="Faltante" value={formatQuantity(summary.totalMissingQuantity)} />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.dateCard}>
              <DateField
                label="Dia da movimentacao"
                value={selectedDate}
                onChange={setMovementDate}
                error={selectedDateError}
              />
              <Pressable
                style={styles.todayButton}
                onPress={() => setMovementDate(getTodayLocalDateString())}
              >
                <Text style={styles.todayButtonText}>Hoje</Text>
              </Pressable>
            </View>

            <View style={styles.filterCard}>
              <Text style={styles.filterLabel}>Filtrar por categoria</Text>
              <CategoryFilterSelect
                value={categoryFilter}
                options={availableCategories}
                onChange={(nextValue) => {
                  setCategoryFilter(nextValue);
                }}
                isOpen={isCategoryFilterOpen}
                onToggle={() => setIsCategoryFilterOpen((prev) => !prev)}
                onClose={() => setIsCategoryFilterOpen(false)}
              />
            </View>

            <View style={styles.searchCard}>
              <View style={styles.searchHeader}>
                <Text style={styles.searchLabel}>Buscar item</Text>
                {searchQuery.trim().length > 0 ? (
                  <Pressable
                    style={styles.clearSearchButton}
                    onPress={() => {
                      setSearchValue('');
                    }}
                  >
                    <Text style={styles.clearSearchButtonText}>Limpar</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchValue}
                placeholder="Digite o nome do item"
                style={styles.searchInput}
              />
              {searchSuggestions.length > 0 ? (
                <View style={styles.searchSuggestionsContainer}>
                  {searchSuggestions.map((suggestion, index) => (
                    <Pressable
                      key={`suggestion-${suggestion.id}`}
                      style={[
                        styles.searchSuggestionButton,
                        index === searchSuggestions.length - 1 ? styles.searchSuggestionButtonLast : undefined,
                      ]}
                      onPress={() => {
                        setSearchValue(suggestion.name);
                      }}
                    >
                      <Text style={styles.searchSuggestionText}>{suggestion.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {filteredItems.length > 0 ? (
              <Pressable
                style={[styles.submitButton, isSaving ? styles.submitButtonDisabled : undefined]}
                disabled={isSaving}
                onPress={() => {
                  void handleSaveMovements();
                }}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>{heroText.button}</Text>
                )}
              </Pressable>
            ) : null}

            <Text style={styles.listTitle}>Itens para movimentar ({filteredItems.length})</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum item cadastrado. Cadastre itens na aba Itens para iniciar a movimentacao.
            </Text>
          ) : mode === 'exit' && modeVisibleItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum item com estoque disponivel para registrar saida.
            </Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item encontrado para a categoria/busca selecionada.</Text>
          )
        }
        renderItem={({ item }) => {
          const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
          const currentStock = item.currentStockQuantity;
          const needsPurchaseByCurrentStock =
            currentStock !== null && currentStock <= item.minQuantity;
          const invalidOverMovement =
            mode === 'exit' && currentStock !== null && parsed !== null && parsed > currentStock;
          const projectedStock =
            parsed === null
              ? currentStock
              : mode === 'entry'
                ? (currentStock ?? 0) + parsed
                : currentStock === null
                  ? null
                  : currentStock - parsed;
          const hasProjectedStock = projectedStock !== null && !invalidOverMovement;
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
                      : invalidOverMovement || needsPurchase
                        ? styles.statusNeedPurchase
                        : styles.statusOk,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {!hasProjectedStock
                      ? invalidOverMovement
                        ? 'Saida acima do saldo'
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
              <StockEmphasis
                label="Estoque atual"
                value={currentStock === null ? '-' : `${formatQuantity(currentStock)} ${item.unit}`}
                tone={currentStock === null ? 'empty' : needsPurchaseByCurrentStock ? 'warning' : 'normal'}
                helperText={
                  currentStock === null
                    ? 'Sem estoque inicial'
                    : needsPurchaseByCurrentStock
                      ? 'No minimo ou abaixo do minimo'
                      : undefined
                }
              />
              <Text style={styles.itemMeta}>
                Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}
              </Text>
              <Text style={styles.itemMeta}>
                Total de {mode === 'entry' ? 'entradas' : 'saidas'} no dia:{' '}
                {item.currentQuantity === null ? '-' : formatQuantity(item.currentQuantity)}
              </Text>
              {hasProjectedStock && parsed !== null ? (
                <Text style={styles.itemMeta}>
                  Saldo apos {mode === 'entry' ? 'entrada' : 'saida'}: {formatQuantity(projectedStock as number)}
                </Text>
              ) : null}

              <Text style={styles.inputLabel}>
                {mode === 'entry'
                  ? currentStock === null
                    ? 'Estoque inicial'
                    : 'Entrada do dia'
                  : 'Saida do dia'}
              </Text>

              <TextInput
                value={quantities[String(item.id)] ?? ''}
                onChangeText={(value) => setQuantity(item.id, value)}
                onFocus={() => setFocusedInputItemId(item.id)}
                onBlur={() => setFocusedInputItemId((current) => (current === item.id ? null : current))}
                placeholder={mode === 'entry' ? 'Ex.: 50' : 'Ex.: 3'}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  focusedInputItemId === item.id ? styles.inputFocused : undefined,
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  toastContainer: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#3A0D49',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
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
    display: 'none',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F5EEFB',
  },
  subtitle: {
    fontSize: 13,
    color: '#D8C3EA',
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#EDE0F9',
  },
  summaryText: {
    marginTop: 4,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  dateCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
  },
  todayButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F7EFFB',
    paddingVertical: 8,
    alignItems: 'center',
  },
  todayButtonText: {
    color: tokens.colors.accentStrong,
    fontWeight: '800',
    fontSize: 13,
  },
  filterCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    ...tokens.shadow.card,
  },
  filterLabel: {
    fontSize: 13,
    color: '#77158E',
    fontWeight: '700',
  },
  filterSelectRoot: {
    position: 'relative',
  },
  filterSelectTrigger: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  filterSelectText: {
    flex: 1,
    color: '#2A0834',
    fontSize: 14,
    fontWeight: '600',
  },
  filterSelectArrow: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '800',
  },
  filterSelectMenu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  filterSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterSelectOptionActive: {
    backgroundColor: '#EDE0F9',
  },
  filterSelectOptionText: {
    color: '#3A0D49',
    fontSize: 13,
    fontWeight: '600',
  },
  filterSelectOptionTextActive: {
    color: '#5F1175',
    fontWeight: '700',
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
  submitButton: {
    borderRadius: 14,
    minHeight: 46,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
    fontSize: 16,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    marginTop: 16,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    ...tokens.shadow.card,
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
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  itemMeta: {
    fontSize: 13,
    color: '#5F1175',
  },
  inputLabel: {
    marginTop: 8,
    fontSize: 14,
    color: '#77158E',
    fontWeight: '800',
  },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F9F3FD',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: tokens.colors.accentDeep,
    fontSize: 17,
    fontWeight: '700',
  },
  inputFocused: {
    borderColor: tokens.colors.accent,
    backgroundColor: '#F0E5FA',
  },
  inputError: {
    borderColor: '#D74A4A',
  },
  errorText: {
    color: '#B02323',
    fontSize: 12,
    lineHeight: 17,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: '#E8DAF3',
  },
  statusNeedPurchase: {
    backgroundColor: '#FCE8E8',
  },
  statusOk: {
    backgroundColor: '#E8F6EE',
  },
  statusText: {
    color: tokens.colors.accentDeep,
    fontSize: 12,
    fontWeight: '700',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
