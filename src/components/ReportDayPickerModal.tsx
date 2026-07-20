import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

type ReportDayPickerModalProps = {
  visible: boolean;
  monthLabel: string;
  availableDays: string[];
  onClose: () => void;
  // null = mes inteiro; caso contrario, o dia (YYYY-MM-DD) escolhido.
  onConfirm: (day: string | null) => void;
};

function formatDay(date: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) {
    return date;
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function ReportDayPickerModal({
  visible,
  monthLabel,
  availableDays,
  onClose,
  onConfirm,
}: ReportDayPickerModalProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Gerar Relatório</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Escolha o dia do relatório de movimentação (entradas e saídas).
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Pressable style={[styles.row, styles.rowAll]} onPress={() => onConfirm(null)}>
              <Text style={styles.rowAllText}>Mês inteiro ({monthLabel})</Text>
            </Pressable>

            {availableDays.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum dia com movimentação neste mês.</Text>
            ) : (
              availableDays.map((day) => (
                <Pressable key={day} style={styles.row} onPress={() => onConfirm(day)}>
                  <Text style={styles.rowText}>{formatDay(day)}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
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
    maxHeight: 380,
  },
  listContent: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
  },
  rowAll: {
    backgroundColor: '#F9F3FD',
    borderColor: tokens.colors.borderStrong,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colors.accentDeep,
  },
  rowAllText: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 16,
  },
});
