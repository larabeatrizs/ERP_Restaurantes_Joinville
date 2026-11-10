import { createClient } from '@supabase/supabase-js';
import { isEntradaInput, isEntradaItemInput, isIsoDate, isProdutoInput, isRecord, isStockDecimal, isStockId, isStorageType, isText, productInputFields } from '@erp/contracts';
import type { Product, Receipt, ReceiptItem, StockBalance, StockContext } from '@erp/contracts';
import type { StockRuntimeEnv, StockSession } from './stock-repository.ts';
import { ApiError } from '../errors.ts';

function unavailable(): never { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Serviço de estoque indisponível.'); }
function translate(error: { code?: string } | null, status: number): void {
  if (!error) return;
  if (status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  switch (error.code) {
    case 'PT403':
    case '42501': throw new ApiError(403, 'ACCESS_DENIED', 'Você não tem permissão para esta operação.');
    case 'PT404': throw new ApiError(404, 'NOT_FOUND', 'Registro não encontrado nesta unidade.');
    case 'PT409':
    case '23505': throw new ApiError(409, 'STOCK_CONFLICT', 'Registro duplicado ou operação incompatível com o estado atual.');
    case 'PT412': throw new ApiError(412, 'PRECONDITION_FAILED', 'O produto foi alterado. Recarregue antes de salvar.');
    case 'PT422':
    case '23514':
    case '22003':
    case '22P02': throw new ApiError(422, 'INVALID_STOCK_INPUT', 'Revise os campos e as condições do recebimento.');
    default: unavailable();
  }
}
function product(value: unknown): Product {
  if (!isRecord(value)) unavailable();
  const input = Object.fromEntries(productInputFields.map(field => [field, value[field]]));
  if (!isProdutoInput(input) || !isStockId(value.id) || !isStockId(value.revisao)
    || !isText(value.unidade_sigla, 100) || !isText(value.categoria_descricao, 200)) unavailable();
  return { ...input, id: value.id, revisao: value.revisao, unidade_sigla: value.unidade_sigla, categoria_descricao: value.categoria_descricao };
}
function item(value: unknown): ReceiptItem {
  if (!isRecord(value)) unavailable();
  const input = {
    produto_id: value.produto_id, quantidade: value.quantidade, valor_unitario: value.valor_unitario,
    numero_lote: value.numero_lote, validade: value.validade, camara_id: value.camara_id,
    temperatura: value.temperatura, aspecto_embalagem: value.aspecto_embalagem,
    conformidade: value.conformidade, motivo: value.motivo,
  };
  if (!isEntradaItemInput(input) || !isStockId(value.id) || !isText(value.produto, 200)
    || !isText(value.unidade_medida, 100) || !isText(value.local, 200)) unavailable();
  return { ...input, id: value.id, produto: value.produto, unidade_medida: value.unidade_medida, local: value.local };
}
function receipt(value: unknown, unit: string): Receipt {
  if (!isRecord(value) || !Array.isArray(value.itens)) unavailable();
  const items = value.itens.map(item);
  const input = {
    data_entrada: value.data_entrada, fornecedor_id: value.fornecedor_id, numero_nf: value.numero_nf,
    total_nota: value.total_nota, observacoes: value.observacoes,
    itens: items.map(row => ({
      produto_id: row.produto_id, quantidade: row.quantidade, valor_unitario: row.valor_unitario,
      numero_lote: row.numero_lote, validade: row.validade, camara_id: row.camara_id,
      temperatura: row.temperatura, aspecto_embalagem: row.aspecto_embalagem, conformidade: row.conformidade, motivo: row.motivo,
    })),
  };
  if (!isEntradaInput(input) || !isStockId(value.id) || value.unidade_id !== unit || !isText(value.fornecedor, 200)
    || !isStockDecimal(value.total_itens, { calculated: true }) || typeof value.divergencia_aprovada !== 'boolean'
    || (value.estado !== 'RASCUNHO' && value.estado !== 'CONFIRMADA' && value.estado !== 'ESTORNADA')) unavailable();
  return { ...input, id: value.id, unidade_id: unit, fornecedor: value.fornecedor, total_itens: value.total_itens, estado: value.estado, divergencia_aprovada: value.divergencia_aprovada, itens: items };
}
function balance(value: unknown): StockBalance {
  if (!isRecord(value) || !isStockId(value.produto_id) || !isText(value.produto, 200)
    || !isText(value.unidade_medida, 100) || !isStockId(value.lote_id) || !isText(value.lote, 100)
    || (value.validade !== null && !isIsoDate(value.validade)) || !isStockId(value.camara_id) || !isText(value.local, 200)
    || !isStockDecimal(value.quantidade) || !isStockDecimal(value.valor_unitario)) unavailable();
  return {
    produto_id: value.produto_id, produto: value.produto, unidade_medida: value.unidade_medida,
    lote_id: value.lote_id, lote: value.lote, validade: value.validade, camara_id: value.camara_id,
    local: value.local, quantidade: value.quantidade, valor_unitario: value.valor_unitario,
  };
}
function context(value: unknown): StockContext {
  if (!isRecord(value) || !Array.isArray(value.medidas) || !Array.isArray(value.categorias)
    || !Array.isArray(value.fornecedores) || !Array.isArray(value.locais) || !isRecord(value.capacidades)) unavailable();
  const capabilities = value.capacidades;
  if (typeof capabilities.produto_escrever !== 'boolean' || typeof capabilities.recebimento_escrever !== 'boolean' || typeof capabilities.divergencia_aprovar !== 'boolean') unavailable();
  return {
    medidas: value.medidas.map((row: unknown) => {
      if (!isRecord(row) || !isStockId(row.id) || !isText(row.sigla, 100) || !isText(row.descricao, 200)) unavailable();
      return { id: row.id, sigla: row.sigla, descricao: row.descricao };
    }),
    categorias: value.categorias.map((row: unknown) => {
      if (!isRecord(row) || !isStockId(row.id) || !isText(row.descricao, 200) || !isStorageType(row.armazenamento_padrao)) unavailable();
      return { id: row.id, descricao: row.descricao, armazenamento_padrao: row.armazenamento_padrao };
    }),
    fornecedores: value.fornecedores.map((row: unknown) => {
      if (!isRecord(row) || !isStockId(row.id) || !isText(row.razao_social, 200)) unavailable();
      return { id: row.id, razao_social: row.razao_social };
    }),
    locais: value.locais.map((row: unknown) => {
      if (!isRecord(row) || !isStockId(row.id) || !isText(row.nome, 200) || !isStorageType(row.tipo)) unavailable();
      return { id: row.id, nome: row.nome, tipo: row.tipo };
    }),
    capacidades: { produto_escrever: capabilities.produto_escrever, recebimento_escrever: capabilities.recebimento_escrever, divergencia_aprovar: capabilities.divergencia_aprovar },
  };
}

/** Uma sessão de estoque por requisição; Bearer e RLS reais, sem chave administrativa. */
export function createSupabaseStockSession(env: StockRuntimeEnv, token: string, fetcher: typeof fetch = fetch): StockSession {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) unavailable();
  let url: URL;
  try { url = new URL(env.SUPABASE_URL); } catch { unavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') unavailable();
  const client = createClient(url.origin, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }),
    },
  });
  async function operation(unit: string, action: string, data: object): Promise<Record<string, unknown>> {
    const result = await client.schema('erp').rpc('estoque_operacao', { p_unidade: unit, p_acao: action, p_dados: data });
    translate(result.error, result.status);
    if (!isRecord(result.data)) unavailable();
    return result.data;
  }
  return {
    async authenticate() {
      const { data, error } = await client.auth.getUser(token);
      if (error && (!error.status || error.status >= 500)) unavailable();
      if (error || !data.user || data.user.is_anonymous || data.user.aud !== 'authenticated') throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    },
    repository: {
      async context(unit) { return context(await operation(unit, 'contexto', {})); },
      async products(unit, query) {
        const result = await operation(unit, 'produtos', query);
        if (!Array.isArray(result.produtos) || result.produtos.length > 50 || typeof result.total !== 'number' || !Number.isSafeInteger(result.total) || result.total < 0) unavailable();
        return { produtos: result.produtos.map(product), total: result.total };
      },
      async saveProduct(unit, input, id, revision) {
        const result = await operation(unit, 'produto_salvar', id === undefined ? input : { ...input, id, revisao: revision });
        const saved = product(result.produto);
        if (id !== undefined && saved.id !== id) unavailable();
        return { produto: saved };
      },
      async receipts(unit) {
        const result = await operation(unit, 'entradas', {});
        if (!Array.isArray(result.entradas) || result.entradas.length > 50) unavailable();
        return { entradas: result.entradas.map(row => receipt(row, unit)) };
      },
      async createReceipt(unit, input) {
        const result = await operation(unit, 'entrada_criar', input);
        return { entrada: receipt(result.entrada, unit) };
      },
      async confirmReceipt(unit, id, key) {
        const result = await operation(unit, 'entrada_confirmar', { id, chave: key });
        const saved = receipt(result.entrada, unit);
        if (saved.id !== id) unavailable();
        return { entrada: saved };
      },
      async approveReceipt(unit, id, reason) {
        const result = await operation(unit, 'entrada_aprovar_divergencia', { id, motivo: reason });
        const saved = receipt(result.entrada, unit);
        if (saved.id !== id) unavailable();
        return { entrada: saved };
      },
      async balances(unit) {
        const result = await operation(unit, 'saldos', {});
        if (!Array.isArray(result.saldos)) unavailable();
        return { saldos: result.saldos.map(balance) };
      },
    },
  };
}
