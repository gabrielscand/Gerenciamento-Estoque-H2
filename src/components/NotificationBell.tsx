import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../theme/tokens';
import { useNotifications } from './NotificationsProvider';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function NotificationBell() {
  const { notifications, count, removeNotification, clearAllNotifications } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const badgeLabel = count > 99 ? '99+' : String(count);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.bellButton, pressed ? styles.bellButtonPressed : undefined]}
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Notificações${count > 0 ? `, ${count} pendentes` : ''}`}
      >
        <Ionicons name="notifications-outline" size={16} color={tokens.colors.accentStrong} />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          {/* Painel aninhado: toques aqui são capturados por este Pressable e
              não acionam o backdrop, então o painel não fecha ao tocar dentro. */}
          <Pressable style={styles.panel} onPress={() => undefined}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notificações</Text>
              {count > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.clearAllButton,
                    pressed ? styles.clearAllButtonPressed : undefined,
                  ]}
                  onPress={clearAllNotifications}
                >
                  <Text style={styles.clearAllText}>Limpar todas</Text>
                </Pressable>
              ) : null}
            </View>

            {count === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="notifications-off-outline"
                  size={26}
                  color={tokens.colors.textMuted}
                />
                <Text style={styles.emptyText}>Nenhuma notificação no momento.</Text>
              </View>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {notifications.map((notification) => (
                  <View key={notification.itemId} style={styles.notificationCard}>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationName}>{notification.name}</Text>
                      <Text style={styles.notificationMeta}>
                        Atual: {formatQuantity(notification.currentStockQuantity)} • Mínimo:{' '}
                        {formatQuantity(notification.minQuantity)}
                      </Text>
                      <Text style={styles.notificationMessage}>{notification.message}</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed ? styles.removeButtonPressed : undefined,
                      ]}
                      onPress={() => removeNotification(notification.itemId)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover notificação de ${notification.name}`}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={18} color={tokens.colors.accentDeep} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellButtonPressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: tokens.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.surface,
  },
  badgeText: {
    color: tokens.colors.white,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: tokens.colors.overlay,
    paddingTop: 84,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...tokens.shadow.card,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  clearAllButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearAllButtonPressed: {
    opacity: 0.8,
  },
  clearAllText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 22,
  },
  emptyText: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: {
    flexGrow: 0,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: tokens.colors.warningSoft,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: '#F3D38A',
    padding: 10,
    marginBottom: 8,
  },
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  notificationName: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  notificationMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.warning,
  },
  notificationMessage: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    lineHeight: 16,
  },
  removeButton: {
    borderRadius: tokens.radius.pill,
    padding: 4,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
  },
  removeButtonPressed: {
    opacity: 0.7,
  },
});
