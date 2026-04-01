import { useEffect, useState } from 'react';
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
  archiveStockItem,
  createStockItem,
  findItemByNormalizedName,
  listItemCategories,
  listMeasurementUnits,
  listStockItems,
  subscribeToCatalogOptionsChanged,
  updateStockItem,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type { CreateStockItemInput, StockItemListRow } from '../types/inventory';
import { formatOriginalAndBaseQuantity } from '../utils/unit-conversion';

type FormState = {
  name: string;
  unit: string | '';
  category: string | '';
  minQuantity: string;
};

type FormErrors = Partial<Record<keyof FormState | 'submit', string>>;

const initialFormState: FormState = {
  name: '',
  unit: '',
  category: '',
  minQuantity: '',
};
const MAX_AUTOCOMPLETE_SUGGESTIONS = 6;

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

function buildValidationErrors(form: FormState): { errors: FormErrors; parsed?: CreateStockItemInput } {
  const errors: FormErrors = {};

  const name = form.name.trim();
  const unit = form.unit.trim();
  const category = form.category;
  const minQuantity = parseDecimalInput(form.minQuantity);

  if (name.length === 0) {
    errors.name = 'Informe o nome do item.';
  }

  if (unit.length === 0) {
    errors.unit = 'Informe a unidade de medida.';
  }

  if (!category) {
    errors.category = 'Selecione uma categoria.';
  }

  if (minQuantity === null) {
    errors.minQuantity = 'Informe uma quantidade minima valida.';
  } else if (minQuantity < 0) {
    errors.minQuantity = 'A quantidade minima nao pode ser negativa.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    parsed: {
      name,
      unit,
      minQuantity: minQuantity as number,
      category: category as string,
    },
  };
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

