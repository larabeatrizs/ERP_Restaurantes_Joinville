import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalDocument, validSupplierDocument, supplierErrors, suppliersCsv, supplierFields } from '@erp/contracts';
import type { Supplier, SupplierInput } from '@erp/contracts';
import { createApp } from './index.ts';
import { supplierSession } from './repositories/supabase-suppliers.ts';
import type { SupplierSessionFactory } from './repositories/supplier-repository.ts';
const input:SupplierInput={razao_social:'Fornecedor demonstração',cnpj_cpf:'12ABC34501DE35',nome_fantasia:null,contato:null,telefone:null,email:null,endereco:null,observacoes:null,tipo_fornecedor:null,condicao_pagamento:null,prazo_entrega_dias:0,pedido_minimo:'0',agricultura_familiar:false,canal_preferido:null};
const row:Supplier={...input,id:'9007199254740993',revisao:'9007199254740995',status:'ATIVO',pode_excluir:true};
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ficticio'};
test('documento usa exemplo oficial RFB alfanumérico e preserva compatibilidade numérica/máscaras',()=>{
  for(const value of ['12.ABC.345/01DE-35','12abc34501de35','11222333000181','12345678909'])assert.equal(validSupplierDocument(value),true);
  for(const value of ['12ABC34501DE36','11111111111','00000000000000','12ABC34501DÉ35','12ABC34501D#E35','1234567890', '12345678900'])assert.equal(validSupplierDocument(value),false);
  assert.equal(canonicalDocument('12.abc.345/01de-35'),'12ABC34501DE35');
});
test('fornecedor valida zero/null sem coerção e exige escolha explícita de agricultura familiar',()=>{
  assert.deepEqual(supplierErrors(input),{});
  for(const extra of [{agricultura_familiar:null},{prazo_entrega_dias:'0'},{prazo_entrega_dias:-1},{prazo_entrega_dias:2147483648},{pedido_minimo:0},{pedido_minimo:'-1'},{pedido_minimo:'0.0000001'},{canal_preferido:['EMAIL']},{email:'x'},{razao_social:''},{nome_fantasia:''},{ator_id:'indevido'}])assert.ok(Object.keys(supplierErrors({...input,...extra})).length>0);
});
test('fornecedor HTTP valida payload, normaliza documento, preserva revisão e separa ciclo de vida',async()=>{
  const calls:unknown[][]=[];
  const factory:SupplierSessionFactory=()=>({authenticate:async()=>{calls.push(['auth']);},repository:{
    list:async(...args)=>{calls.push(['list',...args]);return{fornecedores:[row],total:1,capacidades:{editar:true,ciclo_vida:false}};},
    save:async(...args)=>{calls.push(['save',...args]);return row;},status:async(...args)=>{calls.push(['status',...args]);return row;},remove:async(...args)=>{calls.push(['remove',...args]);},
  }});
  const app=createApp(undefined,undefined,undefined,undefined,undefined,factory);
  const request=(route='',method='GET',body?:unknown,auth=true)=>app.fetch(new Request('https://erp.test/api/unidades/1/fornecedores'+route,{method,headers:{...(auth?{Authorization:'Bearer ficticio'}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  assert.equal((await request('', 'GET',undefined,false)).status,401);assert.equal(calls.length,0);
  assert.equal((await request('?q=abc&status=INATIVO&ordem=desc&offset=50')).status,200);
  assert.deepEqual(calls[1],['list','1',{q:'abc',status:'INATIVO',ordem:'desc',offset:50},false]);
  for(const extra of [{pedido_minimo:1},{agricultura_familiar:null},{status:'INATIVO'}])assert.equal((await request('','POST',{...input,...extra})).status,422);
  assert.equal((await request('','POST',{...input,cnpj_cpf:'12.abc.345/01de-35'})).status,201);
  assert.equal((calls.find(c=>c[0]==='save')?.[2] as SupplierInput).cnpj_cpf,input.cnpj_cpf);
  assert.equal((await request('/'+row.id,'PATCH',input)).status,422);
  assert.equal((await request('/'+row.id,'PATCH',{...input,revisao:row.revisao})).status,200);
  assert.equal((await request('/'+row.id+'/status','POST',{status:'INATIVO',revisao:row.revisao})).status,200);
  assert.equal((await request('/'+row.id,'DELETE',{revisao:row.revisao})).status,200);
  for(const q of ['?offset=-1','?q=a&q=b','?status=TODOS','?ordem=SQL','?tabela=usuario'])assert.equal((await request(q)).status,400);
  assert.equal((await request('','PUT',{})).status,405);
});
test('CSV fornecedor protege fórmulas e mantém nulos/zero/precisão e agricultura desconhecida',()=>{
  const csv=suppliersCsv([{...row,razao_social:'=Formula',pedido_minimo:'0.000001',agricultura_familiar:null}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("\"'=Formula\""));assert.ok(csv.includes('0,000001'));assert.ok(csv.includes('Não informado'));assert.ok(!csv.includes('undefined'));
});
test('SDK fornecedor autentica antes da RPC, remove dados internos e lê registro anterior com null',async()=>{
  const requests:{url:URL;headers:Headers;body:unknown}[]=[];
  const fetcher:typeof fetch=async(target,init)=>{
    const url=new URL(String(target));requests.push({url,headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):null});
    if(url.pathname==='/auth/v1/user')return Response.json({id:'10000000-0000-4000-8000-000000000001',aud:'authenticated'});
    return Response.json({fornecedores:[{...row,agricultura_familiar:null,interno:'SEGREDO'}],total:1,capacidades:{editar:false,ciclo_vida:false,interno:true},interno:true});
  };
  const session=supplierSession(env,'token-ficticio',fetcher);await session.authenticate();
  const result=await session.repository.list('1',{q:'',status:'ATIVO',ordem:'asc',offset:0});
  assert.equal(result.fornecedores[0]?.agricultura_familiar,null);assert.deepEqual(Object.keys(result.fornecedores[0]!).sort(),[...supplierFields,'id','revisao','status','pode_excluir'].sort());
  assert.deepEqual(result.capacidades,{editar:false,ciclo_vida:false});assert.equal(requests[0]?.url.pathname,'/auth/v1/user');assert.equal(requests[1]?.url.pathname,'/rest/v1/rpc/fornecedor_operacao');assert.equal(requests[1]?.headers.get('Authorization'),'Bearer token-ficticio');assert.equal(requests[1]?.headers.get('Content-Profile'),'erp');
});
test('SDK fornecedor nega Auth anônimo, chave administrativa e respostas inválidas; erros não vazam SQL',async()=>{
  assert.throws(()=>supplierSession({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_proibida'},'x'));
  let calls=0;const anon=supplierSession(env,'x',async()=>{calls++;return Response.json({id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',is_anonymous:true});});
  await assert.rejects(()=>anon.authenticate());assert.equal(calls,1);
  for(const code of ['PT403','PT404','PT409','PT412','PT422','XX000']){
    const session=supplierSession(env,'x',async()=>Response.json({code,message:'SQL segredo interno'},{status:400}));
    await assert.rejects(()=>session.repository.list('1',{q:'',status:'ATIVO',ordem:'asc',offset:0}),(error:unknown)=>error instanceof Error&&!error.message.includes('SQL'));
  }
  const invalid=supplierSession(env,'x',async()=>Response.json({fornecedores:[{...row,id:1}],total:1,capacidades:{editar:true,ciclo_vida:true}}));
  await assert.rejects(()=>invalid.repository.list('1',{q:'',status:'ATIVO',ordem:'asc',offset:0}));
});
