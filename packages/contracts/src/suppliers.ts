import { isRecord } from './index.ts';
import { hasExactFields, isStockDecimal, isStockId } from './stock.ts';
import type { ActiveStatus } from './stock.ts';
import { csvDocument } from './csv.ts';
export const supplierTextLimits = { nome_fantasia:200, contato:200, telefone:40, email:254, endereco:500, observacoes:2000, tipo_fornecedor:100, condicao_pagamento:200 } as const;
export type SupplierContactChannel = 'EMAIL' | 'WHATSAPP';
export interface SupplierInput {
  razao_social:string; cnpj_cpf:string; nome_fantasia:string|null; contato:string|null; telefone:string|null; email:string|null;
  endereco:string|null; observacoes:string|null; tipo_fornecedor:string|null; condicao_pagamento:string|null;
  prazo_entrega_dias:number|null; pedido_minimo:string|null; agricultura_familiar:boolean; canal_preferido:SupplierContactChannel|null;
}
export interface Supplier extends Omit<SupplierInput,'agricultura_familiar'> { agricultura_familiar:boolean|null; id:string; revisao:string; status:ActiveStatus; pode_excluir:boolean }
export interface SupplierQuery { q:string; status:ActiveStatus; ordem:'asc'|'desc'; offset:number }
export interface SupplierList { fornecedores:Supplier[]; total:number; capacidades:{editar:boolean;ciclo_vida:boolean} }
export const supplierFields = ['razao_social','cnpj_cpf',...Object.keys(supplierTextLimits),'prazo_entrega_dias','pedido_minimo','agricultura_familiar','canal_preferido'] as const;
export function canonicalDocument(value:string):string { return value.trim().toUpperCase().replace(/[\s./-]/g,''); }
/** Valida somente estrutura/DV; não consulta existência ou regularidade cadastral. */
export function validSupplierDocument(value:string):boolean {
  const p=canonicalDocument(value);
  if(!/^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/.test(p)||/^(.)\1+$/.test(p))return false;
  const base=p.length-2;
  for(let step=0;step<2;step++) {
    let sum=0;
    for(let i=0;i<base+step;i++)sum+=(p.charCodeAt(i)-48)*(base===9?base+step+1-i:2+(base+step-1-i)%8);
    const remainder=sum%11, digit=remainder<2?0:11-remainder;
    if(digit!==Number(p[base+step]))return false;
  }
  return true;
}
export function supplierErrors(value:unknown):Record<string,string> {
  if(!isRecord(value)||!hasExactFields(value,supplierFields))return {formulario:'Informe somente os campos previstos.'};
  const errors:Record<string,string>={};
  if(typeof value.razao_social!=='string'||!value.razao_social.trim()||value.razao_social.length>200)errors.razao_social='Informe a razão social com até 200 caracteres.';
  if(typeof value.cnpj_cpf!=='string'||value.cnpj_cpf.length>24||!validSupplierDocument(value.cnpj_cpf))errors.cnpj_cpf='Informe CPF ou CNPJ válido, numérico ou alfanumérico.';
  for(const [key,limit] of Object.entries(supplierTextLimits))if(value[key]!==null&&(typeof value[key]!=='string'||!(value[key] as string).trim()||(value[key] as string).length>limit))errors[key]=`Informe até ${limit} caracteres ou deixe vazio.`;
  if(typeof value.email==='string'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))errors.email='Informe um email válido ou deixe vazio.';
  if(value.prazo_entrega_dias!==null&&(!Number.isInteger(value.prazo_entrega_dias)||(value.prazo_entrega_dias as number)<0||(value.prazo_entrega_dias as number)>2147483647))errors.prazo_entrega_dias='Informe dias inteiros não negativos ou deixe vazio.';
  if(value.pedido_minimo!==null&&!isStockDecimal(value.pedido_minimo))errors.pedido_minimo='Informe um valor não negativo com até seis casas decimais ou deixe vazio.';
  if(typeof value.agricultura_familiar!=='boolean')errors.agricultura_familiar='Selecione Sim ou Não.';
  if(value.canal_preferido!==null&&(typeof value.canal_preferido!=='string'||!['EMAIL','WHATSAPP'].includes(value.canal_preferido)))errors.canal_preferido='Selecione email, WhatsApp ou não informado.';
  return errors;
}
export function isSupplierInput(value:unknown):value is SupplierInput { return Object.keys(supplierErrors(value)).length===0; }
export function isSupplier(value:unknown):value is Supplier {
  if(!isRecord(value))return false;
  const fields=Object.fromEntries(supplierFields.map(key=>[key,value[key]]));
  if(fields.agricultura_familiar===null)fields.agricultura_familiar=false;
  return isSupplierInput(fields)&&(value.agricultura_familiar===null||typeof value.agricultura_familiar==='boolean')&&isStockId(value.id)&&isStockId(value.revisao)&&(value.status==='ATIVO'||value.status==='INATIVO')&&typeof value.pode_excluir==='boolean';
}
export function isSupplierList(value:unknown,limit=50):value is SupplierList { return isRecord(value)&&Array.isArray(value.fornecedores)&&value.fornecedores.length<=limit&&value.fornecedores.every(isSupplier)&&Number.isSafeInteger(value.total)&&(value.total as number)>=value.fornecedores.length&&isRecord(value.capacidades)&&typeof value.capacidades.editar==='boolean'&&typeof value.capacidades.ciclo_vida==='boolean'; }
export function suppliersCsv(rows:Supplier[]):string {
  return csvDocument([['Razão social','CPF/CNPJ','Nome fantasia','Contato','Telefone','Email','Endereço','Observações','Tipo de fornecedor','Condição de pagamento','Prazo de entrega (dias)','Pedido mínimo','Agricultura familiar','Canal preferido','Status'],...rows.map(r=>[r.razao_social,r.cnpj_cpf,r.nome_fantasia??'',r.contato??'',r.telefone??'',r.email??'',r.endereco??'',r.observacoes??'',r.tipo_fornecedor??'',r.condicao_pagamento??'',r.prazo_entrega_dias===null?'':String(r.prazo_entrega_dias),r.pedido_minimo?.replace('.',',')??'',r.agricultura_familiar===null?'Não informado':r.agricultura_familiar?'Sim':'Não',r.canal_preferido??'',r.status==='ATIVO'?'Ativo':'Inativo'])]);
}
