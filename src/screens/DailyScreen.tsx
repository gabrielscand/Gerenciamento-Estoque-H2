import { useEffect, useMemo, useState } from 'react';
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
import { listDailyInspectionItems, saveDailyInspection } from '../database/items.repository';
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

export function DailyScreen() {
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDateString());
  const [selectedDateError, setSelectedDateError] = useState('');
  const [items, setItems] = useState<DailyInspectionItem[]>([]);
  const [quantities, setQuantities] = useState<QuantityFormMap>({});
  const [fieldErrors, setFieldErrors] = useState<QuantityErrorMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadInspectionItems(date: string) {
    setIsLoading(true);
    setSubmitError('');
    setSuccessMessage('');

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

  const summary = useMemo(() => {
    let needPurchase = 0;
    let okCount = 0;
    let totalMissingQuantity = 0;

    for (const item of items) {
      const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
      if (parsed === null) {
        continue;
      }

      if (parsed < item.minQuantity) {
        needPurchase += 1;
        totalMissingQuantity += item.minQuantity - parsed;
      } else {
        okCount += 1;
      }
    }

    return { needPurchase, okCount, countedItems: needPurchase + okCount, totalMissingQuantity };
  }, [items, quantities]);

  function setInspectionDate(value: string) {
    setSelectedDate(value.trim());
    setSelectedDateError('');
    setSubmitError('');
    setSuccessMessage('');
  }

  function setQuantity(itemId: number, value: string) {
    setQuantities((prev) => ({ ...prev, [String(itemId)]: value }));
    setFieldErrors((prev) => ({ ...prev, [String(itemId)]: '' }));
    setSubmitError('');
    setSuccessMessage('');
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

    for (const item of items) {
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

      updates.push({ itemId: item.id, quantity: parsed });
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (updates.length === 0) {
      setSubmitError('Preencha ao menos um item para salvar a vistoria.');
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
      setSuccessMessage(`Vistoria de ${formatDateLabel(selectedDate)} salva com sucesso.`);
      await loadInspectionItems(selectedDate);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nao foi possivel salvar a vistoria.');
    } finally {
      setIsSaving(false);
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
              void loadInspectionItems(selectedDate);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.heroCard}>
              <Text style={styles.title}>Vistoria Diaria</Text>
              <Text style={styles.subtitle}>Data selecionada: {formatDateLabel(selectedDate)}</Text>
              <Text style={styles.description}>
                Preencha a quantidade atual de cada item para comparar com o minimo necessario.
              </Text>
              <Text style={styles.summaryText}>
                {summary.countedItems} contados | {summary.okCount} OK | {summary.needPurchase} comprar | Falta total:{' '}
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

            {items.length > 0 ? (
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
                  <Text style={styles.submitButtonText}>Salvar vistoria do dia</Text>
                )}
              </Pressable>
            ) : null}

            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

            <Text style={styles.listTitle}>Itens para contagem</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando itens...</Text>
          ) : (
            <Text style={styles.emptyText}>
              Nenhum item cadastrado. Cadastre itens na aba Itens para iniciar a vistoria.
            </Text>
          )
        }
        renderItem={({ item }) => {
          const parsed = parseDecimalInput(quantities[String(item.id)] ?? '');
          const needsPurchase = parsed !== null && parsed < item.minQuantity;
          const hasValue = parsed !== null;
          const missingQuantity = needsPurchase && parsed !== null ? item.minQuantity - parsed : 0;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    !hasValue
                      ? styles.statusPending
                      : needsPurchase
                        ? styles.statusNeedPurchase
                        : styles.statusOk,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {!hasValue
                      ? 'Sem contagem'
                      : needsPurchase
                        ? `Comprar ${formatQuantity(missingQuantity)} ${item.unit}`
                        : 'OK'}
                  </Text>
                </View>
              </View>

              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>Minimo necessario: {formatQuantity(item.minQuantity)}</Text>

              <TextInput
                value={quantities[String(item.id)] ?? ''}
                onChangeText={(value) => setQuantity(item.id, value)}
                placeholder="Quantidade atual"
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
  successText: {
    backgroundColor: '#EDE9FE',
    color: '#5B21B6',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
});
