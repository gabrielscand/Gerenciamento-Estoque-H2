/**
 * Alerta de proximidade do estoque mínimo.
 *
 * Regra: um item entra em "proximidade" quando ainda está ACIMA do estoque
 * mínimo, porém dentro de uma margem de 20% acima dele. Itens no mínimo ou
 * abaixo são tratados como crítico/abaixo do mínimo por outra lógica
 * (needsPurchase) e NÃO entram aqui.
 */

/** Margem de tolerância acima do estoque mínimo (20%). */
const PROXIMITY_MARGIN = 0.2;

export interface StockProximityCandidate {
  id: number;
  name: string;
  currentStockQuantity: number | null;
  minQuantity: number;
}

/** Formata quantidades no padrão pt-BR usado nas telas de estoque. */
function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Limite máximo de estoque para gerar o alerta de proximidade.
 * limiteDeAlerta = estoqueMinimo + (estoqueMinimo * 0.20) = estoqueMinimo * 1.2
 */
export function calcularLimiteAlerta(estoqueMinimo: number): number {
  return estoqueMinimo + estoqueMinimo * PROXIMITY_MARGIN;
}

/**
 * Indica se o item está chegando perto do estoque mínimo.
 *
 * Condições (todas obrigatórias):
 *  - estoqueMinimo > 0
 *  - quantidadeAtual > 0
 *  - quantidadeAtual > estoqueMinimo  (senão é crítico/abaixo do mínimo)
 *  - quantidadeAtual <= limiteDeAlerta (dentro da margem de 20%)
 */
export function verificarProximidadeEstoqueMinimo(item: StockProximityCandidate): boolean {
  const { currentStockQuantity, minQuantity } = item;

  if (currentStockQuantity === null) {
    return false;
  }

  if (!(minQuantity > 0)) {
    return false;
  }

  if (!(currentStockQuantity > 0)) {
    return false;
  }

  if (!(currentStockQuantity > minQuantity)) {
    return false;
  }

  return currentStockQuantity <= calcularLimiteAlerta(minQuantity);
}

/**
 * Mensagem individual de alerta para um item.
 * Ex.: "Item Papel Sulfite está chegando próximo do estoque mínimo.
 *       Quantidade atual: 120. Estoque mínimo: 100."
 */
export function gerarMensagemAlertaEstoque(item: StockProximityCandidate): string {
  const atual = item.currentStockQuantity ?? 0;

  return (
    `Item ${item.name} está chegando próximo do estoque mínimo. ` +
    `Quantidade atual: ${formatQuantity(atual)}. ` +
    `Estoque mínimo: ${formatQuantity(item.minQuantity)}.`
  );
}

/**
 * Mensagem para o pop-up agrupado.
 *  - 1 item  → mensagem individual completa.
 *  - vários  → cabeçalho + lista resumida (um item por linha).
 */
export function gerarMensagemAlertaEstoqueAgrupada(itens: StockProximityCandidate[]): string {
  if (itens.length === 0) {
    return '';
  }

  if (itens.length === 1) {
    return gerarMensagemAlertaEstoque(itens[0]);
  }

  const linhas = itens
    .map((item) => {
      const atual = item.currentStockQuantity ?? 0;
      return `• ${item.name} (atual ${formatQuantity(atual)} / mín ${formatQuantity(item.minQuantity)})`;
    })
    .join('\n');

  return `${itens.length} itens estão chegando próximos do estoque mínimo:\n${linhas}`;
}
