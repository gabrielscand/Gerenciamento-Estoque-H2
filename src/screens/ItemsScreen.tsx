import { useEffect, useState } from 'react';
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
import {
  archiveStockItem,
  createStockItem,
  findItemByNormalizedName,
  listStockItems,
  updateStockItem,
} from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import type { CreateStockItemInput, StockItemListRow } from '../types/inventory';

type FormState = {
  name: string;
  unit: string;
  category: StockCategory | '';
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
      category: category as StockCategory,
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
  value: StockCategory | '';
  onChange: (nextValue: StockCategory) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  placeholder: string;
  error?: string;
  disabled?: boolean;
};

function CategorySelect({
  value,
  onChange,
  isOpen,
  onToggle,
  onClose,
  placeholder,
  error,
  disabled = false,
}: CategorySelectProps) {
  return (
    <View style={styles.selectRoot}>
      <Pressable
        style={[styles.selectTrigger, error ? styles.inputError : undefined, disabled ? styles.selectDisabled : undefined]}
        onPress={onToggle}
        disabled={disabled}
      >
        <Text style={value ? styles.selectTriggerText : styles.selectPlaceholderText}>
          {value ? getCategoryLabel(value) : placeholder}
        </Text>
        <Text style={styles.selectArrow}>{isOpen ? '▴' : '▾'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.selectMenu}>
          {STOCK_CATEGORIES.map((category) => {
            const isSelected = value === category;

            return (
              <Pressable
                key={category}
                style={[styles.selectOption, isSelected ? styles.selectOptionActive : undefined]}
                onPress={() => {
                  onChange(category);
                  onClose();
                }}
              >
                <Text style={[styles.selectOptionText, isSelected ? styles.selectOptionTextActive : undefined]}>
                  {getCategoryLabel(category)}
                </Text>
              </Pressable>
            );
          })}
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

async function confirmArchiveItem(): Promise<boolean> {
  const message =
    'Deseja arquivar este item? Ele sera removido de Itens, Entrada e Saida, mas continuara no Historico e no banco com is_deleted = 1.';

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
      'Arquivar item',
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
        { text: 'Arquivar', style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

export function ItemsScreen() {
  const [items, setItems] = useState<StockItemListRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [createForm, setCreateForm] = useState<FormState>(initialFormState);
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  async function loadItems(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockItems();
      setItems(data);
    } catch (error) {
      setCreateErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Falha ao carregar itens.',
      }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  function setCreateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
    setCreateErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
    setFeedbackMessage('');
  }

  function setEditField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
    setFeedbackMessage('');
  }

  function startEditing(item: StockItemListRow) {
    setIsCreateCategoryOpen(false);
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      category: item.category ?? '',
      minQuantity: String(item.minQuantity),
    });
    setIsEditCategoryOpen(false);
    setEditErrors({});
    setCreateErrors((prev) => ({ ...prev, submit: undefined }));
    setFeedbackMessage('');
  }

  function cancelEditing() {
    setEditingItemId(null);
    setEditForm(initialFormState);
    setIsEditCategoryOpen(false);
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
      setFeedbackMessage('Item cadastrado com sucesso.');
      await loadItems();
    } catch (error) {
      setCreateErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Nao foi possivel salvar o item.',
      }));
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
      setFeedbackMessage('Item atualizado com sucesso.');
      await loadItems();
    } catch (error) {
      setEditErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Nao foi possivel atualizar o item.',
      }));
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleArchive(itemId: number) {
    const confirmed = await confirmArchiveItem();

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setEditErrors((prev) => ({ ...prev, submit: undefined }));
    setFeedbackMessage('');

    try {
      await archiveStockItem(itemId);
      cancelEditing();
      setFeedbackMessage('Item arquivado com sucesso.');
      await loadItems();
    } catch (error) {
      setEditErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Nao foi possivel excluir o item.',
      }));
    } finally {
      setIsDeleting(false);
    }
  }

  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
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

  return (
    <View style={styles.container}>
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

            <View style={styles.heroCard}>
              <Text style={styles.title}>Cadastro de Itens</Text>
              <Text style={styles.subtitle}>
                Cadastre itens com nome, unidade e quantidade minima. O saldo atual sera atualizado pelas abas de
                Entrada e Saida.
              </Text>
            </View>

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
                <TextInput
                  value={createForm.unit}
                  onChangeText={(value) => setCreateField('unit', value)}
                  placeholder="Ex.: kg, un, L"
                  style={[styles.input, createErrors.unit ? styles.inputError : undefined]}
                />
                {createErrors.unit ? <Text style={styles.errorText}>{createErrors.unit}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Categoria</Text>
                <CategorySelect
                  value={createForm.category}
                  onChange={(value) => setCreateField('category', value)}
                  isOpen={isCreateCategoryOpen}
                  onToggle={() => {
                    setIsCreateCategoryOpen((prev) => !prev);
                    setIsEditCategoryOpen(false);
                  }}
                  onClose={() => setIsCreateCategoryOpen(false)}
                  placeholder="Selecione uma categoria"
                  error={createErrors.category}
                  disabled={isCreating}
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

              {feedbackMessage ? <Text style={styles.successText}>{feedbackMessage}</Text> : null}
              {createErrors.submit ? <Text style={styles.errorText}>{createErrors.submit}</Text> : null}

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
                    <Text style={styles.iconButtonText}>✎</Text>
                  </Pressable>
                ) : null}
              </View>

              {!isEditing ? (
                <>
                  <StockEmphasis
                    label="Estoque atual"
                    value={hasStock ? `${formatQuantity(item.currentStockQuantity as number)} ${item.unit}` : '-'}
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
                  <Text style={styles.itemMeta}>Minimo: {formatQuantity(item.minQuantity)}</Text>
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
                    <TextInput
                      value={editForm.unit}
                      onChangeText={(value) => setEditField('unit', value)}
                      placeholder="Ex.: kg, un, L"
                      style={[styles.input, editErrors.unit ? styles.inputError : undefined]}
                    />
                    {editErrors.unit ? <Text style={styles.errorText}>{editErrors.unit}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Categoria</Text>
                    <CategorySelect
                      value={editForm.category}
                      onChange={(value) => setEditField('category', value)}
                      isOpen={isEditCategoryOpen}
                      onToggle={() => {
                        setIsEditCategoryOpen((prev) => !prev);
                        setIsCreateCategoryOpen(false);
                      }}
                      onClose={() => setIsEditCategoryOpen(false)}
                      placeholder="Selecione uma categoria"
                      error={editErrors.category}
                      disabled={isUpdating || isDeleting}
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

                  {editErrors.submit ? <Text style={styles.errorText}>{editErrors.submit}</Text> : null}

                  <View style={styles.editActions}>
                    <Pressable style={styles.cancelButton} onPress={cancelEditing} disabled={isUpdating || isDeleting}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.deleteButton, isDeleting ? styles.submitButtonDisabled : undefined]}
                      onPress={() => {
                        void handleArchive(item.id);
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
    gap: 12,
    marginBottom: 6,
  },
  heroCard: {
    backgroundColor: '#5B21B6',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  title: {
    color: '#F5F3FF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#EDE9FE',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 16,
    gap: 10,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4C1D95',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
    fontSize: 15,
  },
  selectRoot: {
    gap: 6,
  },
  selectTrigger: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectDisabled: {
    opacity: 0.7,
  },
  selectTriggerText: {
    color: '#3B0764',
    fontSize: 15,
    fontWeight: '600',
  },
  selectPlaceholderText: {
    color: '#7C3AED',
    fontSize: 15,
  },
  selectArrow: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  selectMenu: {
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  selectOptionActive: {
    backgroundColor: '#EDE9FE',
  },
  selectOptionText: {
    color: '#4C1D95',
    fontSize: 14,
    fontWeight: '600',
  },
  selectOptionTextActive: {
    color: '#5B21B6',
    fontWeight: '700',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  submitButton: {
    marginTop: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    minHeight: 44,
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
    color: '#5B21B6',
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  searchLabel: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '700',
  },
  clearSearchButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearSearchButtonText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
    fontSize: 14,
  },
  searchSuggestionsContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  searchSuggestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  searchSuggestionButtonLast: {
    borderBottomWidth: 0,
  },
  searchSuggestionText: {
    color: '#4C1D95',
    fontSize: 13,
    fontWeight: '600',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4C1D95',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6D28D9',
    fontSize: 14,
    marginTop: 20,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 14,
    gap: 8,
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
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    color: '#4C1D95',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemMeta: {
    fontSize: 13,
    color: '#5B21B6',
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
    borderColor: '#C4B5FD',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    marginTop: 6,
  },
  cancelButtonText: {
    color: '#5B21B6',
    fontSize: 15,
    fontWeight: '700',
  },
  editSaveButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    marginTop: 6,
    backgroundColor: '#B91C1C',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
