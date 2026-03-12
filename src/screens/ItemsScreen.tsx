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
import {
  createStockItem,
  findItemByNormalizedName,
  listStockItems,
  updateStockItem,
} from '../database/items.repository';
import type { CreateStockItemInput, StockItemListRow } from '../types/inventory';

type FormState = {
  name: string;
  unit: string;
  minQuantity: string;
};

type FormErrors = Partial<Record<keyof FormState | 'submit', string>>;

const initialFormState: FormState = {
  name: '',
  unit: '',
  minQuantity: '',
};

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
  const minQuantity = parseDecimalInput(form.minQuantity);

  if (name.length === 0) {
    errors.name = 'Informe o nome do item.';
  }

  if (unit.length === 0) {
    errors.unit = 'Informe a unidade de medida.';
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
    },
  };
}

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
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
  const [items, setItems] = useState<StockItemListRow[]>([]);
  const [createForm, setCreateForm] = useState<FormState>(initialFormState);
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  async function loadItems() {
    setIsLoading(true);

    try {
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
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      minQuantity: String(item.minQuantity),
    });
    setEditErrors({});
    setCreateErrors((prev) => ({ ...prev, submit: undefined }));
    setFeedbackMessage('');
  }

  function cancelEditing() {
    setEditingItemId(null);
    setEditForm(initialFormState);
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

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadItems();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.heroCard}>
              <Text style={styles.title}>Cadastro de Itens</Text>
              <Text style={styles.subtitle}>
                Cadastre itens com nome, unidade e quantidade minima. A quantidade atual sera informada apenas na
                vistoria diaria.
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

            <Text style={styles.listTitle}>Itens cadastrados</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item cadastrado ainda.</Text>
          )
        }
        renderItem={({ item }) => {
          const isEditing = editingItemId === item.id;

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
                  <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
                  <Text style={styles.itemMeta}>Minimo: {formatQuantity(item.minQuantity)}</Text>
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
                    <Pressable style={styles.cancelButton} onPress={cancelEditing} disabled={isUpdating}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.submitButton, styles.editSaveButton, isUpdating ? styles.submitButtonDisabled : undefined]}
                      onPress={() => {
                        void handleUpdate(item.id);
                      }}
                      disabled={isUpdating}
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
});
