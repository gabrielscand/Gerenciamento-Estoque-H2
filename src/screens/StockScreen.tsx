import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
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
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell, AppButton } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type { StockCurrentOverviewRow } from '../types/inventory';
import { formatOriginalAndBaseQuantity } from '../utils/unit-conversion';
import { generateInventoryReportPdf } from '../utils/inventory-report';

const FILTER_ALL = '__all__';
const FILTER_UNCATEGORIZED = '__uncategorized__';
const MAX_AUTOCOMPLETE_SUGGESTIONS = 6;

type CategoryFilterValue = typeof FILTER_ALL | typeof FILTER_UNCATEGORIZED | string;
type StockStatusFilter = 'all' | 'with_stock' | 'needs_purchase' | 'ok' | 'no_stock';

const STATUS_FILTER_OPTIONS: Array<{ value: StockStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'with_stock', label: 'Com estoque' },
  { value: 'needs_purchase', label: 'Precisa comprar' },
  { value: 'ok', label: 'OK' },
  { value: 'no_stock', label: 'Sem estoque' },
];

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

function getCategoryFilterLabel(value: CategoryFilterValue): string {
  if (value === FILTER_ALL) {
    return 'Todas as categorias';
  }

  if (value === FILTER_UNCATEGORIZED) {
    return 'Sem categoria';
  }

  return getCategoryLabel(String(value));
}

