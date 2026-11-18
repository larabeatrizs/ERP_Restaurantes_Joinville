import { isRecord } from './index.ts';
import { hasExactFields, isStockDecimal, isStockId, isIsoDate } from './stock.ts';

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export interface WithdrawalInput { produto_id: string; quantidade: string; retirado_por: string; chave: string }
export interface WithdrawalReview { revisao: string; estado: 'CONFERIDA' | 'CONTESTADA'; motivo: string }
export interface Withdrawal {
 id: string; unidade_id: string; produto_id: string; quantidade: string; solicitante_id: string; retirado_por: string;
 data_movimento: string; modo_snapshot: 'POSTERIOR'; configuracao_revisao: string; estado: 'REGISTRADA' | 'CONFERIDA' | 'CONTESTADA';
 revisao: string; conferido_por: string | null; motivo: string; itens: { id: string; lote_id: string; camara_id: string; quantidade: string }[];
}
export interface WithdrawalPanel {
 unidade_id: string; usuario_id: string; pode_registrar: boolean; pode_conferir: boolean; modo_saida: 'PREVIA' | 'POSTERIOR' | null;
 produtos: { id: string; descricao: string; unidade: string }[]; requisicoes: Withdrawal[];
}
export function isWithdrawalInput(v: unknown): v is WithdrawalInput {
 return isRecord(v) && hasExactFields(v,['produto_id','quantidade','retirado_por','chave']) && isStockId(v.produto_id)
  && isStockDecimal(v.quantidade,{positive:true}) && typeof v.retirado_por==='string' && /\S/.test(v.retirado_por) && v.retirado_por.length<=200 && uuid(v.chave);
}
export function isWithdrawalReview(v: unknown): v is WithdrawalReview {
 return isRecord(v) && hasExactFields(v,['revisao','estado','motivo']) && isStockId(v.revisao)
  && (v.estado==='CONFERIDA'||v.estado==='CONTESTADA') && typeof v.motivo==='string' && v.motivo.length<=500
  && (v.estado!=='CONTESTADA'||v.motivo.trim().length>=3);
}
export function isWithdrawal(v: unknown, unit: string): v is Withdrawal {
 if(!isRecord(v)||v.unidade_id!==unit||!isStockId(v.id)||!isStockId(v.produto_id)||!isStockDecimal(v.quantidade,{positive:true})
  ||!uuid(v.solicitante_id)||typeof v.retirado_por!=='string'||!v.retirado_por.trim()||v.retirado_por.length>200
  ||!isIsoDate(v.data_movimento)||v.modo_snapshot!=='POSTERIOR'
  ||!isStockId(v.configuracao_revisao)||!isStockId(v.revisao)||typeof v.motivo!=='string'||v.motivo.length>500
  ||!Array.isArray(v.itens)||!v.itens.length) return false;
 if(v.estado==='REGISTRADA'){if(v.conferido_por!==null||v.motivo!=='')return false;}
 else if(!['CONFERIDA','CONTESTADA'].includes(String(v.estado))||!uuid(v.conferido_por)||v.conferido_por===v.solicitante_id||(v.estado==='CONTESTADA'&&v.motivo.trim().length<3))return false;
 const ids=new Set<string>();let total=0n;
 for(const item of v.itens){if(!isRecord(item)||!isStockId(item.id)||ids.has(item.id)||!isStockId(item.lote_id)||!isStockId(item.camara_id)||!isStockDecimal(item.quantidade,{positive:true}))return false;ids.add(item.id);total+=micros(item.quantidade);}
 return total===micros(v.quantidade);
}
export function isWithdrawalPanel(v: unknown,unit:string):v is WithdrawalPanel {
 return isRecord(v)&&v.unidade_id===unit&&uuid(v.usuario_id)&&typeof v.pode_registrar==='boolean'&&typeof v.pode_conferir==='boolean'
 && (v.modo_saida===null||v.modo_saida==='PREVIA'||v.modo_saida==='POSTERIOR')&&Array.isArray(v.produtos)
 &&v.produtos.every(p=>isRecord(p)&&isStockId(p.id)&&typeof p.descricao==='string'&&!!p.descricao.trim()&&typeof p.unidade==='string'&&!!p.unidade.trim())
 &&Array.isArray(v.requisicoes)&&v.requisicoes.length<=50&&v.requisicoes.every(r=>isWithdrawal(r,unit));
}

/** EST-002/C1: substituição integral da distribuição de UM item retirado. */
export interface WithdrawalAllocationInput {
  revisao: string;
  destinos: { cardapio_refeicao_id: string; quantidade: string }[];
}

export function isWithdrawalAllocationInput(value: unknown): value is WithdrawalAllocationInput {
  if (!isRecord(value) || !hasExactFields(value, ['revisao', 'destinos'])
    || !isStockId(value.revisao) || !Array.isArray(value.destinos) || value.destinos.length > 100) return false;
  const ids = new Set<string>();
  return value.destinos.every(destination => {
    if (!isRecord(destination) || !hasExactFields(destination, ['cardapio_refeicao_id', 'quantidade'])
      || !isStockId(destination.cardapio_refeicao_id) || !isStockDecimal(destination.quantidade, { positive: true })
      || ids.has(destination.cardapio_refeicao_id)) return false;
    ids.add(destination.cardapio_refeicao_id);
    return true;
  });
}

export interface WithdrawalAllocationContext {
  unidade_id: string;
  quantidade_retirada: string;
  /** Origem confiável: refeições existentes lidas pelo servidor, nunca o corpo HTTP. */
  refeicoes: { id: string; unidade_id: string }[];
}

function micros(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

/** Invariante pura. Não autoriza, não persiste, não altera saldo ou estado de conferência. */
export function validateWithdrawalAllocation(input: unknown, context: WithdrawalAllocationContext):
  'VALIDA' | 'ENTRADA_INVALIDA' | 'CONTEXTO_INVALIDO' | 'REFEICAO_INDISPONIVEL' | 'QUANTIDADE_EXCEDIDA' {
  if (!isWithdrawalAllocationInput(input)) return 'ENTRADA_INVALIDA';
  if (!isStockId(context.unidade_id) || !isStockDecimal(context.quantidade_retirada, { positive: true })
    || !Array.isArray(context.refeicoes)) return 'CONTEXTO_INVALIDO';
  const meals = new Map<string, string>();
  for (const meal of context.refeicoes) {
    if (!isStockId(meal.id) || !isStockId(meal.unidade_id) || meals.has(meal.id)) return 'CONTEXTO_INVALIDO';
    meals.set(meal.id, meal.unidade_id);
  }
  let distributed = 0n;
  for (const destination of input.destinos) {
    if (meals.get(destination.cardapio_refeicao_id) !== context.unidade_id) return 'REFEICAO_INDISPONIVEL';
    distributed += micros(destination.quantidade);
  }
  return distributed > micros(context.quantidade_retirada) ? 'QUANTIDADE_EXCEDIDA' : 'VALIDA';
}
