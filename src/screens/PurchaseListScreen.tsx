import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { getCategoryLabel } from '../constants/categories';
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { StockEmphasis } from '../components/StockEmphasis';
import { InventoryCategoryPickerModal } from '../components/InventoryCategoryPickerModal';
import { useTopPopup } from '../components/TopPopupProvider';
import { AppButton, HeroHeader, KpiTile, MotionEntrance, ScreenShell } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type { StockCurrentOverviewRow } from '../types/inventory';
import { generatePurchaseReportPdf } from '../utils/purchase-report';
import {
  formatOriginalAndBaseQuantity,
  isFardoConversionFactor,
  purchaseQuantityForBuy,
} from '../utils/unit-conversion';

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// "Faltante para compra": para itens de fardo, arredonda os fardos para cima
// (não se compra fração de fardo), mantendo as unidades como o faltante real.
function formatPurchaseQuantity(item: StockCurrentOverviewRow): string {
  if (!isFardoConversionFactor(item.conversionFactor)) {
    return formatOriginalAndBaseQuantity(
      item.missingQuantity,
      item.unit,
      item.conversionFactor,
      formatQuantity,
    );
  }

  const buyQty = purchaseQuantityForBuy(item.missingQuantity, item.conversionFactor);
  const baseText = `${formatQuantity(item.missingQuantityInBaseUnits)} und`;
  const safeUnit = (item.unit ?? '').trim();

  return safeUnit
    ? `${formatQuantity(buyQty)} ${safeUnit} (${baseText})`
    : `${formatQuantity(buyQty)} (${baseText})`;
}

export function PurchaseListScreen() {
  const [items, setItems] = useState<StockCurrentOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
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

  // Categorias presentes entre os itens que precisam de compra.
  const availableCategories = useMemo(() => {
    const unique = new Set<string>();
    for (const item of items) {
      if (item.category) {
        unique.add(item.category);
      }
    }
    return Array.from(unique).sort((left, right) =>
      left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [items]);

  async function handleGenerateReport(allowedCategories: Array<string | null>) {
    if (isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);

    try {
      const result = await generatePurchaseReportPdf(allowedCategories);

      showTopPopup({
        type: 'success',
        message:
          Platform.OS === 'web'
            ? 'Relatório de compras enviado para visualização/impressão.'
            : result.totalItems === 0
              ? 'Relatório de compras gerado sem itens para compra.'
              : result.shared
                ? 'Relatório de compras gerado e pronto para compartilhar.'
                : 'Relatório de compras gerado com sucesso.',
        durationMs: 3600,
      });
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar relatório de compras.',
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
                subtitle="Reposição de estoque"
                description="Itens abaixo ou no limite mínimo para reposição priorizada."
              >
                <View style={styles.heroKpis}>
                  <KpiTile label="Comprar" value={String(summary.totalItemsToBuy)} />
                  <KpiTile label="Abaixo" value={String(summary.belowMinimumItems)} />
                  <KpiTile label="No mínimo" value={String(summary.atMinimumItems)} />
                  <KpiTile
                    label="Faltante (und)"
                    value={formatQuantity(summary.totalMissingQuantityInBaseUnits)}
                  />
                </View>
              </HeroHeader>
            </MotionEntrance>

            <View style={styles.reportButtonWrap}>
              <AppButton
                label={isGeneratingReport ? 'Gerando relatório...' : 'Gerar Relatório'}
                onPress={() => setIsCategoryPickerOpen(true)}
                disabled={isGeneratingReport}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando lista de compras...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum item abaixo ou no limite mínimo.</Text>
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
                    {isBelowMinimum ? 'Abaixo do mínimo' : 'No mínimo'}
                  </Text>
                </View>
              </View>

              <StockEmphasis
                label="Faltante para compra"
                value={formatPurchaseQuantity(item)}
                tone={isBelowMinimum ? 'warning' : 'normal'}
                helperText={isBelowMinimum ? 'Priorize reposição deste item' : 'Reposição preventiva sugerida'}
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
                Mínimo:{' '}
                {formatOriginalAndBaseQuantity(
                  item.minQuantity,
                  item.unit,
                  item.conversionFactor,
                  formatQuantity,
                )}
              </Text>
              <Text style={styles.itemMeta}>
                Máximo:{' '}
                {item.maxQuantity === null
                  ? '—'
                  : formatOriginalAndBaseQuantity(
                      item.maxQuantity,
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

      <InventoryCategoryPickerModal
        visible={isCategoryPickerOpen}
        categories={availableCategories}
        hasUncategorized={items.some((item) => !item.category)}
        title="Gerar Relatório"
        subtitle="Selecione as categorias. O PDF terá somente as marcadas."
        confirmLabel="Gerar relatório"
        onClose={() => setIsCategoryPickerOpen(false)}
        onConfirm={(allowed) => {
          setIsCategoryPickerOpen(false);
          void handleGenerateReport(allowed);
        }}
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
