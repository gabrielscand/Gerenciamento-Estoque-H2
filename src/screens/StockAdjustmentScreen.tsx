import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listStockCurrentOverview, saveStockAdjustments } from '../database/items.repository';
import { useTopPopup } from '../components/TopPopupProvider';
import { tokens } from '../theme/tokens';
import type { StockAdjustmentInput, StockCurrentOverviewRow } from '../types/inventory';
import {
  convertToBaseUnits,
  formatOriginalAndBaseQuantity,
  isFardoConversionFactor,
  roundQuantity,
} from '../utils/unit-conversion';

type StockAdjustmentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type QuantityFormMap = Record<string, string>;
type QuantityModeMap = Record<string, 'fardo' | 'unidade'>;

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
    .replace(/[̀-ͯ]/g, '');
}

// Converte o valor digitado para a unidade do item (fardos). Item de fardo no
// campo "unidade": unidades / fator. Caso contrario: valor como esta.
function toItemUnitQuantity(
  item: { conversionFactor: number },
  typed: number,
  fieldMode: 'fardo' | 'unidade' | undefined,
): number {
  if (isFardoConversionFactor(item.conversionFactor) && fieldMode === 'unidade') {
    return roundQuantity(typed / item.conversionFactor);
  }

  return typed;
}

export function StockAdjustmentModal({ visible, onClose, onSaved }: StockAdjustmentModalProps) {
  const { showTopPopup } = useTopPopup();
  const [items, setItems] = useState<StockCurrentOverviewRow[]>([]);
  const [quantities, setQuantities] = useState<QuantityFormMap>({});
  const [quantityModes, setQuantityModes] = useState<QuantityModeMap>({});
  const [observation, setObservation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;

    async function load() {
      setIsLoading(true);
      try {
        const data = await listStockCurrentOverview();
        if (active) {
          setItems(data);
          setQuantities({});
          setQuantityModes({});
          setObservation('');
          setSearchQuery('');
        }
      } catch (error) {
        showTopPopup({
          type: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar itens para ajuste.',
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [visible]);

  function setFieldValue(itemId: number, value: string, fieldMode: 'fardo' | 'unidade') {
    const key = String(itemId);
    setQuantities((prev) => ({ ...prev, [key]: value }));
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

  async function handleSave() {
    const adjustments: StockAdjustmentInput[] = [];

    for (const item of items) {
      const typed = parseDecimalInput(quantities[String(item.id)] ?? '');

      if (typed === null) {
        continue;
      }

      const fieldMode = quantityModes[String(item.id)];
      const target = roundQuantity(toItemUnitQuantity(item, typed, fieldMode));

      if (!Number.isFinite(target) || target < 0) {
        continue;
      }

      const current = item.currentStockQuantity;

      // Ignora itens cujo novo valor e igual ao atual (nada a ajustar).
      if (current !== null && Math.abs(target - current) < 0.000001) {
        continue;
      }

      adjustments.push({ itemId: item.id, targetQuantity: target, previousQuantity: current });
    }

    if (adjustments.length === 0) {
      showTopPopup({
        type: 'warning',
        message: 'Preencha um novo valor (diferente do atual) em ao menos um item.',
        durationMs: 3600,
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveStockAdjustments(adjustments, observation);
      showTopPopup({
        type: 'success',
        message:
          adjustments.length === 1
            ? 'Ajuste de estoque salvo com sucesso.'
            : `${adjustments.length} ajustes de estoque salvos com sucesso.`,
        durationMs: 3000,
      });
      onSaved();
      onClose();
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível salvar o ajuste.',
        durationMs: 4200,
      });
    } finally {
      setIsSaving(false);
    }
  }

  const normalizedSearch = normalizeSearchValue(searchQuery);
  const visibleItems = normalizedSearch.length === 0
    ? items
    : items.filter((item) => normalizeSearchValue(item.name).includes(normalizedSearch));

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Ajuste de Estoque</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Defina o novo valor do estoque de cada item (sem registrar entrada/saída).
          </Text>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar item..."
            style={styles.searchInput}
          />

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={tokens.colors.accent} />
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {visibleItems.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum item encontrado.</Text>
              ) : (
                visibleItems.map((item) => {
                  const isFardo = isFardoConversionFactor(item.conversionFactor);
                  const fieldMode = quantityModes[String(item.id)];
                  const typed = parseDecimalInput(quantities[String(item.id)] ?? '');
                  const target = typed === null ? null : toItemUnitQuantity(item, typed, fieldMode);
                  const current = item.currentStockQuantity;

                  return (
                    <View key={String(item.id)} style={styles.itemCard}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        Atual:{' '}
                        {current === null
                          ? 'Sem estoque'
                          : formatOriginalAndBaseQuantity(
                              current,
                              item.unit,
                              item.conversionFactor,
                              formatQuantity,
                            )}
                      </Text>

                      <Text style={styles.inputLabel}>Novo valor</Text>

                      {isFardo ? (
                        <View style={styles.dualInputRow}>
                          <View style={styles.dualInputCol}>
                            <Text style={styles.dualInputLabel}>
                              Fardos (de {formatQuantity(item.conversionFactor)})
                            </Text>
                            <TextInput
                              value={
                                fieldMode === 'fardo'
                                  ? quantities[String(item.id)] ?? ''
                                  : target !== null
                                    ? formatQuantity(target)
                                    : ''
                              }
                              onChangeText={(value) => setFieldValue(item.id, value, 'fardo')}
                              editable={fieldMode !== 'unidade'}
                              placeholder="Ex.: 2"
                              keyboardType="decimal-pad"
                              style={[
                                styles.input,
                                fieldMode === 'unidade' ? styles.inputDisabled : undefined,
                              ]}
                            />
                          </View>
                          <View style={styles.dualInputCol}>
                            <Text style={styles.dualInputLabel}>Unidades</Text>
                            <TextInput
                              value={
                                fieldMode === 'unidade'
                                  ? quantities[String(item.id)] ?? ''
                                  : target !== null
                                    ? formatQuantity(convertToBaseUnits(target, item.conversionFactor) ?? 0)
                                    : ''
                              }
                              onChangeText={(value) => setFieldValue(item.id, value, 'unidade')}
                              editable={fieldMode !== 'fardo'}
                              placeholder={`Ex.: ${formatQuantity(item.conversionFactor)}`}
                              keyboardType="decimal-pad"
                              style={[
                                styles.input,
                                fieldMode === 'fardo' ? styles.inputDisabled : undefined,
                              ]}
                            />
                          </View>
                        </View>
                      ) : (
                        <TextInput
                          value={quantities[String(item.id)] ?? ''}
                          onChangeText={(value) => setFieldValue(item.id, value, 'unidade')}
                          placeholder="Novo valor"
                          keyboardType="decimal-pad"
                          style={styles.input}
                        />
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          <Text style={styles.inputLabel}>Observação (opcional)</Text>
          <TextInput
            value={observation}
            onChangeText={setObservation}
            placeholder="Motivo do ajuste (opcional)"
            multiline
            style={styles.observationInput}
          />

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose} disabled={isSaving}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, isSaving ? styles.buttonDisabled : undefined]}
              disabled={isSaving}
              onPress={() => {
                void handleSave();
              }}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Salvar ajustes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 4, 28, 0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 16,
    maxHeight: '90%',
    gap: 8,
    ...tokens.shadow.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  closeButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F5EEFB',
    borderWidth: 1,
    borderColor: '#D8CCE3',
  },
  closeButtonText: {
    color: '#77158E',
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F9F3FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: tokens.colors.accentDeep,
    fontSize: 15,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    gap: 10,
    paddingVertical: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 16,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  itemMeta: {
    fontSize: 13,
    color: '#77158E',
    fontWeight: '600',
  },
  inputLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#77158E',
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F9F3FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.colors.accentDeep,
    fontSize: 16,
    fontWeight: '700',
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
  observationInput: {
    minHeight: 60,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F9F3FD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.colors.accentDeep,
    fontSize: 15,
    fontWeight: '600',
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B690D2',
    backgroundColor: '#F5EEFB',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#77158E',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#8C24A8',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
