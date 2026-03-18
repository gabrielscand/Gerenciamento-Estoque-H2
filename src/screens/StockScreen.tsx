import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { getCategoryLabel } from '../constants/categories';
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import type { StockCurrentOverviewRow } from '../types/inventory';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function StockScreen() {
  const [items, setItems] = useState<StockCurrentOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isFocused = useIsFocused();

  async function loadStock(syncFirst: boolean = false) {
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockCurrentOverview();
      setItems(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar estoque atual.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadStock();
  }, [isFocused]);

  const summary = useMemo(() => {
    let initializedItems = 0;
    let needPurchaseItems = 0;
    let totalMissingQuantity = 0;

    for (const item of items) {
      if (item.currentStockQuantity !== null) {
        initializedItems += 1;
      }

      if (item.needsPurchase) {
        needPurchaseItems += 1;
        totalMissingQuantity += item.missingQuantity;
      }
    }

    return {
      totalItems: items.length,
      initializedItems,
      needPurchaseItems,
      totalMissingQuantity,
    };
  }, [items]);

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadStock(true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <View style={styles.heroCard}>
              <Text style={styles.title}>Estoque Atual</Text>
              <Text style={styles.description}>
                Veja o saldo consolidado de cada item. Quando o saldo atual ficar menor ou igual ao minimo, o item
                sera marcado para compra.
              </Text>
              <Text style={styles.summaryText}>
                Itens: {summary.totalItems} | Com saldo: {summary.initializedItems} | Comprar:{' '}
                {summary.needPurchaseItems} | Faltante total: {formatQuantity(summary.totalMissingQuantity)}
              </Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando estoque...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item cadastrado.</Text>
          )
        }
        renderItem={({ item }) => {
          const hasStock = item.currentStockQuantity !== null;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    !hasStock
                      ? styles.statusPending
                      : item.needsPurchase
                        ? styles.statusNeedPurchase
                        : styles.statusOk,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {!hasStock ? 'Sem estoque inicial' : item.needsPurchase ? 'Precisa comprar' : 'OK'}
                  </Text>
                </View>
              </View>

              <StockEmphasis
                label="Estoque atual"
                value={hasStock ? `${formatQuantity(item.currentStockQuantity as number)} ${item.unit}` : '-'}
                tone={!hasStock ? 'empty' : item.needsPurchase ? 'warning' : 'normal'}
                helperText={
                  !hasStock
                    ? 'Sem estoque inicial'
                    : item.needsPurchase
                      ? 'No minimo ou abaixo do minimo'
                      : undefined
                }
              />
              <Text style={styles.itemMeta}>Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}</Text>
              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>Minimo: {formatQuantity(item.minQuantity)}</Text>
              {item.needsPurchase && item.missingQuantity > 0 ? (
                <Pressable style={styles.purchaseHint}>
                  <Text style={styles.purchaseHintText}>
                    Comprar {formatQuantity(item.missingQuantity)} {item.unit}
                  </Text>
                </Pressable>
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
  description: {
    color: '#EDE9FE',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryText: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6D28D9',
    fontSize: 14,
    marginTop: 16,
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
    fontSize: 13,
    color: '#5B21B6',
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
    color: '#4C1D95',
    fontSize: 12,
    fontWeight: '700',
  },
  purchaseHint: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purchaseHintText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
});
