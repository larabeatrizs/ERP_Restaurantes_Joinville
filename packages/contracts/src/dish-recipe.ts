import { isRecord } from './index.ts';
import { hasExactFields, isStockDecimal, isStockId, isText } from './stock.ts';

export const dishTypes = {
  ARROZ: 'Arroz', FEIJAO: 'Feijão', PROTEINA: 'Proteína', GUARNICAO: 'Guarnição', SALADA: 'Salada',
  SOBREMESA_FRUTA: 'Sobremesa ou fruta', BEBIDA: 'Bebida', PANIFICACAO: 'Panificação',
  ACOMPANHAMENTO: 'Acompanhamento', FRUTA: 'Fruta', BOLO_DOCE: 'Bolo ou doce',
} as const;
export type DishType = keyof typeof dishTypes;
export interface DishSearchQuery { q: string; tipo?: DishType; antes?: string }
export interface DishSearchPage {
  pratos: Pick<DishRecipe, 'id' | 'descricao' | 'tipo_prato' | 'status' | 'numero' | 'rendimento_porcoes'>[];
  proximo: string | null;
}
export interface DishIngredientOption {
  id: string; descricao: string; complemento: string; unidade: string; fator_correcao: string; custo_indireto: boolean;
}
export interface DishIngredientInput {
  produto_id: string; quantidade_receita: string; custo_indireto: boolean; fator_correcao?: string; observacao?: string;
}
export interface DishRecipeInput {
  descricao: string; tipo_prato: DishType; rendimento_porcoes: number; chave: string; itens: DishIngredientInput[];
  peso_porcao_g?: string; unidade_porcao?: string; porcoes_por_unidade_compra?: string; modo_preparo?: string; kcal_porcao?: string;
}
export interface DishRecipe {
  id: string; descricao: string; tipo_prato: DishType; status: 'ATIVO' | 'INATIVO';
  versao_id: string; numero: number; rendimento_porcoes: number;
  peso_porcao_g: string | null; unidade_porcao: string | null; porcoes_por_unidade_compra: string | null;
  modo_preparo: string | null; kcal_porcao: string | null;
  itens: (Omit<DishIngredientInput, 'fator_correcao' | 'observacao'> & {
    produto: string; unidade: string; quantidade_porcao: string; fator_correcao: string; observacao: string | null;
  })[];
}

const required = ['descricao', 'tipo_prato', 'rendimento_porcoes'];
const extras = ['peso_porcao_g', 'unidade_porcao', 'porcoes_por_unidade_compra', 'modo_preparo', 'kcal_porcao'];
const itemFields = ['produto_id', 'quantidade_receita', 'custo_indireto'];
const positive = (value: unknown) => isStockDecimal(value, { positive: true });
const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
function header(value: Record<string, unknown>) {
  return isText(value.descricao, 200) && typeof value.tipo_prato === 'string' && Object.hasOwn(dishTypes, value.tipo_prato)
    && integer(value.rendimento_porcoes);
}
function optional(value: Record<string, unknown>, absent: unknown) {
  const skip = (name: string) => value[name] === absent;
  return (skip('peso_porcao_g') || positive(value.peso_porcao_g))
    && (skip('unidade_porcao') || isText(value.unidade_porcao, 100))
    && (skip('porcoes_por_unidade_compra') || positive(value.porcoes_por_unidade_compra))
    && (skip('modo_preparo') || isText(value.modo_preparo, 10000))
    && (skip('kcal_porcao') || isStockDecimal(value.kcal_porcao));
}
function ingredient(value: Record<string, unknown>) {
  return isStockId(value.produto_id) && positive(value.quantidade_receita) && typeof value.custo_indireto === 'boolean';
}
export function isDishRecipeInput(value: unknown): value is DishRecipeInput {
  return isRecord(value) && hasExactFields(value, [...required, 'chave', 'itens'], extras) && header(value) && optional(value, undefined)
    && typeof value.chave === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.chave)
    && Array.isArray(value.itens) && value.itens.length >= 1 && value.itens.length <= 100
    && value.itens.every(row => isRecord(row) && hasExactFields(row, itemFields, ['fator_correcao', 'observacao'])
      && ingredient(row) && (row.fator_correcao === undefined || positive(row.fator_correcao))
      && (row.observacao === undefined || isText(row.observacao, 2000)))
    && new Set(value.itens.map(row => row.produto_id)).size === value.itens.length;
}
export function isDishRecipe(value: unknown): value is DishRecipe {
  return isRecord(value) && hasExactFields(value, [...required, ...extras, 'id', 'versao_id', 'numero', 'status', 'itens'])
    && header(value) && optional(value, null) && isStockId(value.id) && isStockId(value.versao_id) && integer(value.numero)
    && (value.status === 'ATIVO' || value.status === 'INATIVO')
    && Array.isArray(value.itens) && value.itens.length <= 100
    && value.itens.every(row => isRecord(row) && hasExactFields(row, [...itemFields, 'produto', 'unidade', 'quantidade_porcao', 'fator_correcao', 'observacao'])
      && ingredient(row) && isText(row.produto, 200) && isText(row.unidade, 100) && positive(row.fator_correcao)
      && isStockDecimal(row.quantidade_porcao, { calculated: true }) && (row.observacao === null || isText(row.observacao, 2000, true)));
}
export function isDishIngredients(value: unknown): value is { insumos: DishIngredientOption[] } {
  return isRecord(value) && hasExactFields(value, ['insumos']) && Array.isArray(value.insumos) && value.insumos.length <= 25
    && value.insumos.every(row => isRecord(row) && hasExactFields(row, ['id', 'descricao', 'complemento', 'unidade', 'fator_correcao', 'custo_indireto'])
      && isStockId(row.id) && isText(row.descricao, 200) && isText(row.complemento, 200, true) && isText(row.unidade, 100)
      && positive(row.fator_correcao) && typeof row.custo_indireto === 'boolean');
}

export function isDishSearchQuery(value: unknown): value is DishSearchQuery {
  return isRecord(value) && hasExactFields(value, ['q'], ['tipo', 'antes']) && isText(value.q, 200, true)
    && (!Object.hasOwn(value, 'tipo') || (typeof value.tipo === 'string' && Object.hasOwn(dishTypes, value.tipo)))
    && (!Object.hasOwn(value, 'antes') || isStockId(value.antes));
}

export function isDishSearchPage(value: unknown, query: DishSearchQuery): value is DishSearchPage {
  if (!isRecord(value) || !hasExactFields(value, ['pratos', 'proximo']) || !Array.isArray(value.pratos) || value.pratos.length > 25) return false;
  let last = query.antes;
  for (const row of value.pratos) {
    if (!isRecord(row) || !hasExactFields(row, [...required, 'id', 'status', 'numero']) || !header(row)
      || !integer(row.numero) || !isStockId(row.id) || (last && BigInt(row.id) >= BigInt(last))
      || (row.status !== 'ATIVO' && row.status !== 'INATIVO') || (query.tipo && row.tipo_prato !== query.tipo)) return false;
    last = row.id;
  }
  return value.proximo === null || (value.pratos.length === 25 && value.proximo === last);
}
