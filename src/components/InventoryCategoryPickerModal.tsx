import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCategoryLabel } from '../constants/categories';
import { tokens } from '../theme/tokens';

type InventoryCategoryPickerModalProps = {
  visible: boolean;
  categories: string[];
  hasUncategorized: boolean;
  onClose: () => void;
  onConfirm: (allowed: Array<string | null>) => void;
  // Textos opcionais (padrao = inventario, usado na aba Estoque).
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
};

// `null` representa os itens "Sem categoria".
type CategoryOption = string | null;

function getOptionLabel(option: CategoryOption): string {
  return option === null ? 'Sem categoria' : getCategoryLabel(option);
}

export function InventoryCategoryPickerModal({
  visible,
  categories,
  hasUncategorized,
  onClose,
  onConfirm,
  title = 'Gerar Inventário',
  subtitle = 'Selecione as categorias que entram na contagem. O PDF terá somente as marcadas.',
  confirmLabel = 'Gerar inventário',
}: InventoryCategoryPickerModalProps) {
  const options = useMemo<CategoryOption[]>(
    () => [...categories, ...(hasUncategorized ? [null] : [])],
    [categories, hasUncategorized],
  );

  const [selected, setSelected] = useState<Set<CategoryOption>>(new Set());

  // Ao abrir (ou quando as opções mudam), marca todas por padrão.
  useEffect(() => {
    if (visible) {
      setSelected(new Set(options));
    }
  }, [visible, options]);

  const allSelected = options.length > 0 && options.every((option) => selected.has(option));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(options));
  }

  function toggleOption(option: CategoryOption) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(option)) {
        next.delete(option);
      } else {
        next.add(option);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (selected.size === 0) {
      return;
    }
    onConfirm(Array.from(selected));
  }

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Pressable style={[styles.row, styles.allRow]} onPress={toggleAll}>
            <View style={[styles.checkbox, allSelected ? styles.checkboxChecked : undefined]}>
              {allSelected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.allLabel}>Selecionar todas</Text>
          </Pressable>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {options.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma categoria disponível.</Text>
            ) : (
              options.map((option) => {
                const key = option ?? '__uncategorized__';
                const isChecked = selected.has(option);
                return (
                  <Pressable key={key} style={styles.row} onPress={() => toggleOption(option)}>
                    <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : undefined]}>
                      {isChecked ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.optionLabel}>{getOptionLabel(option)}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, selected.size === 0 ? styles.buttonDisabled : undefined]}
              disabled={selected.size === 0}
              onPress={handleConfirm}
            >
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
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
    gap: 10,
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
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  allRow: {
    backgroundColor: '#F9F3FD',
    borderColor: tokens.colors.borderStrong,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  allLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.accentDeep,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5EEFB',
    borderWidth: 1,
    borderColor: '#D8CCE3',
  },
  secondaryButtonText: {
    color: '#77158E',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: tokens.colors.accent,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
