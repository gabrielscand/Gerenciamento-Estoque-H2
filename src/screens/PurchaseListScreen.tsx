import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { getCategoryLabel } from '../constants/categories';
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { useTopPopup } from '../components/TopPopupProvider';
import { AppButton, HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type { StockCurrentOverviewRow } from '../types/inventory';
import { generatePurchaseReportPdf } from '../utils/purchase-report';
import { formatOriginalAndBaseQuantity } from '../utils/unit-conversion';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function PurchaseListScreen() {
  const [items, setItems] = useState<StockCurrentOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const isFocused = useIsFocused();
  const { showTopPopup } = useTopPopup();

  async function loadPurchaseList(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listStockCurrentOverview();
      const purchaseItems = data
        .filter((item) => item.needsPurchase)
        .sort(
          (left, right) =>
            right.missingQuantityInBaseUnits - left.missingQuantityInBaseUnits ||
            left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
        );

      setItems(purchaseItems);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao carregar lista de compras.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadPurchaseList();
  }, [isFocused]);

  const summary = useMemo(() => {
    let totalMissingQuantityInBaseUnits = 0;
    let belowMinimumItems = 0;
    let atMinimumItems = 0;

    for (const item of items) {
      totalMissingQuantityInBaseUnits += item.missingQuantityInBaseUnits;

      if (item.missingQuantity > 0) {
        belowMinimumItems += 1;
      } else {
        atMinimumItems += 1;
      }
    }

    return {
      totalItemsToBuy: items.length,
      belowMinimumItems,
      atMinimumItems,
      totalMissingQuantityInBaseUnits,
    };
  }, [items]);

  async function handleGenerateReport() {
    if (isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);

    try {
      const result = await generatePurchaseReportPdf();

      showTopPopup({
        type: 'success',
        message:
          Platform.OS === 'web'
            ? 'Relatorio de compras enviado para visualizacao/impressao.'
            : result.totalItems === 0
              ? 'Relatorio de compras gerado sem itens para compra.'
              : result.shared
                ? 'Relatorio de compras gerado e pronto para compartilhar.'
                : 'Relatorio de compras gerado com sucesso.',
        durationMs: 3600,
      });
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar relatorio de compras.',
        durationMs: 4200,
      });
    } finally {
      setIsGeneratingReport(false);
    }
  }

  return (
    <ScreenShell>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadPurchaseList(true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title="Lista de Compras"
                subtitle="Reposicao de estoque"
                description="Itens abaixo ou no limite minimo para reposicao priorizada."
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Comprar" value={String(summary.totalItemsToBuy)} />
                  <KpiTile label="Abaixo" value={String(summary.belowMinimumItems)} />
                  <KpiTile label="No minimo" value={String(summary.atMinimumItems)} />
                  <KpiTile
                    label="Faltante (und)"
                    value={formatQuantity(summary.totalMissingQuantityInBaseUnits)}
                  />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.reportButtonWrap}>
              <AppButton
                label={isGeneratingReport ? 'Gerando relatorio...' : 'Gerar Relatorio'}
                onPress={() => {
                  void handleGenerateReport();
                }}
                disabled={isGeneratingReport}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando lista de compras...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item abaixo ou no limite minimo.</Text>
          )
        }
        renderItem={({ item }) => {
          const hasStock = item.currentStockQuantity !== null;
          const isBelowMinimum = item.missingQuantity > 0;

          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    isBelowMinimum ? styles.statusNeedPurchase : styles.statusAtMinimum,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {isBelowMinimum ? 'Abaixo do minimo' : 'No minimo'}
                  </Text>
                </View>
              </View>

              <StockEmphasis
                label="Faltante para compra"
                value={formatOriginalAndBaseQuantity(
                  item.missingQuantity,
                  item.unit,
                  item.conversionFactor,
                  formatQuantity,
                )}
                tone={isBelowMinimum ? 'warning' : 'normal'}
                helperText={isBelowMinimum ? 'Priorize reposicao deste item' : 'Reposicao preventiva sugerida'}
              />

              <Text style={styles.itemMeta}>
                Categoria: {item.category ? getCategoryLabel(item.category) : 'Sem categoria'}
              </Text>
              <Text style={styles.itemMeta}>Unidade: {item.unit}</Text>
              <Text style={styles.itemMeta}>
                Estoque atual:{' '}
                {hasStock
                  ? formatOriginalAndBaseQuantity(
                      item.currentStockQuantity as number,
                      item.unit,
                      item.conversionFactor,
                      formatQuantity,
                    )
                  : '-'}
              </Text>
              <Text style={styles.itemMeta}>
                Minimo:{' '}
                {formatOriginalAndBaseQuantity(
                  item.minQuantity,
                  item.unit,
                  item.conversionFactor,
                  formatQuantity,
                )}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 6,
  },
  heroKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reportButtonWrap: {
    marginTop: 2,
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
  statusNeedPurchase: {
    backgroundColor: '#FCE8E8',
  },
  statusAtMinimum: {
    backgroundColor: '#FDEFD9',
  },
  statusText: {
    color: tokens.colors.accentDeep,
    fontSize: 12,
    fontWeight: '700',
  },
});
