import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  gerarMensagemAlertaEstoque,
  verificarProximidadeEstoqueMinimo,
  type StockProximityCandidate,
} from '../utils/stock-alerts';

/**
 * Notificação de proximidade do estoque mínimo.
 * Armazenada apenas em memória (contexto global de sessão).
 */
export interface StockNotification {
  itemId: number;
  name: string;
  currentStockQuantity: number;
  minQuantity: number;
  message: string;
  createdAt: number;
}

type NotificationsContextValue = {
  notifications: StockNotification[];
  count: number;
  /**
   * Sincroniza as notificações com a foto atual do estoque.
   * - Adiciona itens novos em proximidade (sem duplicar).
   * - Remove automaticamente itens que saíram da faixa (reabastecidos).
   * - Não recria notificações apagadas manualmente enquanto o item seguir em proximidade.
   * Retorna apenas as notificações recém-criadas (para disparar o pop-up).
   */
  syncStockNotifications: (items: StockProximityCandidate[]) => StockNotification[];
  removeNotification: (itemId: number) => void;
  clearAllNotifications: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function buildNotification(item: StockProximityCandidate): StockNotification {
  return {
    itemId: item.id,
    name: item.name,
    currentStockQuantity: item.currentStockQuantity ?? 0,
    minQuantity: item.minQuantity,
    message: gerarMensagemAlertaEstoque(item),
    createdAt: Date.now(),
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  // Espelhos via ref para leitura síncrona dentro de syncStockNotifications.
  const notificationsRef = useRef<StockNotification[]>([]);
  // Itens removidos manualmente que continuam em proximidade: não recriar até saírem da faixa.
  const dismissedItemIdsRef = useRef<Set<number>>(new Set());

  const commit = useCallback((next: StockNotification[]) => {
    notificationsRef.current = next;
    setNotifications(next);
  }, []);

  const syncStockNotifications = useCallback(
    (items: StockProximityCandidate[]): StockNotification[] => {
      const proximityItems = items.filter((item) => verificarProximidadeEstoqueMinimo(item));
      const proximityIds = new Set(proximityItems.map((item) => item.id));

      // Libera o bloqueio de itens que saíram da faixa (permite re-alertar se caírem de novo).
      for (const id of dismissedItemIdsRef.current) {
        if (!proximityIds.has(id)) {
          dismissedItemIdsRef.current.delete(id);
        }
      }

      // Mantém apenas notificações de itens ainda em proximidade (auto-remove reabastecidos).
      const kept = notificationsRef.current.filter((notification) =>
        proximityIds.has(notification.itemId),
      );
      const keptIds = new Set(kept.map((notification) => notification.itemId));

      // Cria notificações para itens novos (não presentes e não apagados manualmente).
      const novas = proximityItems
        .filter((item) => !keptIds.has(item.id) && !dismissedItemIdsRef.current.has(item.id))
        .map((item) => buildNotification(item));

      commit([...kept, ...novas]);

      return novas;
    },
    [commit],
  );

  const removeNotification = useCallback(
    (itemId: number) => {
      // Marca como apagada para não voltar ao recarregar enquanto seguir em proximidade.
      dismissedItemIdsRef.current.add(itemId);
      commit(notificationsRef.current.filter((notification) => notification.itemId !== itemId));
    },
    [commit],
  );

  const clearAllNotifications = useCallback(() => {
    for (const notification of notificationsRef.current) {
      dismissedItemIdsRef.current.add(notification.itemId);
    }
    commit([]);
  }, [commit]);

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      count: notifications.length,
      syncStockNotifications,
      removeNotification,
      clearAllNotifications,
    }),
    [notifications, syncStockNotifications, removeNotification, clearAllNotifications],
  );

  return (
    <NotificationsContext.Provider value={contextValue}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error('useNotifications precisa ser usado dentro de NotificationsProvider.');
  }

  return context;
}
