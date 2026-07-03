import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import type { DailyCountUpdateInput, MovementReason, StockMovementItem } from '../types/inventory';
import {
  formatDateLabel,
  getTodayLocalDateString,
  isFutureDate,
  isValidDateString,
} from '../utils/date';
import { DateField } from '../components/DateField';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import {
  convertToBaseUnits,
  formatOriginalAndBaseQuantity,
  roundQuantity,
} from '../utils/unit-conversion';

type MovementMode = 'entry' | 'exit';
type QuantityFormMap = Record<string, string>;
type QuantityModeMap = Record<string, QuantityFieldMode>;
type QuantityErrorMap = Record<string, string>;
type CartResolutionAction = 'replace' | 'sum' | 'cancel';
type DateChangeAction = 'clear' | 'keep' | 'cancel';
type MovementCartItem = {
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  quantity: number;
  reason?: MovementReason | null;
};

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

const FARDO_FACTORS = new Set([4, 6, 8, 12, 24]);

function isUnitInputItem(item: { conversionFactor: number }): boolean {
  return FARDO_FACTORS.has(item.conversionFactor);
}

type QuantityFieldMode = 'fardo' | 'unidade';

// Converte o que foi digitado para a unidade do item (fardos).
// Item de fardo + campo "unidade": unidades digitadas / fator.
// Item de fardo + campo "fardo" (ou não-fardo): valor como esta.
function toItemUnitQuantity(
  item: { conversionFactor: number },
  typed: number,
  fieldMode?: QuantityFieldMode,
): number {
  if (isUnitInputItem(item) && fieldMode === 'unidade') {
    return roundQuantity(typed / item.conversionFactor);
  }

  return typed;
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
      description: 'Registre o estoque inicial e as reposições. Toda entrada soma no saldo atual.',
      button: 'Salvar entradas',
    };
  }

  return {
    title: 'Saída',
    description: 'Registre as saídas do dia. Toda saída reduz o saldo atual e nunca pode ultrapassar o saldo.',
    button: 'Salvar saídas',
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
  const [quantityModes, setQuantityModes] = useState<QuantityModeMap>({});
  const [focusedInputItemId, setFocusedInputItemId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<QuantityErrorMap>({});
  const [cartItems, setCartItems] = useState<MovementCartItem[]>([]);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [pendingDuplicateAdd, setPendingDuplicateAdd] = useState<{
    item: StockMovementItem;
    quantity: number;
  } | null>(null);
  const [pendingDateChange, setPendingDateChange] = useState<string | null>(null);
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
      setQuantityModes({});
      setFieldErrors({});
      setSelectedDateError('Informe uma data válida no formato DD/MM/AAAA.');
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
      setQuantityModes({});
      setFieldErrors({});
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar movimentações.',
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
    let totalMissingQuantityInBaseUnits = 0;
    let evaluatedItems = 0;

    for (const item of filteredItems) {
      const typed = parseDecimalInput(quantities[String(item.id)] ?? '');
      const fieldMode = quantityModes[String(item.id)];
      const parsed = typed === null ? null : toItemUnitQuantity(item, typed, fieldMode);
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
          totalMissingQuantityInBaseUnits +=
            (item.minQuantity - projectedStock) * item.conversionFactor;
        }
      } else {
        okCount += 1;
      }
    }

    return {
      needPurchase,
      okCount,
      countedItems: evaluatedItems,
      totalMissingQuantityInBaseUnits,
    };
  }, [filteredItems, quantities, quantityModes, mode]);

  const cartTotalQuantityInBaseUnits = useMemo(
    () =>
      cartItems.reduce(
        (sum, cartItem) => sum + cartItem.quantity * cartItem.conversionFactor,
        0,
      ),
    [cartItems],
  );

  function getQuantityValidationError(item: StockMovementItem, quantity: number): string | null {
    if (!Number.isFinite(quantity)) {
      return 'Informe uma quantidade válida.';
    }

    if (quantity < 0) {
      return 'A quantidade não pode ser negativa.';
    }

    if (mode === 'exit') {
      if (item.currentStockQuantity === null) {
        return 'Item sem estoque inicial. Registre entrada primeiro.';
      }

      if (quantity > item.currentStockQuantity) {
        return 'Saída maior que o saldo atual.';
      }
    }

    return null;
  }

  function setMovementDate(value: string) {
    const nextDate = value.trim();

    if (nextDate === selectedDate) {
      return;
    }

    if (cartItems.length > 0) {
      setPendingDateChange(nextDate);
      return;
    }

    setSelectedDate(nextDate);
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

  // Para itens de fardo: grava o valor e marca em qual campo (fardo/unidade)
  // foi digitado. Campo vazio reabre os dois campos (remove o modo).
  function setFieldValue(itemId: number, value: string, fieldMode: QuantityFieldMode) {
    const key = String(itemId);
    setQuantities((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    setQuantityModes((prev) => {
      const next = { ...prev };
      if (value.trim().length === 0) {
        delete next[key];
      } else {
        next[key] = fieldMode;
      }
      return next;
    });
  }

  function clearItemInput(itemId: number) {
    const key = String(itemId);
    setQuantities((prev) => ({ ...prev, [key]: '' }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    setQuantityModes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleDateChangeDecision(action: DateChangeAction) {
    if (!pendingDateChange) {
      return;
    }

    if (action === 'cancel') {
      setPendingDateChange(null);
      return;
    }

    if (action === 'clear') {
      setCartItems([]);
      setIsCartModalOpen(false);
    }

    setSelectedDate(pendingDateChange);
    setPendingDateChange(null);
    setIsCategoryFilterOpen(false);
    setSelectedDateError('');
  }

  function handleDuplicateCartDecision(action: CartResolutionAction) {
    const pending = pendingDuplicateAdd;

    if (!pending) {
      return;
    }

    if (action === 'cancel') {
      setPendingDuplicateAdd(null);
      return;
    }

    const existing = cartItems.find((entry) => entry.itemId === pending.item.id);
    const nextQuantity =
      action === 'sum'
        ? (existing?.quantity ?? 0) + pending.quantity
        : pending.quantity;
    const quantityError = getQuantityValidationError(pending.item, nextQuantity);

    if (quantityError) {
      setFieldErrors((prev) => ({ ...prev, [String(pending.item.id)]: quantityError }));
      showTopPopup({
        type: 'error',
        message: quantityError,
        durationMs: 3600,
      });
      setPendingDuplicateAdd(null);
      return;
    }

    setCartItems((prev) =>
      prev.map((entry) =>
        entry.itemId === pending.item.id ? { ...entry, quantity: nextQuantity } : entry,
      ),
    );
    clearItemInput(pending.item.id);
    setPendingDuplicateAdd(null);
    showTopPopup({
      type: 'success',
      message: 'Carrinho atualizado com sucesso.',
      durationMs: 2400,
    });
  }

  function handleAddItemToCart(item: StockMovementItem) {
    const rawValue = quantities[String(item.id)] ?? '';

    if (rawValue.trim().length === 0) {
      setFieldErrors((prev) => ({ ...prev, [String(item.id)]: 'Informe uma quantidade para adicionar.' }));
      return;
    }

    const typed = parseDecimalInput(rawValue);

    if (typed === null) {
      setFieldErrors((prev) => ({ ...prev, [String(item.id)]: 'Informe uma quantidade válida.' }));
      return;
    }

    const fieldMode = quantityModes[String(item.id)];
    const quantity = toItemUnitQuantity(item, typed, fieldMode);

    const quantityError = getQuantityValidationError(item, quantity);

    if (quantityError) {
      setFieldErrors((prev) => ({ ...prev, [String(item.id)]: quantityError }));
      return;
    }

    const existing = cartItems.find((entry) => entry.itemId === item.id);

    if (existing) {
      setPendingDuplicateAdd({ item, quantity });
      return;
    }

    setCartItems((prev) => [
      ...prev,
      {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        conversionFactor: item.conversionFactor,
        quantity,
      },
    ]);
    clearItemInput(item.id);
    showTopPopup({
      type: 'success',
      message: `${item.name} adicionado ao carrinho.`,
      durationMs: 2100,
    });
  }

  function removeFromCart(itemId: number) {
    setCartItems((prev) => prev.filter((entry) => entry.itemId !== itemId));
  }

  // Alterna a marca (perda/ajuste) do item no carrinho. Clicar na mesma opção
  // desmarca (volta a movimentação normal, sem rotulo).
  function setCartItemReason(itemId: number, reason: MovementReason) {
    setCartItems((prev) =>
      prev.map((entry) =>
        entry.itemId === itemId
          ? { ...entry, reason: entry.reason === reason ? null : reason }
          : entry,
      ),
    );
  }

  function clearCart() {
    setCartItems([]);
    showTopPopup({
      type: 'success',
      message: 'Carrinho limpo.',
      durationMs: 1800,
    });
  }

  async function confirmFutureDateSave(): Promise<boolean> {
    const message =
      'A data escolhida esta no futuro. Deseja salvar a movimentação mesmo assim?';

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

  async function handleFinalizeCart() {
    if (!isValidDateString(selectedDate)) {
      setSelectedDateError('Informe uma data válida no formato DD/MM/AAAA.');
      return;
    }

    if (cartItems.length === 0) {
      showTopPopup({
        type: 'warning',
        message: 'Adicione ao menos um item ao carrinho para finalizar.',
        durationMs: 3200,
      });
      return;
    }

    const nextErrors: QuantityErrorMap = {};
    const updates: DailyCountUpdateInput[] = [];
    const itemsById = new Map<number, StockMovementItem>(items.map((item) => [item.id, item]));
    let firstErrorMessage = '';

    for (const cartItem of cartItems) {
      const item = itemsById.get(cartItem.itemId);

      if (!item) {
        if (!firstErrorMessage) {
          firstErrorMessage = `Item ${cartItem.name} não esta disponível para esta data.`;
        }
        continue;
      }

      const quantityError = getQuantityValidationError(item, cartItem.quantity);
      if (quantityError) {
        nextErrors[String(item.id)] = quantityError;
        if (!firstErrorMessage) {
          firstErrorMessage = `${item.name}: ${quantityError}`;
        }
        continue;
      }

      updates.push({ itemId: item.id, quantity: cartItem.quantity, reason: cartItem.reason ?? null });
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
      showTopPopup({
        type: 'error',
        message: firstErrorMessage || 'Existem itens inválidos no carrinho.',
        durationMs: 4200,
      });
      return;
    }

    if (updates.length === 0) {
      showTopPopup({
        type: 'warning',
        message: 'Nenhum item válido no carrinho para finalizar.',
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

      setCartItems([]);
      setIsCartModalOpen(false);
      showTopPopup({
        type: 'success',
        message: `${heroText.title} de ${formatDateLabel(selectedDate)} finalizada com sucesso.`,
        durationMs: 3000,
      });
      await loadMovementItems(selectedDate);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível salvar movimentação.',
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
                  <KpiTile
                    label="Faltante (und)"
                    value={formatQuantity(summary.totalMissingQuantityInBaseUnits)}
                  />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.dateCard}>
              <DateField
                label="Dia da movimentação"
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

            <View style={styles.cartHeaderActions}>
              <Pressable
                style={[styles.submitButton, isSaving ? styles.submitButtonDisabled : undefined]}
                disabled={isSaving}
                onPress={() => {
                  setIsCartModalOpen(true);
                }}
              >
                <View style={styles.submitButtonContent}>
                  <Ionicons name="cart-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Carrinho ({cartItems.length})</Text>
                </View>
              </Pressable>
              {cartItems.length > 0 ? (
                <Text style={styles.cartSummaryText}>
                  {cartItems.length} item(ns) | Total: {formatQuantity(cartTotalQuantityInBaseUnits)} und
                </Text>
              ) : (
                <Text style={styles.cartSummaryText}>Adicione itens para finalizar em lote.</Text>
              )}
            </View>

            <Text style={styles.listTitle}>Itens para movimentar ({filteredItems.length})</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum item cadastrado. Cadastre itens na aba Itens para iniciar a movimentação.
            </Text>
          ) : mode === 'exit' && modeVisibleItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum item com estoque disponível para registrar saída.
            </Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item encontrado para a categoria/busca selecionada.</Text>
          )
        }
        renderItem={({ item }) => {
          const cartItem = cartItems.find((entry) => entry.itemId === item.id);
          const typed = parseDecimalInput(quantities[String(item.id)] ?? '');
          const fieldMode = quantityModes[String(item.id)];
          const parsed = typed === null ? null : toItemUnitQuantity(item, typed, fieldMode);
          const isUnitInput = isUnitInputItem(item);
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
                        ? 'Saída acima do saldo'
                        : 'Sem estoque inicial'
                      : needsPurchase
                        ? missingQuantity > 0
                          ? `Comprar ${formatOriginalAndBaseQuantity(
                              missingQuantity,
                              item.unit,
                              item.conversionFactor,
                              formatQuantity,
                            )}`
                          : 'No mínimo (comprar)'
                        : 'OK'}
                  </Text>
                </View>
              </View>

              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>
                Mínimo necessário:{' '}
                {formatOriginalAndBaseQuantity(
                  item.minQuantity,
                  item.unit,
                  item.conversionFactor,
                  formatQuantity,
                )}
              </Text>
              <Text style={styles.itemMeta}>
                Máximo:{' '}
                {item.maxQuantity === null
                  ? '—'
                  : formatOriginalAndBaseQuantity(
                      item.maxQuantity,
                      item.unit,
                      item.conversionFactor,
                      formatQuantity,
                    )}
              </Text>
              <StockEmphasis
                label="Estoque atual"
                value={
                  currentStock === null
                    ? '-'
                    : formatOriginalAndBaseQuantity(
                        currentStock,
                        item.unit,
                        item.conversionFactor,
                        formatQuantity,
                      )
                }
                tone={currentStock === null ? 'empty' : needsPurchaseByCurrentStock ? 'warning' : 'normal'}
                helperText={
                  currentStock === null
                    ? 'Sem estoque inicial'
                    : needsPurchaseByCurrentStock
                      ? 'No mínimo ou abaixo do mínimo'
                      : undefined
                }
              />
              <Text style={styles.itemMeta}>
                Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}
              </Text>
              <Text style={styles.itemMeta}>
                Total de {mode === 'entry' ? 'entradas' : 'saídas'} no dia:{' '}
                {item.currentQuantity === null
                  ? '-'
                  : formatOriginalAndBaseQuantity(
                      item.currentQuantity,
                      item.unit,
                      item.conversionFactor,
                      formatQuantity,
                    )}
              </Text>
              {hasProjectedStock && parsed !== null ? (
                <Text style={styles.itemMeta}>
                  Saldo após {mode === 'entry' ? 'entrada' : 'saída'}:{' '}
                  {formatOriginalAndBaseQuantity(
                    projectedStock as number,
                    item.unit,
                    item.conversionFactor,
                    formatQuantity,
                  )}
                </Text>
              ) : null}

              <Text style={styles.inputLabel}>
                {mode === 'entry'
                  ? currentStock === null
                    ? 'Estoque inicial'
                    : 'Entrada do dia'
                  : 'Saída do dia'}
              </Text>

              {isUnitInput ? (
                <View style={styles.dualInputRow}>
                  <View style={styles.dualInputCol}>
                    <Text style={styles.dualInputLabel}>Fardos (de {formatQuantity(item.conversionFactor)})</Text>
                    <TextInput
                      value={
                        fieldMode === 'fardo'
                          ? quantities[String(item.id)] ?? ''
                          : parsed !== null
                            ? formatQuantity(parsed)
                            : ''
                      }
                      onChangeText={(value) => setFieldValue(item.id, value, 'fardo')}
                      onFocus={() => setFocusedInputItemId(item.id)}
                      onBlur={() => setFocusedInputItemId((current) => (current === item.id ? null : current))}
                      editable={fieldMode !== 'unidade'}
                      placeholder="Ex.: 2"
                      keyboardType="decimal-pad"
                      style={[
                        styles.input,
                        fieldMode === 'unidade' ? styles.inputDisabled : undefined,
                        fieldErrors[String(item.id)] ? styles.inputError : undefined,
                      ]}
                    />
                  </View>
                  <View style={styles.dualInputCol}>
                    <Text style={styles.dualInputLabel}>Unidades</Text>
                    <TextInput
                      value={
                        fieldMode === 'unidade'
                          ? quantities[String(item.id)] ?? ''
                          : parsed !== null
                            ? formatQuantity(convertToBaseUnits(parsed, item.conversionFactor) ?? 0)
                            : ''
                      }
                      onChangeText={(value) => setFieldValue(item.id, value, 'unidade')}
                      onFocus={() => setFocusedInputItemId(item.id)}
                      onBlur={() => setFocusedInputItemId((current) => (current === item.id ? null : current))}
                      editable={fieldMode !== 'fardo'}
                      placeholder={`Ex.: ${formatQuantity(item.conversionFactor)}`}
                      keyboardType="decimal-pad"
                      style={[
                        styles.input,
                        fieldMode === 'fardo' ? styles.inputDisabled : undefined,
                        fieldErrors[String(item.id)] ? styles.inputError : undefined,
                      ]}
                    />
                  </View>
                </View>
              ) : (
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
              )}

              <Pressable
                style={[styles.addToCartButton, isSaving ? styles.submitButtonDisabled : undefined]}
                disabled={isSaving}
                onPress={() => {
                  handleAddItemToCart(item);
                }}
              >
                <Text style={styles.addToCartButtonText}>
                  {cartItem ? 'Atualizar no carrinho' : 'Adicionar ao carrinho'}
                </Text>
              </Pressable>

              {cartItem ? (
                <Text style={styles.cartItemMeta}>
                  No carrinho:{' '}
                  {formatOriginalAndBaseQuantity(
                    cartItem.quantity,
                    cartItem.unit,
                    cartItem.conversionFactor,
                    formatQuantity,
                  )}
                </Text>
              ) : null}

              {fieldErrors[String(item.id)] ? (
                <Text style={styles.errorText}>{fieldErrors[String(item.id)]}</Text>
              ) : null}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />

      <Modal
        transparent
        animationType="fade"
        visible={isCartModalOpen}
        onRequestClose={() => setIsCartModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsCartModalOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Carrinho de {mode === 'entry' ? 'Entrada' : 'Saída'}</Text>
              <Text style={styles.modalSubtitle}>Data: {formatDateLabel(selectedDate)}</Text>
            </View>

            {cartItems.length === 0 ? (
              <Text style={styles.modalEmptyText}>Nenhum item no carrinho.</Text>
            ) : (
              <>
                <ScrollView style={styles.cartList} contentContainerStyle={styles.cartListContent}>
                  {cartItems.map((cartItem) => (
                    <View key={`cart-${cartItem.itemId}`} style={styles.cartRow}>
                      <View style={styles.cartRowInfo}>
                        <Text style={styles.cartRowTitle}>{cartItem.name}</Text>
                        <Text style={styles.cartRowMeta}>
                          {formatOriginalAndBaseQuantity(
                            cartItem.quantity,
                            cartItem.unit,
                            cartItem.conversionFactor,
                            formatQuantity,
                          )}
                        </Text>
                        {mode === 'exit' ? (
                          <View style={styles.cartReasonRow}>
                            <Pressable
                              style={[
                                styles.cartReasonButton,
                                cartItem.reason === 'perda' ? styles.cartReasonButtonActive : undefined,
                              ]}
                              onPress={() => setCartItemReason(cartItem.itemId, 'perda')}
                            >
                              <Text
                                style={[
                                  styles.cartReasonText,
                                  cartItem.reason === 'perda' ? styles.cartReasonTextActive : undefined,
                                ]}
                              >
                                Perda
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.cartReasonButton,
                                cartItem.reason === 'ajuste' ? styles.cartReasonButtonActive : undefined,
                              ]}
                              onPress={() => setCartItemReason(cartItem.itemId, 'ajuste')}
                            >
                              <Text
                                style={[
                                  styles.cartReasonText,
                                  cartItem.reason === 'ajuste' ? styles.cartReasonTextActive : undefined,
                                ]}
                              >
                                Ajuste
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      <Pressable
                        style={styles.cartRemoveButton}
                        onPress={() => {
                          removeFromCart(cartItem.itemId);
                        }}
                      >
                        <Text style={styles.cartRemoveButtonText}>Remover</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                <Text style={styles.cartTotalText}>
                  Itens: {cartItems.length} | Total: {formatQuantity(cartTotalQuantityInBaseUnits)} und
                </Text>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondaryButton} onPress={() => setIsCartModalOpen(false)}>
                <Text style={styles.modalSecondaryButtonText}>Fechar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSecondaryButton, cartItems.length === 0 ? styles.submitButtonDisabled : undefined]}
                disabled={cartItems.length === 0}
                onPress={clearCart}
              >
                <Text style={styles.modalSecondaryButtonText}>Limpar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalPrimaryButton,
                  isSaving || cartItems.length === 0 ? styles.submitButtonDisabled : undefined,
                ]}
                disabled={isSaving || cartItems.length === 0}
                onPress={() => {
                  void handleFinalizeCart();
                }}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>
                    Finalizar {mode === 'entry' ? 'entrada' : 'saída'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={pendingDuplicateAdd !== null}
        onRequestClose={() => setPendingDuplicateAdd(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDuplicateAdd(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Item já esta no carrinho</Text>
            <Text style={styles.modalMessage}>
              Escolha como deseja atualizar "{pendingDuplicateAdd?.item.name ?? ''}".
            </Text>
            <View style={styles.modalOptionStack}>
              <Pressable
                style={styles.modalPrimaryButton}
                onPress={() => handleDuplicateCartDecision('replace')}
              >
                <Text style={styles.modalPrimaryButtonText}>Substituir quantidade</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryButton} onPress={() => handleDuplicateCartDecision('sum')}>
                <Text style={styles.modalPrimaryButtonText}>Somar quantidades</Text>
              </Pressable>
              <Pressable
                style={styles.modalSecondaryButtonFull}
                onPress={() => handleDuplicateCartDecision('cancel')}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={pendingDateChange !== null}
        onRequestClose={() => setPendingDateChange(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDateChange(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Trocar data com carrinho preenchido</Text>
            <Text style={styles.modalMessage}>
              O carrinho possui itens. Como deseja continuar na data {pendingDateChange ? formatDateLabel(pendingDateChange) : ''}?
            </Text>
            <View style={styles.modalOptionStack}>
              <Pressable style={styles.modalPrimaryButton} onPress={() => handleDateChangeDecision('clear')}>
                <Text style={styles.modalPrimaryButtonText}>Trocar data e limpar carrinho</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryButton} onPress={() => handleDateChangeDecision('keep')}>
                <Text style={styles.modalPrimaryButtonText}>Trocar data mantendo carrinho</Text>
              </Pressable>
              <Pressable style={styles.modalSecondaryButtonFull} onPress={() => handleDateChangeDecision('cancel')}>
                <Text style={styles.modalSecondaryButtonText}>Cancelar troca</Text>
              </Pressable>
            </View>
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
  cartHeaderActions: {
    gap: 8,
  },
  submitButton: {
    borderRadius: 14,
    minHeight: 46,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cartSummaryText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '600',
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
  inputDisabled: {
    backgroundColor: '#EFE9F3',
    borderColor: '#D8CCE3',
    color: '#9A86AC',
  },
  dualInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dualInputCol: {
    flex: 1,
    gap: 4,
  },
  dualInputLabel: {
    fontSize: 12,
    color: '#77158E',
    fontWeight: '700',
  },
  addToCartButton: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  addToCartButtonText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '700',
  },
  cartItemMeta: {
    color: '#6F2B86',
    fontSize: 12,
    fontWeight: '600',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 7, 30, 0.46)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...tokens.shadow.card,
  },
  modalHeader: {
    gap: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#3A0D49',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#77158E',
    fontWeight: '600',
  },
  modalMessage: {
    fontSize: 13,
    color: '#5F1175',
    lineHeight: 18,
  },
  modalEmptyText: {
    fontSize: 13,
    color: '#77158E',
    textAlign: 'center',
    paddingVertical: 8,
    fontWeight: '600',
  },
  cartList: {
    maxHeight: 280,
  },
  cartListContent: {
    gap: 8,
    paddingBottom: 2,
  },
  cartRow: {
    borderWidth: 1,
    borderColor: '#D8C3EA',
    backgroundColor: '#F8F1FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cartRowInfo: {
    flex: 1,
    gap: 2,
  },
  cartRowTitle: {
    color: '#2A0834',
    fontSize: 14,
    fontWeight: '700',
  },
  cartRowMeta: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '600',
  },
  cartReasonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cartReasonButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8CCE3',
    backgroundColor: '#F5EEFB',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  cartReasonButtonActive: {
    borderColor: '#8C24A8',
    backgroundColor: '#8C24A8',
  },
  cartReasonText: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '700',
  },
  cartReasonTextActive: {
    color: '#FFFFFF',
  },
  cartRemoveButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFA0A0',
    backgroundColor: '#FDECEC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cartRemoveButtonText: {
    color: '#A12020',
    fontSize: 12,
    fontWeight: '700',
  },
  cartTotalText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modalOptionStack: {
    gap: 8,
  },
  modalSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  modalSecondaryButtonFull: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modalSecondaryButtonText: {
    color: '#5F1175',
    fontSize: 13,
    fontWeight: '700',
  },
  modalPrimaryButton: {
    borderRadius: 10,
    backgroundColor: '#77158E',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
