import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAdminUserEdit } from '@erp/contracts';
import type { AdminUserRow, AdminUsersSnapshot } from '@erp/contracts';
import { adminUserReport, adminUserReportCsv } from './admin-user-report.ts';

const edit=()=>({nome:' Pessoa sintética ',perfil:'ESTOQUISTA',unidades:['1','9007199254740993'],revisao:'9007199254740993',motivo:' Correção sintética '});
const row=(n:number):AdminUserRow=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,nome:`Pessoa ${n}`,login:`pessoa.${n}`,email:`pessoa-${n}@example.invalid`,perfil:'ESTOQUISTA',status:'ATIVO',primeiro_acesso:false,unidades:['1']});
const unit={id:'1',codigo:'RP1',nome:'Unidade sintética'};
const snapshot=(users:AdminUserRow[],total=users.length):AdminUsersSnapshot=>({usuarios:users,total,pode_criar:false,unidades:[unit],perfis:['ESTOQUISTA']});

test('edição B: rascunho conserva bigint exato e copia unidades sem conceder acesso',()=>{
 const original=edit(),before=structuredClone(original),result=validateAdminUserEdit(original);assert.equal(result.ok,true);if(!result.ok)throw Error('Expected valid draft');
 assert.deepEqual(result.value,{...original,nome:'Pessoa sintética',motivo:'Correção sintética'});result.value.unidades.push('2');assert.deepEqual(original,before);
});
test('edição B: criação/status/credenciais/metadados não entram no contrato de alteração',()=>{
 for(const field of ['login','email','status','senha','password','id','auth_id','ator_id','permissoes','user_metadata']){
  const result=validateAdminUserEdit({...edit(),[field]:'segredo-nao-ecoar'});assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('segredo-nao-ecoar'),false);
 }
 for(const key of Object.keys(edit())){const value:Record<string,unknown>=edit();delete value[key];assert.equal(validateAdminUserEdit(value).ok,false);}
});
test('edição B: revisão obrigatória, vínculos válidos e textos sem controles',()=>{
 for(const [field,values] of Object.entries({revisao:[null,0,1,'0','01','9223372036854775808'],unidades:[[],['1','1'],[1],['*'],['0']],nome:['  ','a'.repeat(201),'nome\u0000'],perfil:['SUPERADMIN','admin',null],motivo:[' a ','a'.repeat(501),'abc\n']})){
  for(const value of values){const result=validateAdminUserEdit({...edit(),[field]:value});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.field,field);}
 }
});
test('CSV usuários percorre páginas completas com o filtro aplicado, inclusive para consulta',async()=>{
 const users=Array.from({length:27},(_,n)=>row(n+1)),calls:unknown[]=[];
 const result=await adminUserReport({async adminUsers(query,offset=0){calls.push([query,offset]);return snapshot(users.slice(offset,offset+25),27);}},'pessoa');
 assert.deepEqual(calls,[['pessoa',0],['pessoa',25]]);assert.equal(result.rows.length,27);assert.equal(result.rows[26]?.login,'pessoa.27');assert.match(result.generatedAt,/\d{2}\/\d{2}\/\d{4}/);
});
test('CSV usuários não devolve relatório parcial após falha ou revogação na página seguinte',async()=>{
 let calls=0;await assert.rejects(()=>adminUserReport({async adminUsers(){if(calls++)throw Error('Session revoked');return snapshot(Array.from({length:25},(_,n)=>row(n+1)),26);}},''),/Session revoked/);assert.equal(calls,2);
});
test('CSV usuários recusa limite, páginas truncadas, totais variáveis, duplicação e unidades variáveis',async()=>{
 const first=snapshot(Array.from({length:25},(_,n)=>row(n+1)),26);
 for(const page of [snapshot([row(26)],27),snapshot([row(1)],26),snapshot([],26),{...snapshot([row(26)],26),unidades:[{...unit,nome:'Unidade alterada'}]}]){
  let calls=0;await assert.rejects(()=>adminUserReport({async adminUsers(){return calls++?page:first;}},''),/consulta mudou/);
 }
 for(const total of [10001,-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(()=>adminUserReport({async adminUsers(){return snapshot([],total);}},''),/10.000/);
});
test('CSV usuários escapa fórmulas/aspas e usa identificações legíveis sem exportar metadados',()=>{
 const result=adminUserReportCsv({rows:[{...row(1),nome:' =HYPERLINK("x")',email:'+synthetic@example.invalid',unidades:['1','2'],status:'BLOQUEADO',primeiro_acesso:true}],units:[unit],query:'@pesquisa',generatedAt:'17/11/2026 10:00:00'});
 assert.ok(result.startsWith('\uFEFF'));assert.ok(result.includes('"\' =HYPERLINK(""x"")"'));assert.ok(result.includes('"\'+synthetic@example.invalid"'));assert.ok(result.includes('"\'@pesquisa"'));assert.match(result,/Estoquista/);assert.match(result,/RP1 — Unidade sintética \| Unidade indisponível/);assert.match(result,/Aguardando primeiro acesso/);assert.doesNotMatch(result,/00000000-0000|auth_id|password|access_token|definir-senha/);
});
test('CSV usuários suporta vazio e contas antigas sem inventar login ou email',async()=>{
 const empty=await adminUserReport({async adminUsers(){return snapshot([]);}},'');assert.equal(empty.rows.length,0);assert.equal(adminUserReportCsv(empty).split('\r\n').length,2);
 const csv=adminUserReportCsv({...empty,rows:[{...row(1),login:null,email:null,status:'INATIVO'}]});assert.match(csv,/Acesso existente/);assert.match(csv,/Não disponível/);assert.match(csv,/Inativo/);
});