type CategoryFilterSelectProps = {
  value: CategoryFilterValue;
  options: string[];
  onChange: (nextValue: CategoryFilterValue) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

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
        <Text style={styles.filterSelectText}>{getCategoryFilterLabel(value)}</Text>
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
                  {getCategoryFilterLabel(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function StockScreen() {
  const [items, setItems] = useState<StockCurrentOverviewRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(FILTER_ALL);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const isFocused = useIsFocused();
  const { showTopPopup } = useTopPopup();

  const [isGeneratingInventory, setIsGeneratingInventory] = useState(false);

  async function loadStock(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockCurrentOverview();
      setItems(data);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar estoque atual.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadStock();
  }, [isFocused]);

  const availableCategories = useMemo(() => {
    const uniqueCategories = new Set<string>();

    for (const item of items) {
      if (item.category) {
        uniqueCategories.add(item.category);
      }
    }

    return Array.from(uniqueCategories).sort((left, right) =>
      left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [items]);

  useEffect(() => {
    if (categoryFilter === FILTER_ALL || categoryFilter === FILTER_UNCATEGORIZED) {
      return;
    }

    if (!availableCategories.includes(categoryFilter)) {
      setCategoryFilter(FILTER_ALL);
    }
  }, [availableCategories, categoryFilter]);

  const categoryFilteredItems = useMemo(() => {
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

  const statusFilteredItems = useMemo(() => {
    return categoryFilteredItems.filter((item) => {
      if (statusFilter === 'all') {
        return true;
      }

      if (statusFilter === 'no_stock') {
        return item.currentStockQuantity === null;
      }

      if (statusFilter === 'with_stock') {
        return item.currentStockQuantity !== null;
      }

      if (statusFilter === 'needs_purchase') {
        return item.needsPurchase;
      }

      return item.currentStockQuantity !== null && !item.needsPurchase;
    });
  }, [categoryFilteredItems, statusFilter]);

  const normalizedSearchQuery = useMemo(() => normalizeSearchValue(searchQuery), [searchQuery]);

  const filteredItems = useMemo(() => {
    if (!normalizedSearchQuery) {
      return statusFilteredItems;
    }

    return statusFilteredItems.filter((item) =>
      normalizeSearchValue(item.name).includes(normalizedSearchQuery),
    );
  }, [statusFilteredItems, normalizedSearchQuery]);

  const searchSuggestions = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const startsWithMatches: StockCurrentOverviewRow[] = [];
    const containsMatches: StockCurrentOverviewRow[] = [];

    for (const item of statusFilteredItems) {
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
  }, [statusFilteredItems, normalizedSearchQuery]);

  const summary = useMemo(() => {
    let initializedItems = 0;
    let needPurchaseItems = 0;
    let totalMissingQuantityInBaseUnits = 0;

    for (const item of filteredItems) {
      if (item.currentStockQuantity !== null) {
        initializedItems += 1;
      }

      if (item.needsPurchase) {
        needPurchaseItems += 1;
        totalMissingQuantityInBaseUnits += item.missingQuantityInBaseUnits;
      }
    }

    return {
      totalItems: filteredItems.length,
      initializedItems,
      needPurchaseItems,
      totalMissingQuantityInBaseUnits,
    };
  }, [filteredItems]);

  function setSearchValue(value: string) {
    setSearchQuery(value);
  }

  async function handleGenerateInventory() {
    if (isGeneratingInventory) {
      return;
    }

    setIsGeneratingInventory(true);

    try {
      const result = await generateInventoryReportPdf();

      showTopPopup({
        type: 'success',
        message:
          Platform.OS === 'web'
            ? 'Inventario enviado para visualizacao/impressao.'
            : result.totalItems === 0
              ? 'Inventario gerado sem itens cadastrados.'
              : result.shared
                ? 'Inventario gerado e pronto para compartilhar.'
                : 'Inventario gerado com sucesso.',
        durationMs: 3600,
      });
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar inventario.',
        durationMs: 4200,
      });
    } finally {
      setIsGeneratingInventory(false);
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
              void loadStock(true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title="Estoque Atual"
                subtitle="Saldo consolidado"
                description="Acompanhe rapidamente os itens no limite minimo e o faltante para compra."
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Itens" value={String(summary.totalItems)} />
                  <KpiTile label="Com saldo" value={String(summary.initializedItems)} />
                  <KpiTile label="Comprar" value={String(summary.needPurchaseItems)} />
                  <KpiTile
                    label="Faltante (und)"
                    value={formatQuantity(summary.totalMissingQuantityInBaseUnits)}
                  />
                </View>
              </HeroHeader>
            </MotionEntrance>

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

            <View style={styles.filterCard}>
              <Text style={styles.filterLabel}>Filtrar por status</Text>
              <View style={styles.statusFilterRow}>
                {STATUS_FILTER_OPTIONS.map((option) => {
                  const isSelected = statusFilter === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.statusFilterButton, isSelected ? styles.statusFilterButtonActive : undefined]}
                      onPress={() => {
                        setStatusFilter(option.value);
                        setIsCategoryFilterOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.statusFilterButtonText,
                          isSelected ? styles.statusFilterButtonTextActive : undefined,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                        setIsCategoryFilterOpen(false);
                      }}
                    >
                      <Text style={styles.searchSuggestionText}>{suggestion.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={styles.listTitle}>Itens no estoque ({filteredItems.length})</Text>

            <View style={styles.reportButtonWrap}>
              <AppButton
                label={isGeneratingInventory ? 'Gerando inventario...' : 'Gerar Inventario'}
                onPress={() => {
                  void handleGenerateInventory();
                }}
                disabled={isGeneratingInventory}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando estoque...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum item cadastrado.</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item encontrado para os filtros selecionados.</Text>
          )
        }
        renderItem={({ item }) => {
          const hasStock = item.currentStockQuantity !== null;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    !hasStock
                      ? styles.statusPending
                      : item.needsPurchase
                        ? styles.statusNeedPurchase
                        : styles.statusOk,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {!hasStock ? 'Sem estoque inicial' : item.needsPurchase ? 'Precisa comprar' : 'OK'}
                  </Text>
                </View>
              </View>

              <StockEmphasis
                label="Estoque atual"
                value={
                  hasStock
                    ? formatOriginalAndBaseQuantity(
                        item.currentStockQuantity as number,
                        item.unit,
                        item.conversionFactor,
                        formatQuantity,
                      )
                    : '-'
                }
                tone={!hasStock ? 'empty' : item.needsPurchase ? 'warning' : 'normal'}
                helperText={
                  !hasStock
                    ? 'Sem estoque inicial'
                    : item.needsPurchase
                      ? 'No minimo ou abaixo do minimo'
                      : undefined
                }
              />
              <Text style={styles.itemMeta}>Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}</Text>
              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>
                Minimo:{' '}
                {formatOriginalAndBaseQuantity(
                  item.minQuantity,
                  item.unit,
                  item.conversionFactor,
                  formatQuantity,
                )}
              </Text>
              {item.needsPurchase && item.missingQuantity > 0 ? (
                <Pressable style={styles.purchaseHint}>
                  <Text style={styles.purchaseHintText}>
                    Comprar{' '}
                    {formatOriginalAndBaseQuantity(
                      item.missingQuantity,
                      item.unit,
                      item.conversionFactor,
                      formatQuantity,
                    )}
                  </Text>
                </Pressable>
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
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 6,
  },
  reportButtonWrap: {
    marginTop: 2,
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
  statusFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusFilterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusFilterButtonActive: {
    backgroundColor: '#EDE0F9',
    borderColor: '#9D63C4',
  },
  statusFilterButtonText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
  },
  statusFilterButtonTextActive: {
    color: '#441055',
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
    color: tokens.colors.textSecondary,
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
  purchaseHint: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.dangerSoft,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F5B9B9',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purchaseHintText: {
    color: tokens.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
