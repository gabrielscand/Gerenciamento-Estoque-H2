import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { getCategoryLabel } from '../constants/categories';
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import { HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
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
  const isFocused = useIsFocused();
  const { showTopPopup } = useTopPopup();

  async function loadStock(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockCurrentOverview();
      setItems(data);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar estoque atual.',
      });
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
    <ScreenShell>
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

            <MotionEntrance delay={80}>
              <HeroHeader
                title="Estoque Atual"
                subtitle="Saldo consolidado"
                description="Acompanhe rapidamente os itens no limite minimo e o faltante para compra."
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Itens" value={String(summary.totalItems)} />
                  <KpiTile label="Com saldo" value={String(summary.initializedItems)} />
                  <KpiTile label="Comprar" value={String(summary.needPurchaseItems)} />
                  <KpiTile label="Faltante" value={formatQuantity(summary.totalMissingQuantity)} />
                </View>
              </HeroHeader>
            </MotionEntrance>
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    display: 'none',
  },
  title: {
    color: '#F5EEFB',
    fontSize: 24,
    fontWeight: '800',
  },
  description: {
    color: '#EDE0F9',
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
    color: '#B02323',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontSize: 14,
    marginTop: 16,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    ...tokens.shadow.card,
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
    fontWeight: '800',
    color: tokens.colors.accentDeep,
  },
  itemMeta: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: '#E8DAF3',
  },
  statusNeedPurchase: {
    backgroundColor: '#FCE8E8',
  },
  statusOk: {
    backgroundColor: '#E8F6EE',
  },
  statusText: {
    color: tokens.colors.accentDeep,
    fontSize: 12,
    fontWeight: '700',
  },
  purchaseHint: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.dangerSoft,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F5B9B9',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purchaseHintText: {
    color: tokens.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
