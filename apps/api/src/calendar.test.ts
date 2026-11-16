import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarTemplate, isCalendarInput, isCalendarSave, resolveCalendar } from '@erp/contracts';
import type { CalendarConfig, CalendarSnapshot } from '@erp/contracts';
import { createApp } from './index.ts';
import { calendarSession } from './repositories/supabase-calendar.ts';
import { ApiError } from './errors.ts';
const unit='9007199254740993',base=`https://erp.invalid/api/unidades/${unit}/calendario`,env={SUPABASE_URL:'https://auth-ficticio.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ficticia'};
const config=():CalendarConfig=>({...calendarTemplate('RP2'),unidade_id:unit,revisao:'9007199254740997'});
const snapshot=():CalendarSnapshot=>({unidade:{id:unit,codigo:'TEST-A',nome:'Unidade sintética'},calendario:config(),pode_editar:true});
const save=()=>({...calendarTemplate('RP1'),revisao:null,motivo:'Calendário sintético inicial'});
test('calendário valida modelos, limites/duplicidades/horários/capacidades sem coerção',()=>{
 assert.ok(isCalendarInput(calendarTemplate('RP1')));assert.ok(isCalendarSave(save()));
 for(const patch of [{dias_semana:[1,1]},{dias_semana:['1']},{dias_semana:[7]},{atende_feriados:'false'},{refeicoes:[{tipo:'ALMOCO',inicio:'14:00',fim:'11:00',capacidade:null}]},{refeicoes:[{tipo:'ALMOCO',inicio:'11:00',fim:'14:00',capacidade:'1'}]},{excecoes:[{data:'2027-02-30',tipo:'FECHADO',descricao:'Inválida',refeicoes:[]}]},{excecoes:[{data:'2027-01-01',tipo:'ESPECIAL',descricao:'Sem refeições',refeicoes:[]}]}])assert.equal(isCalendarInput({...calendarTemplate('RP2'),...patch}),false);
 assert.equal(isCalendarSave({...save(),ator_id:'alheio'}),false);assert.equal(isCalendarSave({...save(),revisao:1}),false);
});
test('resolução por data aplica semana/feriado/fechamento/especial e ausente sem presumir refeições',()=>{
 assert.equal(resolveCalendar(null,'2026-11-16').origem,'NAO_CONFIGURADO');const c=config();assert.equal(resolveCalendar(c,'2026-11-16').aberto,true);assert.equal(resolveCalendar(c,'2026-11-15').aberto,false);
 c.excecoes=[{data:'2026-11-16',tipo:'FERIADO',descricao:'Feriado',refeicoes:[]}];assert.equal(resolveCalendar(c,'2026-11-16').aberto,false);c.atende_feriados=true;assert.equal(resolveCalendar(c,'2026-11-16').aberto,true);
 c.excecoes=[{data:'2026-11-16',tipo:'FECHADO',descricao:'Fechado',refeicoes:[]}];assert.equal(resolveCalendar(c,'2026-11-16').aberto,false);
 c.excecoes=[{data:'2026-11-15',tipo:'ESPECIAL',descricao:'Domingo especial',refeicoes:[{tipo:'JANTAR',inicio:'18:00',fim:'20:00',capacidade:50}]}];const special=resolveCalendar(c,'2026-11-15');assert.equal(special.refeicoes[0]!.capacidade,50);assert.equal(special.origem,'ESPECIAL');special.refeicoes[0]!.inicio='00:00';assert.equal(c.excecoes[0]!.refeicoes[0]!.inicio,'18:00');assert.throws(()=>resolveCalendar(c,'2026-02-30'));
 const rp1={...calendarTemplate('RP1'),unidade_id:unit,revisao:'1'};assert.equal(resolveCalendar(rp1,'2026-11-15').refeicoes.length,3);
});
function appFixture(error?:ApiError){const calls:unknown[]=[];const app=createApp(undefined,undefined,undefined,undefined,undefined,undefined,(_env,token)=>({async authenticate(){assert.equal(token,'sessao');calls.push('auth');},repository:{async read(u){if(error)throw error;calls.push(['read',u]);return snapshot();},async save(u,input){if(error)throw error;calls.push(['save',u,input]);return snapshot();}}}));return{app,calls};}
const request=(path='',method='GET',body?:unknown)=>new Request(base+path,{method,headers:{Authorization:'Bearer sessao',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('calendário HTTP exige sessão, valida ID/query/método/corpo e encaminha revisão textual',async()=>{
 const {app,calls}=appFixture();assert.equal((await app.fetch(new Request(base))).status,401);assert.equal(calls.length,0);
 assert.equal((await app.fetch(request('','PUT',save()))).status,200);assert.deepEqual(calls[1],['save',unit,save()]);
 for(const body of [{...save(),ator:'qualquer'},{...save(),motivo:'x'},{...save(),revisao:1}])assert.equal((await app.fetch(request('','PUT',body))).status,422);
 for(const path of ['/funcionamento?data=2026-02-30','/funcionamento?data=2026-11-16&data=2026-11-17','?q=x'])assert.equal((await app.fetch(request(path))).status,400);
 const day=await(await app.fetch(request('/funcionamento?data=2026-11-15'))).json() as {funcionamento:{aberto:boolean}};assert.equal(day.funcionamento.aberto,false);
 assert.equal((await app.fetch(request('/funcionamento','PUT',save()))).status,405);assert.equal((await app.fetch(request('','DELETE',{}))).status,405);
 for(const status of [403,404,412,503])assert.equal((await appFixture(new ApiError(status,'TEST','Negado')).app.fetch(request())).status,status);
});
const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',created_at:'2026-11-16T00:00:00Z',app_metadata:{},user_metadata:{}};
function transport(result:unknown=snapshot(),code?:string,anonymous=false){const calls:{path:string;body:unknown;authorization:string|null;profile:string|null}[]=[];const fetcher:typeof fetch=async(target,init)=>{const url=new URL(String(target)),headers=new Headers(init?.headers);calls.push({path:url.pathname,body:init?.body?JSON.parse(String(init.body)):null,authorization:headers.get('Authorization'),profile:headers.get('Content-Profile')});return url.pathname==='/auth/v1/user'?Response.json({...user,...(anonymous?{is_anonymous:true}:{})}):code?Response.json({code,message:'Detalhe SQL privado'},{status:400}):Response.json(result);};return{calls,fetcher};}
test('calendário SDK autentica antes da RPC, preserva bigint e limpa metadados',async()=>{
 const t=transport({...snapshot(),unidade:{...snapshot().unidade,email:'interno'},segredo:'privado'}),session=calendarSession(env,'sessao',t.fetcher);await session.authenticate();const result=await session.repository.save(unit,save());assert.equal(result.unidade.id,unit);assert.equal(Object.hasOwn(result.unidade,'email'),false);assert.equal(Object.hasOwn(result,'segredo'),false);assert.deepEqual(t.calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/calendario_operacao']);assert.equal(t.calls[1]!.authorization,'Bearer sessao');assert.equal(t.calls[1]!.profile,'erp');assert.deepEqual(t.calls[1]!.body,{p_unidade:unit,p_acao:'salvar',p_dados:save()});
});
test('calendário SDK nega anônimo/chave administrativa e resposta inconsistente sem expor SQL',async()=>{
 const anon=transport(undefined,undefined,true);await assert.rejects(()=>calendarSession(env,'sessao',anon.fetcher).authenticate(),e=>e instanceof ApiError&&e.status===401);assert.equal(anon.calls.length,1);
 assert.throws(()=>calendarSession({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_nao_permitida'},'sessao'),e=>e instanceof ApiError&&e.status===503);
 for(const [code,status] of [['PT403',403],['PT404',404],['PT412',412],['PT422',422],['55P03',503]] as const){const t=transport(null,code);await assert.rejects(()=>calendarSession(env,'sessao',t.fetcher).repository.read(unit),e=>e instanceof ApiError&&e.status===status&&!e.message.includes('SQL'));}
 const invalid=transport({...snapshot(),calendario:{...config(),unidade_id:'2'}});await assert.rejects(()=>calendarSession(env,'sessao',invalid.fetcher).repository.read(unit),e=>e instanceof ApiError&&e.status===503);
});
