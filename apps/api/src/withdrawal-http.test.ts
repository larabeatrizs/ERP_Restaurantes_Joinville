import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './index.ts';
import { ApiError } from './errors.ts';
import { isWithdrawal,isWithdrawalPanel } from '@erp/contracts';
import { withdrawalSession } from './repositories/supabase-withdrawals.ts';
const unit='9007199254740993',user='10000000-0000-4000-8000-000000000001';
const row=()=>({id:'1',unidade_id:unit,produto_id:'2',quantidade:'0.3',solicitante_id:user,retirado_por:'Pessoa sintética',data_movimento:'2026-11-17',modo_snapshot:'POSTERIOR' as const,configuracao_revisao:'1',estado:'REGISTRADA' as const,revisao:'1',conferido_por:null,motivo:'',itens:[{id:'1',lote_id:'3',camara_id:'4',quantidade:'0.3'}]});
const snapshot=()=>({unidade_id:unit,usuario_id:user,pode_registrar:true,pode_conferir:false,modo_saida:'POSTERIOR' as const,produtos:[{id:'2',descricao:'Arroz',unidade:'KG'}],requisicoes:[row()]});
const input={produto_id:'2',quantidade:'0.3',retirado_por:'Pessoa sintética',chave:'20000000-0000-4000-8000-000000000001'};
const request=(suffix='',method='GET',body?:unknown)=>new Request(`https://erp.invalid/api/unidades/${unit}/requisicoes${suffix}`,{method,headers:{Authorization:'Bearer teste',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('requisição HTTP valida sessão, método, corpo, query e encaminha IDs exatos',async()=>{
 const calls:unknown[]=[];const app=createApp(undefined,undefined,undefined,undefined,undefined,undefined,undefined,()=>({async authenticate(){calls.push('auth');},repository:{async read(u){calls.push(u);return snapshot();},async register(u,i){calls.push([u,i]);return row();},async review(u,id,i){calls.push([u,id,i]);return row();}}}));
 assert.equal((await app.fetch(new Request(request().url))).status,401);assert.equal(calls.length,0);
 assert.equal((await app.fetch(request())).status,200);assert.equal((await app.fetch(request('','POST',input))).status,200);assert.deepEqual(calls.at(-1),[unit,input]);
 for(const extra of [{quantidade:0.3},{quantidade:'0'},{unidade_id:'2'},{solicitante_id:user},{data_movimento:'2026-11-17'}])assert.equal((await app.fetch(request('','POST',{...input,...extra}))).status,422);
 assert.equal((await app.fetch(request('?x=1'))).status,400);assert.equal((await app.fetch(request('','DELETE'))).status,405);
 assert.equal((await app.fetch(request('/1/conferencia','POST',{revisao:'1',estado:'CONTESTADA',motivo:''}))).status,422);
 assert.equal((await app.fetch(request('/1/conferencia','POST',{revisao:'1',estado:'CONFERIDA',motivo:''}))).status,200);
});
test('requisição HTTP preserva erros e respostas sem cache',async()=>{
 for(const code of [401,403,404,409,412,503]){const app=createApp(undefined,undefined,undefined,undefined,undefined,undefined,undefined,()=>({async authenticate(){throw new ApiError(code,'TEST','Negado');},repository:{async read(){return snapshot();},async register(){return row();},async review(){return row();}}}));const res=await app.fetch(request());assert.equal(res.status,code);assert.match(res.headers.get('Cache-Control')!,/no-store/);}
});
test('contrato rejeita resposta de outra unidade, soma incorreta, data inválida e conferência própria',()=>{
 assert.ok(isWithdrawalPanel(snapshot(),unit));assert.equal(isWithdrawal(row(),'2'),false);
 assert.equal(isWithdrawal({...row(),quantidade:'0.4'},unit),false);assert.equal(isWithdrawal({...row(),data_movimento:'2026-02-30'},unit),false);
 assert.equal(isWithdrawal({...row(),estado:'CONFERIDA',conferido_por:user},unit),false);
});
test('repository usa sessão pública, RPC permitida e rejeita resposta inválida/erro sem expor SQL',async()=>{
 const env={SUPABASE_URL:'https://auth-ficticio.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ficticia'};
 for(const malformed of [false,true]){const calls:string[]=[];const s=withdrawalSession(env,'sessao',async(url,init)=>{calls.push(String(url));assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer sessao');if(String(url).endsWith('/user'))return Response.json({id:user,aud:'authenticated',role:'authenticated'});return Response.json(malformed?{...snapshot(),unidade_id:'2'}:snapshot());});await s.authenticate();if(malformed)await assert.rejects(()=>s.repository.read(unit),{status:503});else assert.ok(await s.repository.read(unit));assert.ok(calls.some(u=>u.includes('/rpc/requisicao_painel')));}
});
