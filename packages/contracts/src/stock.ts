import { isPositiveBigint, isRecord } from './index.ts';

export type StorageType = 'SECO' | 'RESFRIADO' | 'CONGELADO';
export type ActiveStatus = 'ATIVO' | 'INATIVO';
export interface ProdutoInput {
  descricao: string; complemento: string; unidade_medida_id: string; categoria_id: string;
  perecivel: boolean; armazenamento: StorageType; fator_correcao: string;
  apresentacao_compra: string; quantidade_apresentacao: string; estoque_minimo: string;
  estoque_maximo: string | null; ponto_reposicao: string | null; status: ActiveStatus;
}
export interface Product extends ProdutoInput {
  id: string; revisao: string; unidade_sigla: string; categoria_descricao: string;
}
export interface EntradaItemInput {
  produto_id: string; quantidade: string; valor_unitario: string; numero_lote: string | null;
  validade: string | null; camara_id: string; temperatura: string | null;
  aspecto_embalagem: string; conformidade: 'CONFORME' | 'RESSALVA' | 'RECUSADO'; motivo: string;
}
export interface EntradaInput {
  data_entrada: string; fornecedor_id: string; numero_nf: string; total_nota: string | null;
  observacoes: string; itens: EntradaItemInput[];
}
export interface ReceiptItem extends EntradaItemInput {
  id: string; produto: string; unidade_medida: string; local: string;
}
export interface Receipt extends Omit<EntradaInput, 'itens'> {
  id: string; unidade_id: string; fornecedor: string; total_itens: string;
  estado: 'RASCUNHO' | 'CONFIRMADA' | 'ESTORNADA'; divergencia_aprovada: boolean; itens: ReceiptItem[];
}
export interface StockContext {
  medidas: { id: string; sigla: string; descricao: string }[];
  categorias: { id: string; descricao: string; armazenamento_padrao: StorageType }[];
  fornecedores: { id: string; razao_social: string }[];
  locais: { id: string; nome: string; tipo: StorageType }[];
  capacidades: { produto_escrever: boolean; recebimento_escrever: boolean; divergencia_aprovar: boolean };
}
export interface StockBalance {
  produto_id: string; produto: string; unidade_medida: string; lote_id: string; lote: string;
  validade: string | null; camara_id: string; local: string; quantidade: string; valor_unitario: string;
}
export interface ProductQuery { q: string; status: ActiveStatus; offset: number }
export interface ProductList { produtos: Product[]; total: number }
export interface ReceiptList { entradas: Receipt[] }
export interface StockBalances { saldos: StockBalance[] }
export interface ProductResult { produto: Product }
export interface ReceiptResult { entrada: Receipt }

export const productInputFields = ['descricao', 'complemento', 'unidade_medida_id', 'categoria_id', 'perecivel', 'armazenamento', 'fator_correcao', 'apresentacao_compra', 'quantidade_apresentacao', 'estoque_minimo', 'estoque_maximo', 'ponto_reposicao', 'status'] as const;
const itemFields = ['produto_id', 'quantidade', 'valor_unitario', 'numero_lote', 'validade', 'camara_id', 'temperatura', 'aspecto_embalagem', 'conformidade', 'motivo'] as const;
export function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}
export function isText(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
}
export function isStockId(value: unknown): value is string {
  return typeof value === 'string' && isPositiveBigint(value);
}
export function isStorageType(value: unknown): value is StorageType {
  return value === 'SECO' || value === 'RESFRIADO' || value === 'CONGELADO';
}
/** Representação canônica, sem Number/parseFloat ou arredondamento de precisão. */
export function isStockDecimal(value: unknown, options: { signed?: boolean; positive?: boolean; calculated?: boolean } = {}): value is string {
  if (typeof value !== 'string' || value.length > 50) return false;
  const pattern = options.calculated ? /^-?(0|[1-9]\d{0,35})(\.\d{1,12})?$/ : /^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/;
  if (!pattern.test(value) || (!options.signed && value.startsWith('-'))) return false;
  return !options.positive || (!value.startsWith('-') && /[1-9]/.test(value));
}
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function scaled(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function isProdutoInput(value: unknown): value is ProdutoInput {
  if (!isRecord(value) || !hasExactFields(value, productInputFields)) return false;
  return isText(value.descricao, 200) && isText(value.complemento, 200, true)
    && isStockId(value.unidade_medida_id) && isStockId(value.categoria_id)
    && typeof value.perecivel === 'boolean' && isStorageType(value.armazenamento)
    && isStockDecimal(value.fator_correcao, { positive: true }) && isText(value.apresentacao_compra, 100)
    && isStockDecimal(value.quantidade_apresentacao, { positive: true }) && isStockDecimal(value.estoque_minimo)
    && (value.estoque_maximo === null || (isStockDecimal(value.estoque_maximo) && scaled(value.estoque_maximo) >= scaled(value.estoque_minimo)))
    && (value.ponto_reposicao === null || isStockDecimal(value.ponto_reposicao))
    && (value.status === 'ATIVO' || value.status === 'INATIVO');
}
export function isEntradaItemInput(value: unknown): value is EntradaItemInput {
  if (!isRecord(value) || !hasExactFields(value, itemFields)) return false;
  return isStockId(value.produto_id) && isStockDecimal(value.quantidade, { positive: true })
    && isStockDecimal(value.valor_unitario) && (value.numero_lote === null || isText(value.numero_lote, 100))
    && (value.validade === null || isIsoDate(value.validade)) && isStockId(value.camara_id)
    && (value.temperatura === null || isStockDecimal(value.temperatura, { signed: true }))
    && isText(value.aspecto_embalagem, 200) && ['CONFORME', 'RESSALVA', 'RECUSADO'].includes(String(value.conformidade))
    && isText(value.motivo, 500, value.conformidade === 'CONFORME');
}
export function isEntradaInput(value: unknown): value is EntradaInput {
  if (!isRecord(value) || !hasExactFields(value, ['data_entrada', 'fornecedor_id', 'numero_nf', 'total_nota', 'observacoes', 'itens'])) return false;
  return isIsoDate(value.data_entrada) && isStockId(value.fornecedor_id) && isText(value.numero_nf, 60)
    && (value.total_nota === null || isStockDecimal(value.total_nota)) && isText(value.observacoes, 2000, true)
    && Array.isArray(value.itens) && value.itens.length > 0 && value.itens.length <= 50 && value.itens.every(isEntradaItemInput);
}
