import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getSyncStateSnapshot,
  refreshSyncStateFromDatabase,
  subscribeToSyncState,
  syncAppData,
} from '../database/sync.service';

function formatSyncDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SyncStatusCard() {
  const syncState = useSyncExternalStore(
    subscribeToSyncState,
    getSyncStateSnapshot,
    getSyncStateSnapshot,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void refreshSyncStateFromDatabase();
  }, []);

  async function handleManualSync() {
    setIsRefreshing(true);

    try {
      await syncAppData();
      await refreshSyncStateFromDatabase();
    } finally {
      setIsRefreshing(false);
    }
  }

  let toneStyle = styles.infoCard;
  let title = 'Supabase nao configurado';
  let description = 'Os dados estao sendo salvos apenas neste aparelho.';
  let buttonLabel = '';

  if (!syncState.configured) {
    toneStyle = styles.warningCard;
  } else if (syncState.isSyncing) {
    title = 'Sincronizando com a nuvem';
    description = syncState.lastSyncStartedAt
      ? `Inicio: ${formatSyncDateTime(syncState.lastSyncStartedAt)}`
      : 'Atualizando itens e vistorias no Supabase.';
    buttonLabel = 'Sincronizando...';
  } else if (syncState.lastSyncError) {
    toneStyle = styles.errorCard;
    title = 'Falha na sincronizacao';
    description = syncState.lastSyncCompletedAt
      ? `${syncState.lastSyncError} Ultimo sync OK: ${formatSyncDateTime(syncState.lastSyncCompletedAt)}`
      : syncState.lastSyncError;
    buttonLabel = 'Tentar novamente';
  } else if (syncState.lastSyncCompletedAt) {
    toneStyle = styles.successCard;
    title = 'Sincronizado com sucesso';
    description = `Ultima sincronizacao: ${formatSyncDateTime(syncState.lastSyncCompletedAt)}`;
    buttonLabel = 'Sincronizar agora';
  } else {
    title = 'Supabase conectado';
    description = 'O aparelho ainda nao concluiu a primeira sincronizacao.';
    buttonLabel = 'Sincronizar agora';
  }

  return (
    <View style={[styles.card, toneStyle]}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      {syncState.configured ? (
        <Pressable
          style={[
            styles.actionButton,
            syncState.isSyncing || isRefreshing ? styles.actionButtonDisabled : undefined,
          ]}
          onPress={() => {
            void handleManualSync();
          }}
          disabled={syncState.isSyncing || isRefreshing}
        >
          {syncState.isSyncing || isRefreshing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.actionButtonText}>{buttonLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  textBlock: {
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#312E81',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4338CA',
  },
  infoCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  successCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  warningCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  actionButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
