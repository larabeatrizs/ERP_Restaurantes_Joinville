import {isRecord,isPositiveBigint} from './index.ts';
export interface ProductOrigin {arquivo:string;sha256:string;aba:string;linha:number;apresentacao:string;observacao:string}
export interface ImportedProduct {id:string;descricao:string;origens:ProductOrigin[]}
export interface ImportedProducts {total:number;itens:ImportedProduct[]}
export function isImportedProducts(value:unknown):value is ImportedProducts{
 return isRecord(value)&&Number.isSafeInteger(value.total)&&(value.total as number)>=0&&Array.isArray(value.itens)&&value.itens.length<=50&&value.itens.every(item=>
  isRecord(item)&&typeof item.id==='string'&&isPositiveBigint(item.id)&&typeof item.descricao==='string'&&item.descricao.trim().length>0&&item.descricao.length<=200&&Array.isArray(item.origens)&&item.origens.length>0&&item.origens.length<=20&&item.origens.every(o=>isRecord(o)&&typeof o.arquivo==='string'&&o.arquivo.length<=200&&typeof o.sha256==='string'&&/^[a-f0-9]{64}$/.test(o.sha256)&&typeof o.aba==='string'&&o.aba.length<=100&&Number.isSafeInteger(o.linha)&&(o.linha as number)>0&&typeof o.apresentacao==='string'&&o.apresentacao.length<=200&&typeof o.observacao==='string'&&o.observacao.length<=500));
}
