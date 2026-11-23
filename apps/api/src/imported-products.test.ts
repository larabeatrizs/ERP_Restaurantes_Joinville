import{test}from'node:test';import assert from'node:assert/strict';
import{createApp}from'./index.ts';import type{StockRepository}from'./repositories/stock-repository.ts';
const input={descricao:'Arroz',complemento:'',unidade_medida_id:'1',categoria_id:'1',perecivel:false,armazenamento:'SECO',fator_correcao:'1',apresentacao_compra:'Pacote',quantidade_apresentacao:'1',estoque_minimo:'0',estoque_maximo:null,ponto_reposicao:null,status:'ATIVO'};
test('HTTP de importados preserva unidade/filtro e exige produto completo para concluir',async()=>{
 const calls:unknown[]=[];const repo={importedProducts:async(u:string,q:unknown)=>{calls.push([u,q]);return{total:0,itens:[]};},completeImportedProduct:async(u:string,id:string,p:unknown)=>{calls.push([u,id,p]);return{produto:{...input,id:'10',revisao:'1'}};}} as unknown as StockRepository;
 const app=createApp(undefined,()=>({authenticate:async()=>{},repository:repo}));
 const request=(path:string,method='GET',body?:object,auth=true)=>new Request(`https://test.local/api/unidades/2/${path}`,{method,headers:{...(auth?{Authorization:'Bearer fixture'}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let r=await app.fetch(request('produtos-importados?q=arroz&offset=50'));assert.equal(r.status,200);assert.deepEqual(calls[0],['2',{q:'arroz',offset:50}]);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal((await app.fetch(request('produtos-importados?status=ATIVO'))).status,400);
 assert.equal((await app.fetch(request('produtos-importados','GET',undefined,false))).status,401);
 assert.equal((await app.fetch(request('produtos-importados/1/concluir','POST',{descricao:'Nome'}))).status,422);
 r=await app.fetch(request('produtos-importados/1/concluir','POST',input));assert.equal(r.status,200);assert.deepEqual(calls[1],['2','1',input]);assert.equal((await app.fetch(request('produtos-importados/1/concluir','GET'))).status,405);
});