type CategorySelectProps = {
  value: string | '';
  options: string[];
  onChange: (nextValue: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  formatOptionLabel?: (value: string) => string;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  compact?: boolean;
};

function CatalogSelect({
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  onClose,
  formatOptionLabel,
  placeholder,
  error,
  disabled = false,
  compact = false,
}: CategorySelectProps) {
  const labelResolver = formatOptionLabel ?? ((option: string) => option);

  return (
    <View style={styles.selectRoot}>
      <Pressable
        style={[
          styles.selectTrigger,
          compact ? styles.selectTriggerCompact : undefined,
          error ? styles.inputError : undefined,
          disabled ? styles.selectDisabled : undefined,
        ]}
        onPress={onToggle}
        disabled={disabled}
      >
        <Text
          style={[
            value ? styles.selectTriggerText : styles.selectPlaceholderText,
            compact ? styles.selectCompactText : undefined,
          ]}
        >
          {value ? labelResolver(value) : placeholder}
        </Text>
        <Text style={styles.selectArrow}>{isOpen ? '^' : 'v'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={[styles.selectMenu, compact ? styles.selectMenuCompact : undefined]}>
          {options.length === 0 ? (
            <View style={[styles.selectEmptyState, compact ? styles.selectEmptyStateCompact : undefined]}>
              <Text style={[styles.selectEmptyStateText, compact ? styles.selectEmptyStateTextCompact : undefined]}>
                Nenhuma opcao cadastrada.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={compact ? styles.selectMenuScroll : undefined}
              contentContainerStyle={styles.selectMenuScrollContent}
              nestedScrollEnabled={compact}
            >
              {options.map((option) => {
                const isSelected = value === option;

                return (
                  <Pressable
                    key={option}
                    style={[
                      styles.selectOption,
                      compact ? styles.selectOptionCompact : undefined,
                      isSelected ? styles.selectOptionActive : undefined,
                    ]}
                    onPress={() => {
                      onChange(option);
                      onClose();
                    }}
                  >
                    <Text
                      style={[
                        styles.selectOptionText,
                        compact ? styles.selectOptionTextCompact : undefined,
                        isSelected ? styles.selectOptionTextActive : undefined,
                      ]}
                    >
                      {labelResolver(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

async function confirmDuplicateAction(message: string, confirmLabel: string): Promise<boolean> {
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
      'Item parecido encontrado',
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

export function ItemsScreen() {
  const isFocused = useIsFocused();
  const [items, setItems] = useState<StockItemListRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [createForm, setCreateForm] = useState<FormState>(initialFormState);
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [isCreateUnitOpen, setIsCreateUnitOpen] = useState(false);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [isEditUnitOpen, setIsEditUnitOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<StockItemListRow | null>(null);
  const { showTopPopup } = useTopPopup();

  async function loadCatalogOptions() {
    try {
      const [categories, units] = await Promise.all([
        listItemCategories(),
        listMeasurementUnits(),
      ]);
      setCategoryOptions(categories);
      setUnitOptions(units);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar categorias e unidades.',
        durationMs: 4200,
      });
    }
  }

  async function loadItems(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockItems();
      setItems(data);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar itens.',
        durationMs: 4200,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    void loadCatalogOptions();
    const unsubscribe = subscribeToCatalogOptionsChanged(() => {
      void loadCatalogOptions();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadCatalogOptions();
  }, [isFocused]);

  function setCreateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
    setCreateErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
  }

  function setEditField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
  }

  function startEditing(item: StockItemListRow) {
    setIsCreateCategoryOpen(false);
    setIsCreateUnitOpen(false);
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      category: item.category ?? '',
      minQuantity: String(item.minQuantity),
    });
    setIsEditCategoryOpen(false);
    setIsEditUnitOpen(false);
    setEditErrors({});
    setCreateErrors((prev) => ({ ...prev, submit: undefined }));
  }

  function cancelEditing() {
    setEditingItemId(null);
    setEditForm(initialFormState);
    setIsEditCategoryOpen(false);
    setIsEditUnitOpen(false);
    setEditErrors({});
  }

  async function shouldProceedForDuplicate(
    name: string,
    excludeItemId: number | undefined,
    confirmLabel: string,
  ): Promise<boolean> {
    const duplicatedItem = await findItemByNormalizedName(name, excludeItemId);

    if (!duplicatedItem) {
      return true;
    }

    return confirmDuplicateAction(
      'Ja existe um item com esse nome. Deseja salvar mesmo assim?',
      confirmLabel,
    );
  }

  async function handleCreate() {
    const validationResult = buildValidationErrors(createForm);

    if (!validationResult.parsed) {
      setCreateErrors(validationResult.errors);
      return;
    }

    setIsCreating(true);
    setCreateErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      const proceed = await shouldProceedForDuplicate(
        validationResult.parsed.name,
        undefined,
        'Cadastrar mesmo assim',
      );

      if (!proceed) {
        return;
      }

      await createStockItem(validationResult.parsed);
      setCreateForm(initialFormState);
      setIsCreateCategoryOpen(false);
      setCreateErrors({});
      showTopPopup({
        type: 'success',
        message: 'Item cadastrado com sucesso.',
        durationMs: 3000,
      });
      await loadItems();
      await loadCatalogOptions();
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel salvar o item.',
        durationMs: 4200,
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(itemId: number) {
    const validationResult = buildValidationErrors(editForm);

    if (!validationResult.parsed) {
      setEditErrors(validationResult.errors);
      return;
    }

    setIsUpdating(true);
    setEditErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      const proceed = await shouldProceedForDuplicate(
        validationResult.parsed.name,
        itemId,
        'Salvar mesmo assim',
      );

      if (!proceed) {
        return;
      }

      await updateStockItem(itemId, validationResult.parsed);
      cancelEditing();
      showTopPopup({
        type: 'success',
        message: 'Item atualizado com sucesso.',
        durationMs: 3000,
      });
      await loadItems();
      await loadCatalogOptions();
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel atualizar o item.',
        durationMs: 4200,
      });
    } finally {
      setIsUpdating(false);
    }
  }

  function openArchiveModal(item: StockItemListRow) {
    if (isDeleting) {
      return;
    }

    setArchiveTarget(item);
    setEditErrors((prev) => ({ ...prev, submit: undefined }));
  }

  function closeArchiveModal() {
    if (isDeleting) {
      return;
    }

    setArchiveTarget(null);
  }

  async function handleArchive() {
    if (!archiveTarget) {
      return;
    }

    setIsDeleting(true);
    setEditErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      await archiveStockItem(archiveTarget.id);
      setArchiveTarget(null);
      cancelEditing();
      showTopPopup({
        type: 'success',
        message: 'Item arquivado com sucesso.',
        durationMs: 3000,
      });
      await loadItems();
      await loadCatalogOptions();
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel excluir o item.',
        durationMs: 4200,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const createCategoryOptions = createForm.category && !categoryOptions.includes(createForm.category)
    ? [createForm.category, ...categoryOptions]
    : categoryOptions;
  const createUnitOptions = createForm.unit && !unitOptions.includes(createForm.unit)
    ? [createForm.unit, ...unitOptions]
    : unitOptions;
  const editCategoryOptions = editForm.category && !categoryOptions.includes(editForm.category)
    ? [editForm.category, ...categoryOptions]
    : categoryOptions;
  const editUnitOptions = editForm.unit && !unitOptions.includes(editForm.unit)
    ? [editForm.unit, ...unitOptions]
    : unitOptions;
  const filteredItems =
    normalizedSearchQuery.length === 0
      ? items
      : items.filter((item) =>
          normalizeSearchValue(item.name).includes(normalizedSearchQuery),
        );
  const searchSuggestions = (() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const startsWithMatches: StockItemListRow[] = [];
    const containsMatches: StockItemListRow[] = [];

    for (const item of items) {
      const normalizedName = normalizeSearchValue(item.name);

      if (normalizedName.startsWith(normalizedSearchQuery)) {
        startsWithMatches.push(item);
        continue;
      }

      if (normalizedName.includes(normalizedSearchQuery)) {
        containsMatches.push(item);
      }
    }

    return [...startsWithMatches, ...containsMatches].slice(
      0,
      MAX_AUTOCOMPLETE_SUGGESTIONS,
    );
  })();
  const totalItems = items.length;
  const withCategory = items.filter((item) => !!item.category).length;
  const withStock = items.filter((item) => item.currentStockQuantity !== null).length;
  const needPurchaseNow = items.filter(
    (item) => item.currentStockQuantity !== null && (item.currentStockQuantity as number) <= item.minQuantity,
  ).length;

  return (
    <ScreenShell>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadItems(true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title="Cadastro de Itens"
                subtitle="Base de produtos e insumos"
                description="Configure nome, unidade, categoria e minimo para abastecer a operacao."
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Itens" value={String(totalItems)} />
                  <KpiTile label="Com categoria" value={String(withCategory)} />
                  <KpiTile label="Com saldo" value={String(withStock)} />
                  <KpiTile label="Comprar agora" value={String(needPurchaseNow)} />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Novo item</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nome do item</Text>
                <TextInput
                  value={createForm.name}
                  onChangeText={(value) => setCreateField('name', value)}
                  placeholder="Ex.: Arroz"
                  style={[styles.input, createErrors.name ? styles.inputError : undefined]}
                />
                {createErrors.name ? <Text style={styles.errorText}>{createErrors.name}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Unidade de medida</Text>
                <CatalogSelect
                  value={createForm.unit}
                  options={createUnitOptions}
                  onChange={(value) => setCreateField('unit', value)}
                  isOpen={isCreateUnitOpen}
                  onToggle={() => {
                    setIsCreateUnitOpen((prev) => !prev);
                    setIsCreateCategoryOpen(false);
                    setIsEditUnitOpen(false);
                    setIsEditCategoryOpen(false);
                  }}
                  onClose={() => setIsCreateUnitOpen(false)}
                  placeholder="Selecione a unidade"
                  error={createErrors.unit}
                  disabled={isCreating}
                  compact
                />
                {createErrors.unit ? <Text style={styles.errorText}>{createErrors.unit}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Categoria</Text>
                <CatalogSelect
                  value={createForm.category}
                  options={createCategoryOptions}
                  onChange={(value) => setCreateField('category', value)}
                  isOpen={isCreateCategoryOpen}
                  onToggle={() => {
                    setIsCreateCategoryOpen((prev) => !prev);
                    setIsCreateUnitOpen(false);
                    setIsEditCategoryOpen(false);
                    setIsEditUnitOpen(false);
                  }}
                  onClose={() => setIsCreateCategoryOpen(false)}
                  formatOptionLabel={getCategoryLabel}
                  placeholder="Selecione uma categoria"
                  error={createErrors.category}
                  disabled={isCreating}
                  compact
                />
                {createErrors.category ? <Text style={styles.errorText}>{createErrors.category}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Quantidade minima</Text>
                <TextInput
                  value={createForm.minQuantity}
                  onChangeText={(value) => setCreateField('minQuantity', value)}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={[styles.input, createErrors.minQuantity ? styles.inputError : undefined]}
                />
                {createErrors.minQuantity ? <Text style={styles.errorText}>{createErrors.minQuantity}</Text> : null}
              </View>

              <Pressable
                style={[styles.submitButton, isCreating ? styles.submitButtonDisabled : undefined]}
                disabled={isCreating}
                onPress={() => {
                  void handleCreate();
                }}
              >
                {isCreating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>Cadastrar item</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.searchCard}>
              <View style={styles.searchHeader}>
                <Text style={styles.searchLabel}>Buscar item</Text>
                {searchQuery.trim().length > 0 ? (
                  <Pressable
                    style={styles.clearSearchButton}
                    onPress={() => {
                      setSearchQuery('');
                    }}
                  >
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
                      key={`suggestion-${suggestion.id}`}
                      style={[
                        styles.searchSuggestionButton,
                        index === searchSuggestions.length - 1
                          ? styles.searchSuggestionButtonLast
                          : undefined,
                      ]}
                      onPress={() => {
                        setSearchQuery(suggestion.name);
                      }}
                    >
                      <Text style={styles.searchSuggestionText}>
                        {suggestion.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={styles.listTitle}>Itens cadastrados</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum item cadastrado ainda.</Text>
          ) : (
            <Text style={styles.emptyText}>
              Nenhum item encontrado para a busca selecionada.
            </Text>
          )
        }
        renderItem={({ item }) => {
          const isEditing = editingItemId === item.id;
          const hasStock = item.currentStockQuantity !== null;
          const needsPurchaseByCurrentStock =
            hasStock && (item.currentStockQuantity as number) <= item.minQuantity;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                {!isEditing ? (
                  <Pressable style={styles.iconButton} onPress={() => startEditing(item)}>
                    <Ionicons name="create-outline" size={16} color={tokens.colors.accentDeep} />
                  </Pressable>
                ) : null}
              </View>

              {!isEditing ? (
                <>
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
                    tone={!hasStock ? 'empty' : needsPurchaseByCurrentStock ? 'warning' : 'normal'}
                    helperText={
                      !hasStock
                        ? 'Sem estoque inicial'
                        : needsPurchaseByCurrentStock
                          ? 'No minimo ou abaixo do minimo'
                          : undefined
                    }
                  />
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
                  <Text style={styles.itemMeta}>
                    Categoria: {item.category ? getCategoryLabel(item.category) : 'Categoria pendente'}
                  </Text>
                  {!item.category ? (
                    <View style={styles.pendingCategoryBadge}>
                      <Text style={styles.pendingCategoryBadgeText}>Categoria pendente</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.editCard}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Nome do item</Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(value) => setEditField('name', value)}
                      placeholder="Ex.: Arroz"
                      style={[styles.input, editErrors.name ? styles.inputError : undefined]}
                    />
                    {editErrors.name ? <Text style={styles.errorText}>{editErrors.name}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Unidade de medida</Text>
                    <CatalogSelect
                      value={editForm.unit}
                      options={editUnitOptions}
                      onChange={(value) => setEditField('unit', value)}
                      isOpen={isEditUnitOpen}
                      onToggle={() => {
                        setIsEditUnitOpen((prev) => !prev);
                        setIsEditCategoryOpen(false);
                        setIsCreateUnitOpen(false);
                        setIsCreateCategoryOpen(false);
                      }}
                      onClose={() => setIsEditUnitOpen(false)}
                      placeholder="Selecione a unidade"
                      error={editErrors.unit}
                      disabled={isUpdating || isDeleting}
                      compact
                    />
                    {editErrors.unit ? <Text style={styles.errorText}>{editErrors.unit}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Categoria</Text>
                    <CatalogSelect
                      value={editForm.category}
                      options={editCategoryOptions}
                      onChange={(value) => setEditField('category', value)}
                      isOpen={isEditCategoryOpen}
                      onToggle={() => {
                        setIsEditCategoryOpen((prev) => !prev);
                        setIsEditUnitOpen(false);
                        setIsCreateCategoryOpen(false);
                        setIsCreateUnitOpen(false);
                      }}
                      onClose={() => setIsEditCategoryOpen(false)}
                      formatOptionLabel={getCategoryLabel}
                      placeholder="Selecione uma categoria"
                      error={editErrors.category}
                      disabled={isUpdating || isDeleting}
                      compact
                    />
                    {editErrors.category ? <Text style={styles.errorText}>{editErrors.category}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Quantidade minima</Text>
                    <TextInput
                      value={editForm.minQuantity}
                      onChangeText={(value) => setEditField('minQuantity', value)}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      style={[styles.input, editErrors.minQuantity ? styles.inputError : undefined]}
                    />
                    {editErrors.minQuantity ? <Text style={styles.errorText}>{editErrors.minQuantity}</Text> : null}
                  </View>

                  <View style={styles.editActions}>
                    <Pressable style={styles.cancelButton} onPress={cancelEditing} disabled={isUpdating || isDeleting}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.deleteButton, isDeleting ? styles.submitButtonDisabled : undefined]}
                      onPress={() => {
                        openArchiveModal(item);
                      }}
                      disabled={isUpdating || isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.submitButtonText}>Arquivar item</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[
                        styles.submitButton,
                        styles.editSaveButton,
                        isUpdating ? styles.submitButtonDisabled : undefined,
                      ]}
                      onPress={() => {
                        void handleUpdate(item.id);
                      }}
                      disabled={isUpdating || isDeleting}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.submitButtonText}>Salvar</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />

      <Modal
        animationType="fade"
        transparent
        visible={archiveTarget !== null}
        onRequestClose={closeArchiveModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Arquivar item</Text>
            <Text style={styles.modalDescription}>
              Deseja arquivar este item? Ele sera removido de Itens, Entrada e Saida, mas continuara no Historico e no banco com is_deleted = 1.
            </Text>
            {archiveTarget ? <Text style={styles.modalItemName}>{archiveTarget.name}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={closeArchiveModal}
                disabled={isDeleting}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDangerButton, isDeleting ? styles.submitButtonDisabled : undefined]}
                onPress={() => {
                  void handleArchive();
                }}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalDangerButtonText}>Arquivar</Text>
                )}
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
    marginBottom: 6,
  },
  heroCard: {
    display: 'none',
  },
  title: {
    color: '#F5EEFB',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#EDE0F9',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    padding: 16,
    gap: 10,
    ...tokens.shadow.card,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3A0D49',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: tokens.colors.accent,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2A0834',
    fontSize: 15,
  },
  selectRoot: {
    gap: 6,
  },
  selectTrigger: {
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F8F1FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerCompact: {
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectDisabled: {
    opacity: 0.7,
  },
  selectTriggerText: {
    color: '#2A0834',
    fontSize: 15,
    fontWeight: '600',
  },
  selectPlaceholderText: {
    color: '#8A2AA3',
    fontSize: 15,
  },
  selectCompactText: {
    fontSize: 13,
  },
  selectArrow: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '700',
  },
  selectMenu: {
    borderWidth: 1,
    borderColor: '#D8C3EA',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  selectMenuCompact: {
    borderRadius: 10,
  },
  selectMenuScroll: {
    maxHeight: 190,
  },
  selectMenuScrollContent: {
    paddingVertical: 2,
  },
  selectEmptyState: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAD9F6',
    backgroundColor: '#F8F1FD',
  },
  selectEmptyStateCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectEmptyStateText: {
    color: '#8A2AA3',
    fontSize: 13,
  },
  selectEmptyStateTextCompact: {
    fontSize: 12,
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAD9F6',
  },
  selectOptionCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectOptionActive: {
    backgroundColor: '#EDE0F9',
  },
  selectOptionText: {
    color: '#3A0D49',
    fontSize: 14,
    fontWeight: '600',
  },
  selectOptionTextCompact: {
    fontSize: 13,
  },
  selectOptionTextActive: {
    color: '#5F1175',
    fontWeight: '700',
  },
  inputError: {
    borderColor: '#D74A4A',
  },
  submitButton: {
    marginTop: 6,
    backgroundColor: tokens.colors.accent,
    borderRadius: 14,
    minHeight: 46,
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
  successText: {
    color: '#5F1175',
    backgroundColor: '#EDE0F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#B02323',
    fontSize: 12,
    lineHeight: 17,
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
    fontSize: 18,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    marginTop: 20,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 8,
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
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  pendingCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FDE68A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingCategoryBadgeText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  editCard: {
    gap: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B690D2',
    borderRadius: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EEFB',
    marginTop: 6,
  },
  cancelButtonText: {
    color: '#5F1175',
    fontSize: 15,
    fontWeight: '700',
  },
  editSaveButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    marginTop: 6,
    backgroundColor: '#B02323',
    borderRadius: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: tokens.colors.overlay,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    padding: 16,
    gap: 12,
    ...tokens.shadow.card,
  },
  modalTitle: {
    color: '#2A0834',
    fontSize: 18,
    fontWeight: '800',
  },
  modalDescription: {
    color: '#5F1175',
    fontSize: 14,
    lineHeight: 20,
  },
  modalItemName: {
    color: '#3A0D49',
    fontSize: 15,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B690D2',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EEFB',
    paddingHorizontal: 12,
  },
  modalSecondaryButtonText: {
    color: '#5F1175',
    fontSize: 14,
    fontWeight: '700',
  },
  modalDangerButton: {
    flex: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B02323',
    paddingHorizontal: 12,
  },
  modalDangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
