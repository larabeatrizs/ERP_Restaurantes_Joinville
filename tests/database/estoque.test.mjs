import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

let db, close;
const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = (n = 1) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-01-02';
const product = (extra = {}) => ({ descricao: 'Arroz agulhinha', complemento: '', unidade_medida_id: '1', categoria_id: '1', perecivel: false, armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Saco de 5 kg', quantidade_apresentacao: '5', estoque_minimo: '10', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO', ...extra });
const line = (id, extra = {}) => ({ produto_id: id, quantidade: '20', valor_unitario: '2.75', numero_lote: 'LOTE-SINTETICO', validade: null, camara_id: '1', temperatura: null, aspecto_embalagem: 'Íntegra', conformidade: 'CONFORME', motivo: '', ...extra });
const receipt = (id, extra = {}) => ({ data_entrada: date, fornecedor_id: '1', numero_nf: 'NF-SINTETICA-001', total_nota: '55', observacoes: '', itens: [line(id)], ...extra });

before(async () => {
  if (process.env.DATABASE_STOCK_TEST_URL) {
    const target = new URL(process.env.DATABASE_STOCK_TEST_URL);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/erp_stock_test') throw Error('Somente banco descartável local erp_stock_test.');
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect(); db = { exec: (sql) => client.query(sql), query: (sql, args) => client.query(sql, args) }; close = () => client.end();
  } else { db = new PGlite(); close = () => db.close(); }
  await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  const root = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(root)).filter((name) => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, root), 'utf8'));
  await db.exec(`
    insert into auth.users(id) values ${[1, 2, 3, 4, 5, 6, 7].map((n) => `('${uid(n)}')`).join(',')};
    insert into erp.perfil(codigo) values ('ESTOQUISTA'),('GESTOR_UNIDADE'),('AUDITOR'),('NUTRICIONISTA');
    insert into erp.perfil_permissao(perfil_id,permissao) values
      (1,'PRODUTO_LER'),(1,'PRODUTO_GERIR'),(1,'ESTOQUE_LER'),(1,'RECEBIMENTO_GERIR'),
      (2,'PRODUTO_LER'),(2,'PRODUTO_GERIR'),(2,'PRODUTO_CICLO_VIDA'),(2,'CALENDARIO_EDITAR'),(4,'CALENDARIO_EDITAR'),(3,'CONFIGURACAO_LER'),(2,'ESTOQUE_LER'),(2,'RECEBIMENTO_APROVAR_DIVERGENCIA'),
      (1,'FORNECEDOR_EDITAR'),(2,'FORNECEDOR_EDITAR'),(2,'FORNECEDOR_CICLO_VIDA'),(1,'MEDIDA_EDITAR'),(2,'MEDIDA_EDITAR'),(2,'MEDIDA_CICLO_VIDA'),(1,'CATEGORIA_EDITAR'),(2,'CATEGORIA_EDITAR'),(2,'CATEGORIA_CICLO_VIDA'),(3,'PRODUTO_LER'),(3,'ESTOQUE_LER'),(4,'CONFIGURACAO_EDITAR');
    insert into erp.usuario(id,perfil_id,nome,status) values
      ('${uid(1)}',1,'Estoquista sintético A','ATIVO'),('${uid(2)}',1,'Estoquista sintético B','ATIVO'),
      ('${uid(3)}',3,'Leitor sintético A','ATIVO'),('${uid(4)}',2,'Gestor sintético A','ATIVO'),
      ('${uid(5)}',1,'Inativo sintético','INATIVO'),('${uid(6)}',1,'Sem vínculo sintético','ATIVO'),('${uid(7)}',4,'Só configurações sintético','ATIVO');
    insert into erp.unidade(codigo,nome) values ('TEST-STOCK-A','Unidade sintética A'),('TEST-STOCK-B','Unidade sintética B');
    insert into erp.usuario_unidade values ('${uid(1)}',1),('${uid(2)}',2),('${uid(3)}',1),('${uid(4)}',1),('${uid(5)}',1),('${uid(7)}',1);
    insert into erp.unidade_medida(sigla,descricao,grandeza) values ('KG','Quilograma','MASSA'),('UN','Unidade','CONTAGEM');
    insert into erp.categoria(descricao) values ('Mercearia');
    insert into erp.fornecedor(razao_social,cnpj_cpf) values ('Fornecedor sintético','11222333000181');
    insert into erp.camara(unidade_id,nome,tipo) values (1,'Almoxarifado A','SECO'),(2,'Almoxarifado B','SECO'),(1,'Congelada A','CONGELADO');
  `);
});
after(async () => { if (close) await close(); });

async function withdrawal(action, data = {}, unit = 1, client = db) {
 return (await client.query('select erp.requisicao_operacao($1,$2,$3::jsonb) result', [unit, action, JSON.stringify(data)])).rows[0].result;
}
async function withdrawalReject(action, data, code = 'PT422', unit = 1) {
 await db.exec('savepoint withdrawal_error');
 await assert.rejects(() => withdrawal(action, data, unit), { code });
 await db.exec('rollback to savepoint withdrawal_error');
}
async function withdrawalSetup() {
 await db.exec('reset role');
 await db.exec(`insert into erp.perfil_permissao(perfil_id,permissao) values (1,'REQUISICAO_REGISTRAR'),(2,'REQUISICAO_CONFERIR'),(4,'REQUISICAO_CONFERIR') on conflict do nothing`);
 await db.exec("insert into erp.parametro_unidade(unidade_id,modo_saida,motivo_alteracao) values (1,'POSTERIOR','Preparação sintética de retirada') on conflict do nothing");
 await become(1);
}
const withdrawalInput = (produto_id, extra = {}) => ({ produto_id, quantidade: '5', retirado_por: 'Pessoa sintética da cozinha', chave: key(800), ...extra });
const reviewInput = (r, extra = {}) => ({ id: r.id, revisao: r.revisao, estado: 'CONFERIDA', motivo: '', ...extra });

test('EST-002 FEFO divide lotes, ignora vencidos, desempata por ID e preserva entradas', async () => actor(1, async () => {
 await withdrawalSetup();const p = await create();
 const dates = (await db.query("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date::text today, ((clock_timestamp() at time zone 'America/Sao_Paulo')::date+1)::text tomorrow")).rows[0];
 const e = await receive(p.id, { total_nota: null, itens: [line(p.id,{quantidade:'1',validade:dates.tomorrow}),line(p.id,{quantidade:'2',validade:dates.today}),line(p.id,{quantidade:'3',validade:dates.today}),line(p.id,{quantidade:'9',validade:'2026-01-03'}),line(p.id,{quantidade:'8'})] });
 await confirm(e.id);const before = await rpc('entradas');
 const r = (await withdrawal('registrar', withdrawalInput(p.id))).requisicao;
 assert.equal(r.estado,'REGISTRADA');assert.equal(r.data_movimento,dates.today);assert.equal(r.quantidade,'5.000000');
 const balances = (await rpc('saldos')).saldos;
 const today = balances.filter(b=>b.validade===dates.today);assert.equal(today.length,2);assert.ok(today.every(b=>b.quantidade==='0.000000'));
 assert.equal(balances.find(b=>b.validade===dates.tomorrow).quantidade,'1.000000');
 assert.equal(balances.find(b=>b.validade==='2026-01-03').quantidade,'9.000000');
 assert.equal(balances.find(b=>b.validade===null).quantidade,'8.000000');
 assert.equal(r.itens.length,2);assert.equal(r.itens[0].quantidade,'2.000000');assert.equal(r.itens[1].quantidade,'3.000000');
 assert.deepEqual(await rpc('entradas'),before);
 await db.exec('reset role');
 const ledger = (await db.query('select quantidade_delta::text q,entrada_item_id from erp.movimento_estoque where requisicao_item_id is not null order by id')).rows;
 assert.deepEqual(ledger.map(x=>x.q),['-2.000000','-3.000000']);assert.ok(ledger.every(x=>x.entrada_item_id===null));
}));
test('EST-002 soma decimal exata, chave repetida baixa uma vez e chave alterada é conflito', async () => actor(1, async () => {
 await withdrawalSetup();const p = await create();await confirm((await receive(p.id,{total_nota:null,itens:[line(p.id,{quantidade:'0.3'})]})).id);
 const body=withdrawalInput(p.id,{quantidade:'0.1'}), first=await withdrawal('registrar',body);
 assert.deepEqual(await withdrawal('registrar',body),first);
 await withdrawalReject('registrar',{...body,quantidade:'0.2'},'PT409');
 await withdrawal('registrar',{...body,quantidade:'0.2',chave:key(801)});
 assert.equal((await rpc('saldos')).saldos[0].quantidade,'0.000000');
 await withdrawalReject('registrar',{...body,quantidade:'0.000001',chave:key(802)},'PT409');
 assert.equal((await withdrawal('listar')).requisicoes.length,2);
}));
test('EST-002 insuficiência e falha de auditoria revertem documento, itens, saldo e idempotência', async () => actor(1, async () => {
 await withdrawalSetup();const p=await create();await confirm((await receive(p.id)).id);
 const initial=await rpc('saldos');await withdrawalReject('registrar',withdrawalInput(p.id,{quantidade:'21'}),'PT409');
 assert.deepEqual(await rpc('saldos'),initial);assert.equal((await withdrawal('listar')).requisicoes.length,0);
 await db.exec('reset role');
 await db.exec("create function erp_private.falha_requisicao() returns trigger language plpgsql as $$ begin if new.acao like 'requisicao_%' then raise exception 'Falha induzida';end if;return new;end $$;create trigger falha_requisicao before insert on erp.auditoria_estoque for each row execute function erp_private.falha_requisicao()");
 await become(1);await withdrawalReject('registrar',withdrawalInput(p.id),'P0001');
 assert.deepEqual(await rpc('saldos'),initial);assert.equal((await withdrawal('listar')).requisicoes.length,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from erp.requisicao_comando')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from erp.requisicao_item')).rows[0].n,0);
}));
test('EST-002 conferência distinta, revisão, contestação sem estorno e snapshot após mudar modo', async () => actor(1, async () => {
 await withdrawalSetup();const p=await create();await confirm((await receive(p.id)).id);
 const r=(await withdrawal('registrar',withdrawalInput(p.id))).requisicao, before=await rpc('saldos');
 await withdrawalReject('conferir',reviewInput(r),'PT403');
 await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(1,'REQUISICAO_CONFERIR')");await become(1);
 await withdrawalReject('conferir',reviewInput(r),'PT403');
 await db.exec('reset role');await db.exec("update erp.parametro_unidade set modo_saida='PREVIA',motivo_alteracao='Mudança posterior à retirada' where unidade_id=1");await become(1);
 await withdrawalReject('registrar',withdrawalInput(p.id,{chave:key(801)}),'PT409');
 await become(7);await withdrawalReject('conferir',reviewInput(r,{estado:'CONTESTADA',motivo:''}));
 const checked=(await withdrawal('conferir',reviewInput(r,{estado:'CONTESTADA',motivo:'Quantidade a revisar'}))).requisicao;
 assert.equal(checked.estado,'CONTESTADA');assert.equal(checked.revisao,'2');assert.equal(checked.modo_snapshot,'POSTERIOR');assert.equal(checked.configuracao_revisao,'1');
 await withdrawalReject('conferir',reviewInput(r),'PT412');await withdrawalReject('conferir',reviewInput(checked),'PT409');
 await become(1);assert.deepEqual(await rpc('saldos'),before);
 assert.equal((await withdrawal('registrar',withdrawalInput(p.id))).requisicao.estado,'REGISTRADA');
}));
test('EST-002 payload estrito, vínculo, produto/local inativos e leitura direta negados', async () => actor(1, async () => {
 await withdrawalSetup();const p=await create();await confirm((await receive(p.id)).id);const body=withdrawalInput(p.id);
 for(const extra of [{quantidade:5},{quantidade:'0'},{quantidade:'0.0000001'},{chave:'inválida'},{retirado_por:'\t\n'},{solicitante_id:uid(4)},{modo_snapshot:'POSTERIOR'},{data_movimento:'2026-01-02'},{unidade_id:'2'}])await withdrawalReject('registrar',{...body,...extra});
 await withdrawalReject('registrar',body,'PT404',2);
 await become(3);await withdrawalReject('registrar',body,'PT403');assert.equal((await withdrawal('listar')).requisicoes.length,0);
 await become(5);await withdrawalReject('listar',{},'PT404');await become(6);await withdrawalReject('listar',{},'PT404');
 await become(1);for(const table of ['requisicao_rapida','requisicao_item','requisicao_comando'])await sqlRejects(`select * from erp.${table}`);
 await db.exec('reset role');await db.exec("update erp.camara set status='INATIVO' where id=1");await become(1);await withdrawalReject('registrar',body,'PT409');
 await db.exec('reset role');await db.exec("update erp.camara set status='ATIVO' where id=1;update erp.produto set status='INATIVO' where id="+p.id);await become(1);await withdrawalReject('registrar',body,'PT422');
}));

const categoryInput = (extra = {}) => ({ descricao: 'Categoria CAD-003', tipo_item: 'ALIMENTO', armazenamento_padrao: 'SECO', dias_alerta_validade: null, ...extra });

test('EST-002 falha de auditoria na conferência preserva estado, revisão e saldo',async()=>actor(1,async()=>{
 await withdrawalSetup();const p=await create();await confirm((await receive(p.id)).id);
 const r=(await withdrawal('registrar',withdrawalInput(p.id))).requisicao,before=await rpc('saldos');
 await db.exec('reset role');await db.exec("create function erp_private.falha_conferencia() returns trigger language plpgsql as $$ begin if new.acao='requisicao_conferir' then raise exception 'Falha induzida';end if;return new;end $$;create trigger falha_conferencia before insert on erp.auditoria_estoque for each row execute function erp_private.falha_conferencia()");
 await become(4);await withdrawalReject('conferir',reviewInput(r),'P0001');
 assert.deepEqual((await withdrawal('listar')).requisicoes[0],r);await become(1);assert.deepEqual(await rpc('saldos'),before);
}));

test('EST-002 seed é idempotente, Cozinha registra sem estoquista e ADMIN não recebe escrita',async()=>actor(1,async()=>{
 await db.exec('reset role');
 await db.exec(`insert into erp.perfil(codigo) values('COZINHA'),('ADMIN');insert into auth.users(id) values('${uid(8)}');
 insert into erp.usuario(id,perfil_id,nome,status) select '${uid(8)}',id,'Cozinha sintética','ATIVO' from erp.perfil where codigo='COZINHA';insert into erp.usuario_unidade values('${uid(8)}',1)`);
 const migration=await readFile(new URL('../../supabase/migrations/20261117204005_requisicao_rapida_posterior.sql',import.meta.url),'utf8');
 const seed=migration.split('-- BEGIN WITHDRAWAL CAPABILITY SEED')[1].split('-- END WITHDRAWAL CAPABILITY SEED')[0];
 await db.exec(seed);await db.exec(seed);
 const kitchenSeed=(await readFile(new URL('../../supabase/seeds/perfil_cozinha.sql',import.meta.url),'utf8')).replace(/^begin;$/m,'').replace(/^commit;$/m,'');await db.exec(kitchenSeed);await db.exec(kitchenSeed);
 const permissions=(await db.query("select p.codigo,pp.permissao from erp.perfil p join erp.perfil_permissao pp on pp.perfil_id=p.id where pp.permissao like 'REQUISICAO_%' order by p.codigo,pp.permissao")).rows;
 assert.deepEqual(permissions,[{codigo:'COZINHA',permissao:'REQUISICAO_REGISTRAR'},{codigo:'ESTOQUISTA',permissao:'REQUISICAO_REGISTRAR'},{codigo:'GESTOR_UNIDADE',permissao:'REQUISICAO_CONFERIR'},{codigo:'NUTRICIONISTA',permissao:'REQUISICAO_CONFERIR'}]);
 await withdrawalSetup();const p=await create();await confirm((await receive(p.id)).id);await become(8);
 const r=(await withdrawal('registrar',withdrawalInput(p.id))).requisicao;assert.equal(r.solicitante_id,uid(8));assert.equal(r.retirado_por,'Pessoa sintética da cozinha');
 const panel=(await db.query('select erp.requisicao_painel(1) p')).rows[0].p;assert.equal(panel.pode_registrar,true);assert.equal(panel.pode_conferir,false);assert.equal(panel.usuario_id,uid(8));assert.equal(panel.requisicoes[0].id,r.id);assert.ok(panel.produtos.some(x=>x.id===p.id));
 await withdrawalReject('conferir',reviewInput(r),'PT403');
}));
test('EST-002 modo ausente e validade ausente em perecível bloqueiam; documento e livro são imutáveis',async()=>actor(1,async()=>{
 await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(1,'REQUISICAO_REGISTRAR') on conflict do nothing");await become(1);
 const p=await create();await confirm((await receive(p.id)).id);const body=withdrawalInput(p.id);
 await withdrawalReject('registrar',body,'PT409');await withdrawalSetup();
 await db.exec('reset role');await db.query('update erp.produto set perecivel=true where id=$1',[p.id]);await become(1);await withdrawalReject('registrar',body,'PT409');
 await db.exec('reset role');await db.query('update erp.produto set perecivel=false where id=$1',[p.id]);await become(1);
 const r=(await withdrawal('registrar',body)).requisicao;
 await db.exec('reset role');
 for(const sql of [`update erp.requisicao_rapida set quantidade=1 where id=${r.id}`,`delete from erp.requisicao_rapida where id=${r.id}`,`update erp.requisicao_item set quantidade=1 where requisicao_id=${r.id}`,`delete from erp.movimento_estoque where requisicao_item_id is not null`])await sqlRejects(sql);
 await become(4);const checked=(await withdrawal('conferir',reviewInput(r))).requisicao;assert.equal(checked.estado,'CONFERIDA');
 await db.exec('reset role');await sqlRejects(`update erp.requisicao_rapida set estado='CONTESTADA',revisao=revisao+1,motivo='Revisão indevida' where id=${r.id}`);
}));
const supplierInput=(extra={})=>({razao_social:'Fornecedor CAD005',cnpj_cpf:'12ABC34501DE35',nome_fantasia:null,contato:null,telefone:null,email:null,endereco:null,observacoes:null,tipo_fornecedor:null,condicao_pagamento:null,prazo_entrega_dias:0,pedido_minimo:'0.000001',agricultura_familiar:false,canal_preferido:null,...extra});
function supplierDocument(base){let result=base;for(let step=0;step<2;step++){let sum=0;for(let i=0;i<result.length;i++)sum+=(result.charCodeAt(i)-48)*(2+(result.length-1-i)%8);const mod=sum%11;result+=mod<2?'0':String(11-mod);}return result;}
async function supplier(action,data={},unit=1,client=db){return (await client.query('select erp.fornecedor_operacao($1,$2,$3::jsonb) as result',[unit,action,JSON.stringify(data)])).rows[0].result;}
async function supplierRejects(action,data,code='PT422',unit=1){await db.exec('savepoint supplier_error');await assert.rejects(()=>supplier(action,data,unit),{code});await db.exec('rollback to savepoint supplier_error');}
test('fornecedor: exemplo RFB/máscara, null/zero/precisão e compatibilidade de campos anteriores',async()=>actor(1,async()=>{
 const previous=(await supplier('listar',{q:'sintético',status:'ATIVO',ordem:'asc',offset:0})).fornecedores[0];assert.equal(previous.agricultura_familiar,null);
 let s=(await supplier('criar',supplierInput({cnpj_cpf:'12.abc.345/01de-35'}))).fornecedor;assert.equal(s.cnpj_cpf,'12ABC34501DE35');assert.equal(s.pedido_minimo,'0.000001');assert.equal(s.prazo_entrega_dias,0);assert.equal(s.agricultura_familiar,false);
 s=(await supplier('editar',{...supplierInput({nome_fantasia:'Nome fantasia',pedido_minimo:null,prazo_entrega_dias:null,agricultura_familiar:true}),id:s.id,revisao:s.revisao})).fornecedor;assert.equal(s.revisao,'2');assert.equal(s.pedido_minimo,null);
 await supplierRejects('editar',{...supplierInput(),id:s.id,revisao:'1'},'PT412');await become(2);assert.equal((await supplier('listar',{q:'fantasia',status:'ATIVO',ordem:'asc',offset:0},2)).fornecedores[0].id,s.id);
}));
test('fornecedor: unicidade de nome/documento e validação SQL sem coerção ou alteração parcial',async()=>actor(4,async()=>{
 await supplier('criar',supplierInput({razao_social:'Fornecedor  Especial'}));
 await supplierRejects('criar',supplierInput({razao_social:'FORNECEDOR ESPECIAL',cnpj_cpf:'12345678909'}),'PT409');
 await supplierRejects('criar',supplierInput({razao_social:'Outro nome',cnpj_cpf:'12.abc.345/01de-35'}),'PT409');
 for(const extra of [{cnpj_cpf:'12ABC34501DE36'},{cnpj_cpf:'11111111111'},{agricultura_familiar:null},{agricultura_familiar:'false'},{prazo_entrega_dias:'0'},{prazo_entrega_dias:-1},{prazo_entrega_dias:2147483648},{pedido_minimo:1},{pedido_minimo:'-1'},{pedido_minimo:'0.0000001'},{canal_preferido:['EMAIL']},{email:'invalido'},{contato:''},{status:'INATIVO'}])await supplierRejects('criar',supplierInput(extra));
 assert.equal((await supplier('listar',{q:'',status:'ATIVO',ordem:'asc',offset:0})).total,2);
}));
test('fornecedor: I sem X, leitura sem escrita, unidade alheia e DML direto negados',async()=>actor(1,async()=>{
 const s=(await supplier('criar',supplierInput())).fornecedor;
 await supplierRejects('status',{id:s.id,revisao:s.revisao,status:'INATIVO'},'PT403');await supplierRejects('excluir',{id:s.id,revisao:s.revisao},'PT403');
 await become(3);assert.deepEqual((await supplier('listar',{q:'',status:'ATIVO',ordem:'asc',offset:0})).capacidades,{editar:false,ciclo_vida:false});await supplierRejects('criar',supplierInput(),'PT403');await supplierRejects('listar',{q:'',status:'ATIVO',ordem:'asc',offset:0},'PT404',2);
 await db.exec('savepoint dml_supplier');await assert.rejects(()=>db.exec("update erp.fornecedor set razao_social='Indevido'"),{code:'42501'});await db.exec('rollback to savepoint dml_supplier');
}));
test('fornecedor: vínculos de outra unidade bloqueiam exclusão e inativo não aceita recebimento',async()=>actor(4,async()=>{
 let s=(await supplier('criar',supplierInput())).fornecedor;
 await become(2);const p=(await rpc('produto_salvar',product({descricao:'Fornecedor produto B'}),2)).produto;await rpc('entrada_criar',receipt(p.id,{fornecedor_id:s.id,itens:[line(p.id,{camara_id:'2'})]}),2);await become(4);
 await supplierRejects('excluir',{id:s.id,revisao:s.revisao},'PT409');s=(await supplier('status',{id:s.id,revisao:s.revisao,status:'INATIVO'})).fornecedor;
 await become(1);assert.ok(!(await rpc('contexto')).fornecedores.some(x=>x.id===s.id));await rejects('entrada_criar',receipt(p.id,{fornecedor_id:s.id}),'PT422');
 await become(4);const disposable=(await supplier('criar',supplierInput({razao_social:'Descartável',cnpj_cpf:'12345678909'}))).fornecedor;
 assert.deepEqual(await supplier('excluir',{id:disposable.id,revisao:disposable.revisao}),{excluida:true});
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from erp.auditoria_estoque where acao='fornecedor_excluir'")).rows[0].n,1);
}));
test('fornecedor: falha de auditoria reverte edição e exclusão',async()=>actor(4,async()=>{
 const s=(await supplier('criar',supplierInput())).fornecedor;await db.exec('reset role');await db.exec("create function erp_private.falha_fornecedor() returns trigger language plpgsql as $$ begin if new.acao in ('fornecedor_editar','fornecedor_excluir') then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_fornecedor before insert on erp.auditoria_estoque for each row execute function erp_private.falha_fornecedor()");await become(4);
 await supplierRejects('editar',{...supplierInput({nome_fantasia:'Não persistir'}),id:s.id,revisao:s.revisao},'P0001');await supplierRejects('excluir',{id:s.id,revisao:s.revisao},'P0001');assert.equal((await supplier('listar',{q:s.razao_social,status:'ATIVO',ordem:'asc',offset:0})).fornecedores[0].nome_fantasia,null);
}));
test('fornecedor: paginação/ordem e exportação integral respeitam a busca',async()=>actor(4,async()=>{
 for(let n=0;n<51;n++)await supplier('criar',supplierInput({razao_social:'Fornecedor CSV '+String(n).padStart(2,'0'),cnpj_cpf:supplierDocument('CAD005'+String(n).padStart(6,'0'))}));
 const query={q:'CSV',status:'ATIVO',ordem:'asc',offset:0};const first=await supplier('listar',query);assert.equal(first.total,51);assert.equal(first.fornecedores.length,50);
 assert.equal((await supplier('listar',{...query,offset:50})).fornecedores.length,1);const all=await supplier('exportar',{...query,ordem:'desc'});assert.equal(all.fornecedores.length,51);assert.equal(all.fornecedores[0].razao_social,'Fornecedor CSV 50');await supplierRejects('exportar',{...query,offset:50});
}));
const categoryQuery = (extra = {}) => ({ q: '', status: 'ATIVO', ordem: 'asc', offset: 0, ...extra });
const measureInput = (extra = {}) => ({sigla:'MG-TEST',descricao:'Medida CAD004',grandeza:'MASSA',fator_base:'0.000001',...extra});
async function measure(action,data={},unit=1,client=db){return (await client.query('select erp.medida_operacao($1,$2,$3::jsonb) as result',[unit,action,JSON.stringify(data)])).rows[0].result;}
async function measureRejects(action,data,code='PT422',unit=1){await db.exec('savepoint measure_error');await assert.rejects(()=>measure(action,data,unit),{code});await db.exec('rollback to savepoint measure_error');}
test('medidas: fator exato/null, busca por sigla e edição preservam produto e revisão',async()=>actor(1,async()=>{
 let m=(await measure('criar',measureInput())).medida;assert.equal(m.fator_base,'0.000001');assert.equal(m.status,'ATIVO');
 const p=await create({unidade_medida_id:m.id});assert.equal(p.unidade_medida_id,m.id);
 assert.equal((await measure('listar',categoryQuery({q:'mg-test'}))).medidas[0].id,m.id);
 m=(await measure('editar',{...measureInput({descricao:'Medida alterada',fator_base:null}),id:m.id,revisao:m.revisao})).medida;assert.equal(m.revisao,'2');assert.equal(m.fator_base,null);assert.equal(m.pode_excluir,false);
 assert.equal((await rpc('produtos')).produtos[0].quantidade_apresentacao,p.quantidade_apresentacao);
 await measureRejects('editar',{...measureInput(),id:m.id,revisao:'1'},'PT412');await become(2);assert.equal((await measure('listar',categoryQuery({q:'alterada'}),2)).medidas[0].id,m.id);
}));
test('medidas: descrição normalizada única e entrada sem coerção de fator/grandeza/sigla',async()=>actor(4,async()=>{
 await measure('criar',measureInput({descricao:'Massa  Especial'}));await measureRejects('criar',measureInput({descricao:'MASSA ESPECIAL'}),'PT409');
 for(const extra of [{fator_base:0.001},{fator_base:'0'},{fator_base:'-1'},{fator_base:'1e-3'},{fator_base:'0.0000001'},{fator_base:'1000000000000'},{grandeza:'OUTRA'},{sigla:''},{sigla:'\t'},{status:'INATIVO'},{ator_id:uid(1)}])await measureRejects('criar',measureInput(extra));
 const max=(await measure('criar',measureInput({descricao:'Fator limite',fator_base:'999999999999.999999'}))).medida;assert.equal(max.fator_base,'999999999999.999999');
}));
test('medidas: I distinto de X, vínculos globais, inativação/seleção e exclusão auditada',async()=>actor(1,async()=>{
 let m=(await measure('criar',measureInput())).medida;await measureRejects('status',{id:m.id,revisao:m.revisao,status:'INATIVO'},'PT403');
 await become(2);await rpc('produto_salvar',product({descricao:'Medida vinculada B',unidade_medida_id:m.id}),2);await become(4);
 await measureRejects('excluir',{id:m.id,revisao:m.revisao},'PT409');m=(await measure('status',{id:m.id,revisao:m.revisao,status:'INATIVO'})).medida;
 assert.ok(!(await rpc('contexto')).medidas.some(x=>x.id===m.id));assert.equal((await measure('listar',categoryQuery({status:'INATIVO'}))).medidas[0].id,m.id);
 const disposable=(await measure('criar',measureInput({descricao:'Medida sem vinculo'}))).medida;assert.deepEqual(await measure('excluir',{id:disposable.id,revisao:disposable.revisao}),{excluida:true});
 await become(3);assert.deepEqual((await measure('listar',categoryQuery())).capacidades,{editar:false,ciclo_vida:false});await measureRejects('criar',measureInput(),'PT403');await measureRejects('listar',categoryQuery(),'PT404',2);
}));
test('medidas: paginação/CSV completos, falha de auditoria e DML direto negado',async()=>actor(4,async()=>{
 for(let n=0;n<51;n++)await measure('criar',measureInput({sigla:'CSV',descricao:'Medida CSV '+String(n).padStart(2,'0')}));
 assert.equal((await measure('listar',categoryQuery({q:'Medida CSV'}))).medidas.length,50);assert.equal((await measure('listar',categoryQuery({q:'Medida CSV',offset:50}))).medidas.length,1);
 assert.equal((await measure('exportar',categoryQuery({q:'Medida CSV'}))).medidas.length,51);await measureRejects('exportar',categoryQuery({offset:1}));
 const m=(await measure('criar',measureInput())).medida;await db.exec('reset role');await db.exec("create function erp_private.falha_medida() returns trigger language plpgsql as $$ begin if new.acao in ('medida_editar','medida_excluir') then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_medida before insert on erp.auditoria_estoque for each row execute function erp_private.falha_medida()");await become(4);
 await measureRejects('editar',{...measureInput({sigla:'NOVO'}),id:m.id,revisao:m.revisao},'P0001');await measureRejects('excluir',{id:m.id,revisao:m.revisao},'P0001');assert.equal((await measure('listar',categoryQuery({q:m.descricao}))).medidas[0].sigla,m.sigla);
 await sqlRejects('delete from erp.unidade_medida');await sqlRejects("update erp.unidade_medida set fator_base=1");await sqlRejects('select erp_private.medida_json(1)');
}));
async function category(action, data = {}, unit = 1, client = db) { return (await client.query('select erp.categoria_operacao($1,$2,$3::jsonb) as result', [unit, action, JSON.stringify(data)])).rows[0].result; }
async function categoryRejects(action, data, code = 'PT422', unit = 1) { await db.exec('savepoint category_error'); await assert.rejects(() => category(action, data, unit), { code }); await db.exec('rollback to savepoint category_error'); }

test('categorias: criar/editar global preserva zero/null e usa revisão sem afetar produtos', async () => actor(1, async () => {
  let c = (await category('criar', categoryInput({ dias_alerta_validade: 0 }))).categoria;
  assert.equal(c.revisao, '1'); assert.equal(c.dias_alerta_validade, 0); assert.equal(c.status, 'ATIVO');
  const p = await create({ categoria_id: c.id });
  c = (await category('editar', { ...categoryInput({ descricao: 'Categoria alterada', armazenamento_padrao: 'CONGELADO' }), id: c.id, revisao: c.revisao })).categoria;
  assert.equal(c.revisao, '2'); assert.equal(c.dias_alerta_validade, null); assert.equal(c.pode_excluir, false);
  assert.equal((await rpc('produtos')).produtos[0].armazenamento, p.armazenamento);
  await categoryRejects('editar', { ...categoryInput(), id: c.id, revisao: '1' }, 'PT412');
  await become(2); assert.equal((await category('listar', categoryQuery({ q: 'ALTERADA' }), 2)).categorias[0].id, c.id);
}));
test('categorias: unicidade normalizada inclusive inativas e campos estritos', async () => actor(4, async () => {
  const c = (await category('criar', categoryInput({ descricao: ' Café   Novo ' }))).categoria;
  await category('status', { id: c.id, revisao: c.revisao, status: 'INATIVO' });
  await categoryRejects('criar', categoryInput({ descricao: 'cafe\u0301 novo' }), 'PT409');
  for (const extra of [{ descricao: '\t\n' }, { dias_alerta_validade: '0' }, { dias_alerta_validade: -1 }, { dias_alerta_validade: 1.5 }, { dias_alerta_validade: 2147483648 }, { tipo_item: 'OUTRO' }, { armazenamento_padrao: 'FRIO' }, { status: 'INATIVO' }, { ator_id: uid(1) }]) await categoryRejects('criar', categoryInput(extra));
  await categoryRejects('listar', categoryQuery({ ordem: 'sql' })); await categoryRejects('listar', categoryQuery({ offset: -1 }));
}));
test('categorias: leitura/edição/ciclo de vida separados, unidade/inativo/sem sessão negados', async () => actor(1, async () => {
  const c = (await category('criar', categoryInput())).categoria;
  await categoryRejects('status', { id: c.id, revisao: c.revisao, status: 'INATIVO' }, 'PT403');
  await categoryRejects('excluir', { id: c.id, revisao: c.revisao }, 'PT403');
  await become(3); assert.deepEqual((await category('listar', categoryQuery())).capacidades, { editar: false, ciclo_vida: false });
  await categoryRejects('criar', categoryInput(), 'PT403'); await categoryRejects('listar', categoryQuery(), 'PT404', 2);
  await become(5); await categoryRejects('listar', categoryQuery(), 'PT404');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',true)"); await db.exec('set local role authenticated');
  await categoryRejects('listar', categoryQuery(), 'PT404');
}));
test('categorias: inativação retira de seleção, vínculo global bloqueia exclusão e auditoria persiste', async () => actor(4, async () => {
  let c = (await category('criar', categoryInput())).categoria;
  await become(2); await rpc('produto_salvar', product({ descricao: 'Produto B categoria global', categoria_id: c.id }), 2);
  await become(4); await categoryRejects('excluir', { id: c.id, revisao: c.revisao }, 'PT409');
  c = (await category('status', { id: c.id, revisao: c.revisao, status: 'INATIVO' })).categoria;
  assert.ok(!(await rpc('contexto')).categorias.some(row => row.id === c.id));
  assert.equal((await category('listar', categoryQuery({ status: 'INATIVO' }))).categorias[0].id, c.id);
  assert.equal((await category('status', { id: c.id, revisao: c.revisao, status: 'INATIVO' })).categoria.revisao, c.revisao);
  c = (await category('status', { id: c.id, revisao: c.revisao, status: 'ATIVO' })).categoria;
  assert.ok((await rpc('contexto')).categorias.some(row => row.id === c.id));
  const unused = (await category('criar', categoryInput({ descricao: 'Sem vínculo' }))).categoria;
  assert.deepEqual(await category('excluir', { id: unused.id, revisao: unused.revisao }), { excluida: true });
  await db.exec('reset role'); const audit = (await db.query("select antes,depois from erp.auditoria_estoque where acao='categoria_excluir'")).rows[0];
  assert.equal(audit.antes.id, unused.id); assert.equal(audit.depois, null);
}));
test('categorias: paginação/ordenação/busca e exportação completa sem truncamento', async () => actor(4, async () => {
  for (let i = 0; i < 51; i++) await category('criar', categoryInput({ descricao: 'Página ' + String(i).padStart(2, '0') }));
  const first = await category('listar', categoryQuery({ q: 'PAGINA' })); assert.equal(first.total, 51); assert.equal(first.categorias.length, 50);
  assert.equal((await category('listar', categoryQuery({ q: 'pagina', offset: 50 }))).categorias.length, 1);
  assert.equal((await category('listar', categoryQuery({ q: 'pagina', ordem: 'desc' }))).categorias[0].descricao, 'Página 50');
  assert.equal((await category('exportar', categoryQuery({ q: 'pagina' }))).categorias.length, 51);
  await categoryRejects('exportar', categoryQuery({ offset: 1 }));
  await db.exec('reset role'); await db.exec("insert into erp.categoria(descricao) select 'Limite export '||n from generate_series(1,10001) n"); await become(4);
  await categoryRejects('exportar', categoryQuery({ q: 'Limite export' }), 'PT413');
}));
test('categorias: falha de auditoria desfaz edição/exclusão e DML direto é negado', async () => actor(4, async () => {
  const c = (await category('criar', categoryInput())).categoria;
  await db.exec('reset role'); await db.exec("create function erp_private.falha_categoria() returns trigger language plpgsql as $$ begin if new.acao in ('categoria_editar','categoria_excluir') then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_categoria before insert on erp.auditoria_estoque for each row execute function erp_private.falha_categoria()"); await become(4);
  await categoryRejects('editar', { ...categoryInput({ descricao: 'Não persistir' }), id: c.id, revisao: c.revisao }, 'P0001');
  await categoryRejects('excluir', { id: c.id, revisao: c.revisao }, 'P0001');
  assert.equal((await category('listar', categoryQuery({ q: c.descricao }))).categorias[0].revisao, c.revisao);
  await sqlRejects("update erp.categoria set descricao='Indevido'"); await sqlRejects('delete from erp.categoria');
  await sqlRejects('select erp_private.categoria_json(1)');
}));

const linkInput = (p, extra = {}) => ({ id: p.id, revisao: p.revisao, estoque_minimo: '5.000001', estoque_maximo: '20', ponto_reposicao: null, ...extra });
const calendarMeal=(extra={})=>({tipo:'ALMOCO',inicio:'11:00',fim:'14:00',capacidade:null,...extra});
const calendarInput=(extra={})=>({dias_semana:[1,2,3,4,5],atende_feriados:false,refeicoes:[calendarMeal()],excecoes:[],revisao:null,motivo:'Configuração sintética do calendário',...extra});
async function calendar(action,data={},unit=1,client=db){return(await client.query('select erp.calendario_operacao($1,$2,$3::jsonb) result',[unit,action,JSON.stringify(data)])).rows[0].result;}
async function calendarRejects(action,data,code='PT422',unit=1){await db.exec('savepoint calendar_error');await assert.rejects(()=>calendar(action,data,unit),{code});await db.exec('rollback to savepoint calendar_error');}
test('calendário: ausente é null, gestor/nutricionista salvam com revisão e auditoria',async()=>actor(4,async()=>{
 assert.equal((await calendar('ler')).calendario,null);const first=(await calendar('salvar',calendarInput())).calendario;assert.equal(first.revisao,'1');assert.deepEqual(first.dias_semana,[1,2,3,4,5]);assert.equal(first.refeicoes[0].capacidade,null);
 await become(7);const second=(await calendar('salvar',calendarInput({revisao:'1',atende_feriados:true}))).calendario;assert.equal(second.revisao,'2');await calendarRejects('salvar',calendarInput(),'PT412');await calendarRejects('salvar',calendarInput({revisao:'1'}),'PT412');
 await db.exec('reset role');const audit=(await db.query("select antes,depois from erp.auditoria_estoque where acao='calendario_salvar' order by id")).rows;assert.equal(audit.length,2);assert.equal(audit[0].antes,null);assert.equal(audit[1].depois.configuracao.revisao,'2');assert.ok(audit[1].depois.motivo);
}));
test('calendário: datas especiais estruturadas e normalizadas sem perder capacidade',async()=>actor(4,async()=>{
 const exceptions=[{data:'2027-01-01',tipo:'FERIADO',descricao:'Feriado sintético',refeicoes:[]},{data:'2027-01-02',tipo:'FECHADO',descricao:'Fechamento sintético',refeicoes:[]},{data:'2027-01-03',tipo:'ESPECIAL',descricao:'Evento sintético',refeicoes:[calendarMeal({inicio:'08:00',fim:'10:00',capacidade:2147483647})]}];
 const s=await calendar('salvar',calendarInput({excecoes:exceptions}));assert.deepEqual(s.calendario.excecoes,exceptions);assert.equal((await calendar('ler')).calendario.excecoes[2].refeicoes[0].capacidade,2147483647);
 await calendar('salvar',calendarInput({revisao:'1',excecoes:[]}));await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from erp.calendario_refeicao_especial')).rows[0].n,0);
}));
test('calendário: leitor sem escrita, unidade alheia, estoque sem leitura e DML/helpers negados',async()=>actor(3,async()=>{
 assert.equal((await calendar('ler')).pode_editar,false);await calendarRejects('salvar',calendarInput(),'PT403');await calendarRejects('ler',{},'PT404',2);await become(1);await calendarRejects('ler',{},'PT403');
 await sqlRejects('insert into erp.calendario_unidade values(1,1,false)');await sqlRejects('delete from erp.calendario_excecao');await sqlRejects('select erp_private.calendario_json(1)');
}));
test('calendário: validação estrita, duplicidades e filhos inválidos não deixam estado parcial',async()=>actor(4,async()=>{
 for(const extra of [{atende_feriados:'false'},{dias_semana:[1,1]},{dias_semana:['1']},{dias_semana:[7]},{revisao:1},{motivo:'x'},{ator_id:uid(1)},{refeicoes:[calendarMeal({inicio:'14:00',fim:'11:00'})]},{refeicoes:[calendarMeal({inicio:'24:00'})]},{refeicoes:[calendarMeal({capacidade:'100'})]},{refeicoes:[calendarMeal({capacidade:0})]},{refeicoes:[calendarMeal(),calendarMeal()]},{excecoes:[{data:'2027-02-30',tipo:'FECHADO',descricao:'Inválida',refeicoes:[]}]},{excecoes:[{data:'2027-01-01',tipo:'ESPECIAL',descricao:'Vazia',refeicoes:[]}]}]){await calendarRejects('salvar',calendarInput(extra));assert.equal((await calendar('ler')).calendario,null);}
}));
test('calendário: auditoria falha e reverte o agregado; estoque e usuários permanecem iguais',async()=>actor(4,async()=>{
 const p=await create();await calendar('salvar',calendarInput());await db.exec('reset role');await db.exec("create function erp_private.falha_calendario() returns trigger language plpgsql as $$ begin if new.acao='calendario_salvar' then raise exception 'Falha induzida';end if;return new;end $$;create trigger falha_calendario before insert on erp.auditoria_estoque for each row execute function erp_private.falha_calendario()");await become(4);
 await calendarRejects('salvar',calendarInput({revisao:'1',dias_semana:[],refeicoes:[]}),'P0001');assert.equal((await calendar('ler')).calendario.revisao,'1');assert.equal((await rpc('produtos')).produtos[0].id,p.id);assert.equal((await rpc('saldos')).saldos.length,0);
}));
test('calendário: RPC direta rejeita motivo/descrição de espaços ou tabulações sem criar agregado',async()=>actor(4,async()=>{
 for(const value of ['\t \t','\uFEFF\u00A0\t','\u2000\u2028\u3000']){
  await calendarRejects('salvar',calendarInput({motivo:value}));
  await calendarRejects('salvar',calendarInput({excecoes:[{data:'2027-01-01',tipo:'FECHADO',descricao:value,refeicoes:[]}]}));
 }
 assert.equal((await calendar('ler')).calendario,null);
}));

async function cycle(action,data,unit=1,client=db){return(await client.query('select erp.produto_ciclo_operacao($1,$2,$3::jsonb) result',[unit,action,JSON.stringify(data)])).rows[0].result;}
async function cycleRejects(action,data,code,unit=1){await db.exec('savepoint cycle_error');await assert.rejects(()=>cycle(action,data,unit),{code});await db.exec('rollback to savepoint cycle_error');}
test('produto ciclo: elegível remove apenas parâmetros locais/produto e conserva auditoria',async()=>actor(4,async()=>{
 const p=await create();assert.equal(p.pode_excluir,true);assert.equal(p.motivo_exclusao,null);
 assert.deepEqual(await cycle('excluir',{id:p.id,revisao:p.revisao}),{excluida:true});assert.equal((await rpc('produtos')).total,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from erp.produto_unidade where produto_id=$1',[p.id])).rows[0].n,0);
 const audit=(await db.query("select antes,depois from erp.auditoria_estoque where acao='produto_excluir'")).rows[0];assert.equal(audit.antes.id,p.id);assert.equal(audit.antes.estoque_minimo,p.estoque_minimo);assert.equal(audit.depois,null);
}));
test('produto ciclo: I não concede X e edição/criação antigas não contornam status',async()=>actor(1,async()=>{
 const p=await create();await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'PT403');await cycleRejects('status',{id:p.id,revisao:p.revisao,status:'INATIVO'},'PT403');
 await rejects('produto_salvar',product({id:p.id,revisao:p.revisao,status:'INATIVO'}),'PT403');await rejects('produto_salvar',product({descricao:'Inativo indevido',status:'INATIVO'}),'PT403');
 await become(3);await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'PT403');await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'PT404',2);
 await sqlRejects('delete from erp.produto');await sqlRejects('delete from erp.produto_unidade');await sqlRejects('select erp_private.produto_exclusao_motivo(1,1)');assert.equal((await db.query("select pg_has_role('authenticated','erp_product_reference_reader','MEMBER') member")).rows[0].member,false);
}));
test('produto ciclo: filial alheia bloqueia sem revelar seus dados e inativação é global',async()=>actor(1,async()=>{
 const p=await create();await become(2);await catalog('vincular',linkInput(p),2);await become(4);
 const listed=(await rpc('produtos')).produtos[0];assert.equal(listed.pode_excluir,false);assert.equal(listed.motivo_exclusao,'OUTRA_UNIDADE');assert.equal(JSON.stringify(listed).includes('Unidade sintética B'),false);
 await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'PT409');let current=(await cycle('status',{id:p.id,revisao:p.revisao,status:'INATIVO'})).produto;assert.equal((await rpc('produtos')).total,0);
 await become(2);assert.equal((await rpc('produtos',{},2)).total,0);assert.equal((await rpc('produtos',{status:'INATIVO'},2)).produtos[0].status,'INATIVO');await become(4);
 await cycleRejects('status',{id:p.id,revisao:p.revisao,status:'ATIVO'},'PT412');current=(await cycle('status',{id:p.id,revisao:current.revisao,status:'ATIVO'})).produto;assert.equal(current.status,'ATIVO');
}));
test('produto ciclo: rascunho/recusa bloqueia antes de movimentar e histórico persiste inativo',async()=>actor(1,async()=>{
 const p=await create();const e=(await rpc('entrada_criar',receipt(p.id,{itens:[line(p.id,{conformidade:'RECUSADO',motivo:'Avaria'})]}))).entrada;await become(4);
 assert.equal((await rpc('produtos')).produtos[0].motivo_exclusao,'VINCULADO');await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'PT409');await cycle('status',{id:p.id,revisao:p.revisao,status:'INATIVO'});
 assert.equal((await rpc('entradas')).entradas[0].id,e.id);assert.equal((await rpc('saldos')).saldos.length,0);
 for(const bad of [{id:p.id,revisao:1},{id:p.id,revisao:'2',ator_id:uid(1)},{id:p.id,revisao:'2',status:null}])await cycleRejects('status',bad,'PT422');
}));
test('produto ciclo: falha de auditoria reverte exclusão e status integralmente',async()=>actor(4,async()=>{
 const p=await create();await db.exec('reset role');await db.exec("create function erp_private.falha_ciclo() returns trigger language plpgsql as $$ begin if new.acao in ('produto_status','produto_excluir') then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_ciclo before insert on erp.auditoria_estoque for each row execute function erp_private.falha_ciclo()");await become(4);
 await cycleRejects('excluir',{id:p.id,revisao:p.revisao},'P0001');await cycleRejects('status',{id:p.id,revisao:p.revisao,status:'INATIVO'},'P0001');assert.equal((await rpc('produtos')).produtos[0].revisao,p.revisao);assert.equal((await rpc('produtos')).produtos[0].pode_excluir,true);
}));

async function become(n) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(n)]); await db.exec('set local role authenticated'); }
async function catalogRejects(action, data, code, unit = 2) {
 await db.exec('savepoint catalog_error');await assert.rejects(()=>catalog(action,data,unit),{code});await db.exec('rollback to savepoint catalog_error');
}

async function actor(n, callback, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [n === null ? '' : uid(n)]);
    if (role !== 'owner') await db.exec(`set local role ${role}`);
    await callback();
  } finally { await db.exec('rollback'); }
}
async function rpc(action, data = {}, unit = 1, client = db) {
  return (await client.query('select erp.estoque_operacao($1,$2,$3::jsonb) as result', [unit, action, JSON.stringify(data)])).rows[0].result;
}
async function rejects(action, data, code = 'PT422', unit = 1) {
  await db.exec('savepoint invalid');
  await assert.rejects(() => rpc(action, data, unit), { code });
  await db.exec('rollback to savepoint invalid');
}
async function sqlRejects(sql, code = '42501') {
  await db.exec('savepoint denied'); await assert.rejects(() => db.exec(sql), { code }); await db.exec('rollback to savepoint denied');
}
async function create(extra) { return (await rpc('produto_salvar', product(extra))).produto; }
async function catalog(action, data, unit = 1, client = db) {
  return (await client.query('select erp.catalogo_unidade($1,$2,$3::jsonb) as result', [unit, action, JSON.stringify(data)])).rows[0].result;
}
async function receive(id, extra) { return (await rpc('entrada_criar', receipt(id, extra))).entrada; }
async function confirm(id, n = 1) { return (await rpc('entrada_confirmar', { id, chave: key(n) })).entrada; }

test('RN-027 mês sem registro abre, fechamento bloqueia a competência e reabertura libera', async () => actor(1, async () => {
  const check = "select erp_private.estoque_periodo_exigir_aberto(1,'2026-11-30')";
  await sqlRejects(check);
  await db.exec('set local role erp_stock_writer');
  await db.exec(check);
  await sqlRejects("select erp_private.estoque_periodo_exigir_aberto(2,'2026-11-30')", 'PT404');
  await db.exec('reset role');
  await db.query(`insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)
    values(1,'2026-11-01','FECHADO',$1,'Fechamento sintético')`, [uid(4)]);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects(check, 'PT409');
  await db.exec("select erp_private.estoque_periodo_exigir_aberto(1,'2026-12-01')");
  await db.exec('reset role');
  await db.query(`insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)
    values(1,'2026-11-01','REABERTO',$1,'Reabertura sintética')`, [uid(4)]);
  await db.exec('set local role erp_stock_writer');
  await db.exec(check);
  await sqlRejects('delete from erp_private.estoque_periodo_evento');
}));

test('RN-027 impede novos créditos e débitos em mês fechado e preserva reenvios concluídos', async () => actor(1, async () => {
  await withdrawalSetup();
  const p = await create();
  const first = await receive(p.id);
  const confirmed = await confirm(first.id);
  const draft = await receive(p.id, { numero_nf: 'NF-SINTETICA-002' });
  const withdrawalBody = withdrawalInput(p.id);
  const recorded = await withdrawal('registrar', withdrawalBody);

  await db.exec('reset role');
  await db.query(`insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)
    select 1, mes, 'FECHADO', $1, 'Fechamento sintético'
    from (select date_trunc('month',data_entrada)::date as mes from erp.entrada where id=$2
      union select date_trunc('month',data_movimento)::date from erp.requisicao_rapida where unidade_id=1) meses`,
    [uid(4), first.id]);
  await become(1);

  assert.deepEqual(await confirm(first.id), confirmed);
  assert.deepEqual(await withdrawal('registrar', withdrawalBody), recorded);
  await rejects('entrada_confirmar', { id: draft.id, chave: key(2) }, 'PT409');
  await withdrawalReject('registrar', { ...withdrawalBody, chave: key(802) }, 'PT409');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n, 2);
  assert.equal((await db.query('select estado from erp.entrada where id=$1', [draft.id])).rows[0].estado, 'RASCUNHO');
}));

test('RF-007 configura motivos e substituto com revisão, segregação e trilha', async () => actor(1, async () => {
  await sqlRejects('select erp.perda_configuracao(null)', 'PT403');
  await db.exec("reset role; update erp.unidade set codigo='RP-BUCAREIN' where id=1");
  await db.exec("insert into erp.perfil(codigo) values('ADMIN') on conflict do nothing");
  await db.exec("insert into erp.perfil_permissao select id,'USUARIO_GERIR' from erp.perfil where codigo='ADMIN' on conflict do nothing");
  await db.query("update erp.usuario set perfil_id=(select id from erp.perfil where codigo='ADMIN') where id=$1", [uid(3)]);
  await become(3);
  const configure = async (value = null) => (await db.query(
    'select erp.perda_configuracao($1::jsonb) as resultado', [value === null ? null : JSON.stringify(value)],
  )).rows[0].resultado;
  const initial = await configure();
  assert.equal(initial.revisao, '0');
  assert.deepEqual(initial.gestores.map(row => row.id), [uid(4)]);
  const createReason = { acao: 'motivo', revisao: initial.revisao, id: null, descricao: 'Avaria', exige_anexo: true, ativo: true };
  const created = await configure(createReason);
  assert.equal(created.motivos[0].exige_anexo, true);
  const edited = await configure({ ...createReason, revisao: created.revisao, id: created.motivos[0].id, ativo: false });
  assert.equal(edited.motivos[0].ativo, false);
  await sqlRejects(`select erp.perda_configuracao('${JSON.stringify(createReason)}')`, 'PT409');
  await sqlRejects(`select erp.perda_configuracao('{"acao":"substituto","revisao":"${edited.revisao}","usuario_id":"${uid(7)}"}')`, 'PT422');
  const designated = await configure({ acao: 'substituto', revisao: edited.revisao, usuario_id: uid(4) });
  assert.equal(designated.substituto, uid(4));
  const removed = await configure({ acao: 'substituto', revisao: designated.revisao, usuario_id: null });
  assert.equal(removed.substituto, null);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select acao from erp_private.perda_configuracao_evento order by id')).rows.map(row => row.acao),
    ['motivo', 'motivo', 'substituto', 'substituto']);
}));

test('RF-015 lança vários lotes com rollback integral e reenvio pela mesma chave', async () => actor(1, async () => {
  const product = await create();
  await confirm((await receive(product.id, { total_nota: null, itens: [
    line(product.id, { numero_lote: 'LOTE-A', valor_unitario: '8' }),
    line(product.id, { numero_lote: 'LOTE-B', valor_unitario: '2' }),
  ] })).id);
  const positions = (await rpc('saldos')).saldos.sort((a, b) => Number(a.lote_id) - Number(b.lote_id));
  assert.equal(positions.length, 2);
  await db.exec("reset role; update erp.unidade set codigo='RP-BUCAREIN' where id=1");
  const reason = (await db.query("insert into erp_private.perda_motivo(descricao,exige_anexo) values('Queda de energia',true) returning id::text")).rows[0].id;
  await become(1);
  const input = { camara_id: positions[0].camara_id, data_registro: date, motivo_id: reason,
    justificativa: 'Falha sintética', chave: key(950), itens: positions.map(row => ({ lote_id: row.lote_id, quantidade: '5' })),
    anexo: { mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVYQAAAAASUVORK5CYII=' },
  };
  const register = async value => (await db.query(
    'select erp.perda_registrar_lote(1,$1::jsonb) as resultado', [JSON.stringify(value)],
  )).rows[0].resultado;
  await sqlRejects(`select erp.perda_registrar_lote(1,'${JSON.stringify({ ...input, itens: [input.itens[0], { ...input.itens[1], quantidade: '21' }] })}')`, 'PT409');
  await db.exec('reset role');
  for (const table of ['perda_estoque', 'perda_lote_comando', 'perda_anexo']) {
    assert.equal((await db.query(`select count(*)::int as total from erp_private.${table}`)).rows[0].total, 0);
  }
  assert.equal((await db.query("select count(*)::int as total from erp.auditoria_estoque where acao='perda_registrar'")).rows[0].total, 0);
  await become(1);
  const result = await register(input);
  assert.equal(result.ids.length, 2);
  assert.deepEqual(await register({ ...input, itens: [...input.itens].reverse() }), result);
  await sqlRejects(`select erp.perda_registrar_lote(1,'${JSON.stringify({ ...input, justificativa: 'Outro evento' })}')`, 'PT409');
  await sqlRejects(`select erp.perda_registrar_lote(1,'${JSON.stringify({ ...input, itens: [input.itens[0], input.itens[0]] })}')`, 'PT422');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select estado,valor_prejuizo::text from erp_private.perda_estoque order by lote_id')).rows,
    [{ estado: 'PENDENTE', valor_prejuizo: '40.000000000000' }, { estado: 'PENDENTE', valor_prejuizo: '10.000000000000' }]);
  assert.equal((await db.query('select sum(quantidade)::text as total from erp.saldo_lote_local')).rows[0].total, '40.000000');
  assert.equal((await db.query('select count(*)::int as total from erp_private.perda_anexo')).rows[0].total, 2);
}));

test('RF-015 registra, revisa e reflete a baixa única no extrato', async () => actor(1, async () => {
  const p = await create();
  await confirm((await receive(p.id, { total_nota: null, itens: [line(p.id, { valor_unitario: '8' })] })).id);
  const position = (await rpc('saldos')).saldos[0];
  await db.exec("reset role; update erp.unidade set codigo='RP-BUCAREIN' where id=1");
  const { rows: reasons } = await db.query("insert into erp_private.perda_motivo(descricao,exige_anexo) values('Validade vencida',false),('Com anexo',true) returning id::text,exige_anexo");
  const reasonId = reasons.find(row => !row.exige_anexo).id;
  const attachmentReasonId = reasons.find(row => row.exige_anexo).id;
  await db.query('insert into erp_private.usuario_acesso_periodo values($1,1,true,false)', [uid(4)]);
  await become(1);
  const input = { lote_id: position.lote_id, camara_id: position.camara_id, data_registro: date,
    quantidade: '5', motivo_id: reasonId, justificativa: '', chave: key(900) };
  const register = async value => (await db.query("select erp_private.perda_registrar_pendente(1,$1::jsonb)::text as id", [JSON.stringify(value)])).rows[0].id;
  const web = async (value, unit = 1) => (await db.query(
    'select erp.perda_registro_web($1,$2::jsonb) as result', [unit, value === null ? null : JSON.stringify(value)],
  )).rows[0].result;
  const context = await web(null);
  assert.equal(context.unidade_id, '1');
  assert.deepEqual(context.motivos, [
    { id: attachmentReasonId, descricao: 'Com anexo', exige_anexo: true },
    { id: reasonId, descricao: 'Validade vencida', exige_anexo: false },
  ]);
  assert.deepEqual(context.posicoes.map(row => [row.lote_id, row.camara_id, row.quantidade]), [
    [input.lote_id, input.camara_id, '20.000000'],
  ]);
  await sqlRejects('select erp.perda_registro_web(2,null)', 'PT404');
  await become(7);
  await sqlRejects('select erp.perda_registro_web(1,null)', 'PT403');
  await become(1);
  const { id } = await web(input);
  assert.deepEqual(await web(input), { id });
  await db.exec('savepoint loss_auth');
  await assert.rejects(() => register(input), { code: '42501' });
  await db.exec('rollback to savepoint loss_auth');
  await db.exec('set local role erp_stock_writer');
  assert.equal(await register(input), id);
  const invalid = [
    [{ ...input, quantidade: '4' }, 'PT409'],
    [{ ...input, quantidade: '21', chave: key(901) }, 'PT409'],
    [{ ...input, motivo_id: attachmentReasonId, chave: key(902) }, 'PT422'],
  ];
  for (const [value, code] of invalid) {
    await db.exec('savepoint loss_invalid');
    await assert.rejects(() => register(value), { code });
    await db.exec('rollback to savepoint loss_invalid');
  }
  await become(4);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects("select erp_private.estoque_periodo_transicionar(1,'2026-01-01','FECHADO',null,'Fechamento sintético')", 'PT409');
  await db.exec('reset role');
  const losses = (await db.query('select estado,valor_prejuizo::text from erp_private.perda_estoque')).rows;
  assert.deepEqual(losses, [{ estado: 'PENDENTE', valor_prejuizo: '40.000000000000' }]);
  assert.equal((await db.query('select quantidade::text from erp.saldo_lote_local')).rows[0].quantidade, '20.000000');
  assert.equal((await db.query('select count(*)::int n from erp.movimento_estoque')).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from erp.auditoria_estoque where acao='perda_registrar'")).rows[0].n, 1);

  const review = (loss, decision) => `select erp_private.perda_revisar(1,${loss},'${decision}') as estado`;
  await become(7);
  await sqlRejects(review(id, 'APROVADA'), '42501');
  await become(4);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects(review(id, 'APROVADA'), 'PT403');

  await become(1);
  await db.exec('set local role erp_stock_writer');
  const photo = { mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVYQAAAAASUVORK5CYII=' };
  const withPhoto = { ...input, quantidade: '20', chave: key(903), motivo_id: attachmentReasonId, anexo: photo };
  const competing = await register(withPhoto);
  assert.equal(await register(withPhoto), competing);
  const otherPhoto = { ...photo, base64: photo.base64.replace('CYII', 'CXII') };
  await sqlRejects(`select erp_private.perda_registrar_pendente(1,'${JSON.stringify({ ...withPhoto, anexo: otherPhoto })}')`, 'PT409');
  await db.exec('reset role');
  await db.query('insert into erp_private.perda_substituto values(1,$1)', [uid(4)]);
  await db.query('update erp.usuario set perfil_id=4 where id=$1', [uid(1)]);
  await become(1);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects(review(id, 'APROVADA'), 'PT403');

  await db.exec("reset role; alter table erp.auditoria_estoque add constraint perda_auditoria_teste check (acao<>'perda_aprovar')");
  await become(7);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects(review(id, 'APROVADA'), '23514');
  await db.exec('reset role');
  assert.equal((await db.query('select estado from erp_private.perda_estoque where id=$1',[id])).rows[0].estado, 'PENDENTE');
  assert.equal((await db.query('select quantidade::text from erp.saldo_lote_local')).rows[0].quantidade, '20.000000');
  assert.equal((await db.query('select count(*)::int n from erp.movimento_estoque where perda_id is not null')).rows[0].n, 0);
  await db.exec('alter table erp.auditoria_estoque drop constraint perda_auditoria_teste');

  const panel = 'select erp.perda_painel(1,null,null) as painel';
  await become(1);
  assert.deepEqual((await db.query(panel)).rows[0].painel.perdas.map(row => row.id), []);
  await become(3);
  await sqlRejects(panel, 'PT403');
  await become(7);
  await sqlRejects('select erp.perda_painel(2,null,null)', 'PT404');
  const pendingRows = (await db.query(panel)).rows[0].painel.perdas;
  assert.deepEqual(pendingRows.map(row => row.id), [id, competing]);
  assert.deepEqual(pendingRows.map(row => row.tem_anexo), [false, true]);
  assert.deepEqual((await db.query('select erp.perda_anexo_consultar(1,$1) as foto', [competing])).rows[0].foto, photo);
  await sqlRejects(`select erp.perda_anexo_consultar(2,${competing})`, 'PT404');
  assert.equal(pendingRows[0].valor_prejuizo, '40.000000000000');
  assert.equal(pendingRows[0].motivo, 'Validade vencida');
  const approved = (await db.query("select erp.perda_painel(1,$1,'APROVADA') as resultado", [id])).rows[0].resultado;
  assert.deepEqual(approved, { id, estado: 'APROVADA' });
  assert.deepEqual((await db.query(panel)).rows[0].painel.perdas.map(row => row.id), [competing]);

  await become(7);
  await db.exec('set local role erp_stock_writer');
  assert.equal((await db.query(review(id, 'APROVADA'))).rows[0].estado, 'APROVADA');
  assert.equal((await db.query(review(id, 'APROVADA'))).rows[0].estado, 'APROVADA');
  await sqlRejects(review(id, 'REJEITADA'), 'PT409');
  await sqlRejects(review(competing, 'APROVADA'), 'PT409');
  await become(4);
  await db.exec('set local role erp_stock_writer');
  assert.equal((await db.query(review(competing, 'REJEITADA'))).rows[0].estado, 'REJEITADA');
  await db.exec("select erp_private.estoque_periodo_transicionar(1,'2026-01-01','FECHADO',null,'Fechamento sintético')");
  await become(7);
  await db.exec('set local role erp_stock_writer');
  assert.equal((await db.query(review(id, 'APROVADA'))).rows[0].estado, 'APROVADA');

  await become(4);
  const statement = (await db.query(
    "select erp.estoque_extrato(1,'exportar',$1::jsonb) as extrato",
    [JSON.stringify({ produto_id: p.id, tipo: 'PERDA' })],
  )).rows[0].extrato;
  assert.equal(statement.total, 1);
  assert.equal(statement.itens[0].tipo, 'PERDA');
  assert.equal(statement.itens[0].quantidade, '-5.000000');
  assert.equal(statement.itens[0].saldo_apos, '15.000000');
  const lossReport = async (inicio, periodicidade) => (await db.query(
    "select erp.estoque_perdas_relatorio(1,'listar',$1::jsonb) as resultado",
    [JSON.stringify({ inicio, periodicidade })],
  )).rows[0].resultado;
  const monthly = await lossReport('2026-01-01', 'mensal');
  assert.equal(monthly.prejuizo_atual, '40.000000000000');
  assert.equal(monthly.prejuizo_anterior, '0');
  assert.equal(monthly.inicio_anterior, '2025-12-01');
  assert.deepEqual(monthly.itens, [{
    motivo: 'Validade vencida', lote: position.lote, produto: position.produto,
    categoria: 'Mercearia', prejuizo: '40.000000000000',
  }]);
  const comparison = await lossReport('2026-02-01', 'mensal');
  assert.equal(comparison.prejuizo_atual, '0');
  assert.equal(comparison.prejuizo_anterior, '40.000000000000');
  assert.deepEqual(comparison.itens, []);
  assert.equal((await lossReport('2027-01-01', 'anual')).prejuizo_anterior, '40.000000000000');
  await sqlRejects(`select erp.estoque_perdas_relatorio(2,'listar','{"inicio":"2026-01-01","periodicidade":"mensal"}')`, 'PT404');
  await become(7);
  await sqlRejects(`select erp.estoque_perdas_relatorio(1,'listar','{"inicio":"2026-01-01","periodicidade":"mensal"}')`, 'PT403');
  await db.exec('reset role');
  const movement = (await db.query('select quantidade_delta::text, valor_unitario_snapshot::text from erp.movimento_estoque where perda_id is not null')).rows;
  assert.deepEqual(movement, [{ quantidade_delta: '-5.000000', valor_unitario_snapshot: '8.000000' }]);
  assert.equal((await db.query('select quantidade::text from erp.saldo_lote_local')).rows[0].quantidade, '15.000000');
  assert.equal((await db.query("select count(*)::int n from erp.auditoria_estoque where acao in ('perda_aprovar','perda_rejeitar')")).rows[0].n, 2);
}));

test('RN-027 exige resolver o rascunho da competência e bloqueia novos rascunhos após fechar', async () => actor(1, async () => {
  const p = await create();
  const pending = await receive(p.id);
  await receive(p.id, { data_entrada: '2025-12-31', numero_nf: 'NF-OUTRO-MES' });
  await db.exec('reset role');
  await db.query('insert into erp_private.usuario_acesso_periodo values($1,1,true,false)', [uid(4)]);
  await become(4);
  await db.exec('set local role erp_stock_writer');
  const closeMonth = "select erp_private.estoque_periodo_transicionar(1,'2026-01-01','FECHADO',null,'Fechamento sintético')";
  await sqlRejects(closeMonth, 'PT409');
  assert.equal((await db.query('select count(*)::int as n from erp_private.estoque_periodo_evento')).rows[0].n, 0);
  await become(1);
  await confirm(pending.id);
  await become(4);
  await db.exec('set local role erp_stock_writer');
  await db.exec(closeMonth);
  await become(1);
  await rejects('entrada_criar', receipt(p.id, { numero_nf: 'NF-NOVO-RASCUNHO' }), 'PT409');
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as n from erp.entrada where numero_nf='NF-NOVO-RASCUNHO'")).rows[0].n, 0);
}));

test('RN-027 exige acesso explícito e preserva a trilha de fechamento e reabertura', async () => actor(4, async () => {
  const closeMonth = "select erp_private.estoque_periodo_transicionar(1,'2026-11-01','FECHADO',null,'Fechamento sintético') id";
  await sqlRejects(closeMonth);
  await db.exec('set local role erp_stock_writer');
  await sqlRejects(closeMonth, 'PT403');
  await db.exec('reset role');
  await db.query("insert into erp_private.usuario_acesso_periodo values($1,1,true,true)", [uid(4)]);
  await db.exec('set local role erp_stock_writer');
  const closed = (await db.query(closeMonth)).rows[0].id;
  await sqlRejects(closeMonth, 'PT409');
  await sqlRejects(`select erp_private.estoque_periodo_transicionar(1,'2026-11-01','REABERTO',${closed},'Reabertura sintética')`, 'PT403');
  await sqlRejects("select erp_private.estoque_periodo_transicionar(2,'2026-11-01','FECHADO',null,'Outra unidade')", 'PT404');
  await db.exec("reset role; insert into erp.perfil(codigo) values('GESTOR_CENTRAL')");
  await db.query("update erp.usuario set perfil_id=(select id from erp.perfil where codigo='GESTOR_CENTRAL') where id=$1", [uid(4)]);
  await db.exec('set local role erp_stock_writer');
  await db.query("select erp_private.estoque_periodo_transicionar(1,'2026-11-01','REABERTO',$1,'Reabertura sintética')", [closed]);
  await db.exec("select erp_private.estoque_periodo_exigir_aberto(1,'2026-11-12')");
  await db.exec('reset role');
  const result = await db.query('select estado,ator_id,motivo from erp_private.estoque_periodo_evento order by id');
  assert.deepEqual(result.rows, [
    { estado: 'FECHADO', ator_id: uid(4), motivo: 'Fechamento sintético' },
    { estado: 'REABERTO', ator_id: uid(4), motivo: 'Reabertura sintética' },
  ]);
}));

test('RN-027 primeira gravação aguarda o fechamento e lê o estado após a trava', {
  skip: !process.env.DATABASE_STOCK_TEST_URL, timeout: 15000,
}, async () => {
  const closer = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  const writer = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  await Promise.all([closer.connect(), writer.connect()]);
  let pending;
  try {
    await closer.query('begin');
    await closer.query("insert into erp_private.usuario_acesso_periodo values($1,1,true,false)", [uid(4)]);
    await closer.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(4)]);
    await closer.query('set local role erp_stock_writer');
    await closer.query("select erp_private.estoque_periodo_transicionar(1,'2098-07-01','FECHADO',null,'Fechamento concorrente sintético')");
    await writer.query('begin');
    await writer.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
    await writer.query('set local role erp_stock_writer');
    pending = writer.query("select erp_private.estoque_periodo_exigir_aberto(1,'2098-07-31')")
      .then(() => null, error => error);
    const deadline = Date.now() + 3000;
    let waiting = false;
    while (!waiting && Date.now() < deadline) {
      waiting = (await closer.query('select pg_backend_pid()=any(pg_blocking_pids($1)) as waiting', [writer.processID])).rows[0].waiting;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(waiting, true);
    await closer.query('commit');
    assert.equal((await pending)?.code, 'PT409');
  } finally {
    await closer.query('rollback');
    if (pending) await pending;
    await writer.query('rollback');
    await closer.query("delete from erp_private.estoque_periodo_evento where unidade_id=1 and mes='2098-07-01'");
    await closer.query('delete from erp_private.usuario_acesso_periodo where usuario_id=$1 and unidade_id=1', [uid(4)]);
    await Promise.all([closer.end(), writer.end()]);
  }
});

test('RF-029 resolve condições atuais e envia cada tipo somente aos perfis da unidade', async () => actor(1, async () => {
  const p = await create();
  const dates = (await db.query(`select
    to_char((now() at time zone 'America/Sao_Paulo')::date - 1,'YYYY-MM-DD') as ontem,
    to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') as hoje`)).rows[0];
  await confirm((await receive(p.id, { total_nota: null, itens: [
    line(p.id, { quantidade: '5', numero_lote: 'ANTES', validade: dates.ontem }),
    line(p.id, { quantidade: '5', numero_lote: 'HOJE', validade: dates.hoje }),
  ] })).id);
  const types = async () => (await db.query("select erp.estoque_alertas(1,'listar','{}') as result"))
    .rows[0].result.alertas.map(alert => alert.tipo);
  assert.deepEqual(await types(), ['LOTE_A_VENCER', 'ESTOQUE_MINIMO']);
  await become(7);
  assert.deepEqual(await types(), ['ESTOQUE_MINIMO']);
  await become(4);
  assert.deepEqual(await types(), ['LOTE_VENCIDO', 'LOTE_A_VENCER']);
  await become(3);
  assert.deepEqual(await types(), []);
  await sqlRejects("select erp.estoque_alertas(2,'listar','{}')", 'PT404');
  await db.exec('reset role; update erp.produto_unidade set estoque_minimo=9 where unidade_id=1');
  await become(1);
  assert.deepEqual(await types(), ['LOTE_A_VENCER']);
}));

test('RF-027 herda prazo, preserva zero e consolida o saldo de um lote em dois locais', async () => actor(1, async () => {
  const p = await create();
  const { dias } = (await db.query(`select array(
    select to_char((now() at time zone 'America/Sao_Paulo')::date + d, 'YYYY-MM-DD')
    from unnest(array[-1,0,2,7,8,3]) d) as dias`)).rows[0];
  const codes = ['VENCIDO', 'HOJE', 'DOIS', 'LIMITE', 'FORA', 'SEM-SALDO', 'SEM-VALIDADE'];
  await confirm((await receive(p.id, { total_nota: null, itens: codes.map((code, index) =>
    line(p.id, { numero_lote: code, validade: dias[index] ?? null, quantidade: '5', valor_unitario: '8' })) })).id);
  await db.exec(`reset role;
    update erp.saldo_lote_local s set quantidade = case l.codigo when 'VENCIDO' then 2 else 0 end
      from erp.lote l where l.id = s.lote_id and l.codigo in ('VENCIDO','SEM-SALDO');
    insert into erp.saldo_lote_local(unidade_id,lote_id,camara_id,quantidade)
      select 1,id,3,3 from erp.lote where codigo='VENCIDO';`);
  const expiry = async () => (await db.query("select erp.estoque_vencimentos(1,'listar','{}') as result")).rows[0].result;
  await become(3);
  const fallback = await expiry();
  assert.equal(fallback.data_referencia, dias[1]);
  assert.deepEqual(fallback.lotes.map(lot => [lot.lote, lot.situacao]), [
    ['VENCIDO', 'VENCIDO'], ['HOJE', 'A_VENCER'], ['DOIS', 'A_VENCER'], ['LIMITE', 'A_VENCER'],
  ]);
  assert.equal(fallback.lotes[0].quantidade, '5.000000');
  assert.equal(fallback.lotes[0].valor_unitario, '8.000000');
  await db.exec("reset role; insert into erp.parametro_unidade(unidade_id,modo_saida,dias_alerta_validade,motivo_alteracao) values(1,'POSTERIOR',2,'Teste sintético')");
  await become(3);
  assert.deepEqual((await expiry()).lotes.map(lot => lot.lote), ['VENCIDO', 'HOJE', 'DOIS']);
  await db.exec('reset role; update erp.categoria set dias_alerta_validade=0 where id=1');
  await become(3);
  assert.deepEqual((await expiry()).lotes.map(lot => lot.lote), ['VENCIDO', 'HOJE']);
  await sqlRejects("select erp.estoque_vencimentos(2,'listar','{}')", 'PT404');
  await become(7);
  await sqlRejects("select erp.estoque_vencimentos(1,'listar','{}')", 'PT403');
}));

async function ledger(action, filters, unit = 1) {
  const result = await db.query('select erp.estoque_extrato($1,$2,$3::jsonb) as result', [unit, action, JSON.stringify(filters)]);
  return result.rows[0].result;
}

test('RF-017 saldo corrente e saldo por linha incluem origens ocultas e desempate por ID', async () => actor(1, async () => {
  await withdrawalSetup();
  const p = await create();
  await confirm((await receive(p.id)).id);
  await withdrawal('registrar', withdrawalInput(p.id, { quantidade: '2' }));
  await withdrawal('registrar', withdrawalInput(p.id, { quantidade: '3', chave: key(801) }));
  await become(3);
  const selection = { produto_id: p.id };
  const page = await ledger('listar', selection);
  assert.equal(page.saldo_corrente, '15.000000');
  assert.deepEqual(page.itens.map(row => [row.quantidade, row.saldo_apos]), [
    ['20.000000', '20.000000'], ['-2.000000', '18.000000'], ['-3.000000', '15.000000'],
  ]);
  assert.equal(new Set(page.itens.map(row => row.ocorrido_em)).size, 1);
  const filtered = await ledger('exportar', { ...selection, tipo: 'REQUISICAO_RAPIDA', lote_id: page.itens[0].lote_id });
  assert.deepEqual(filtered.itens, page.itens.slice(1));
  assert.equal(filtered.saldo_corrente, page.saldo_corrente);
  const empty = await ledger('listar', { ...selection, data_fim: '2020-01-01' });
  assert.equal(empty.saldo_corrente, page.saldo_corrente);
  assert.deepEqual(empty.itens, []);
  await sqlRejects(`select erp.estoque_extrato(2,'exportar','{"produto_id":"${p.id}"}')`, 'PT404');
  await sqlRejects(`select erp.estoque_extrato(1,'listar','{"produto_id":"${p.id}","lote_id":"9223372036854775807"}')`, 'PT404');
  await become(7);
  await sqlRejects(`select erp.estoque_extrato(1,'listar','{"produto_id":"${p.id}"}')`, 'PT403');
}));

test('RF-017 separa saldo por lote e aplica a data civil de São Paulo após calcular o acumulado', async () => actor(1, async () => {
  const p = await create();
  const e = await receive(p.id, { total_nota: null, itens: [
    line(p.id, { numero_lote: 'PRIMEIRO', quantidade: '20' }),
    line(p.id, { numero_lote: 'SEGUNDO', quantidade: '4' }),
  ] });
  await confirm(e.id);
  await db.exec(`reset role;
    alter table erp.movimento_estoque disable trigger movimento_imutavel;
    update erp.movimento_estoque m set ocorrido_em = case l.codigo
      when 'PRIMEIRO' then '2026-11-23 02:59:59+00'::timestamptz else '2026-11-23 03:00:00+00'::timestamptz end
    from erp.lote l where l.id = m.lote_id;
    alter table erp.movimento_estoque enable trigger movimento_imutavel;`);
  await become(3);
  const filters = { produto_id: p.id, data_inicio: '2026-11-23', data_fim: '2026-11-23' };
  const all = await ledger('listar', filters);
  assert.equal(all.total, 1);
  assert.equal(all.saldo_corrente, '24.000000');
  assert.equal(all.itens[0].saldo_apos, '24.000000');
  const onlyLot = await ledger('listar', { ...filters, lote_id: all.itens[0].lote_id });
  assert.equal(onlyLot.saldo_corrente, '4.000000');
  assert.equal(onlyLot.itens[0].saldo_apos, '4.000000');
}));

async function imported(action,data,unit=1){return(await db.query('select erp.produto_importado_operacao($1,$2,$3::jsonb) result',[unit,action,JSON.stringify(data)])).rows[0].result;}
async function importedSeed(){await db.exec('reset role');const r=await db.query("insert into erp_private.produto_importado(chave,descricao,origens,criado_por) values('arroz importado','Arroz importado','[{\"arquivo\":\"fixture.xlsx\"}]',$1) returning id::text",[uid(1)]);await become(1);return r.rows[0].id;}
async function importedReject(action,data,code,unit=1){await db.exec('savepoint imported_error');await assert.rejects(()=>imported(action,data,unit),{code});await db.exec('rollback to savepoint imported_error');}
test('CARGA-002 conclusão atômica usa cadastro existente e replay não cria produto ou estoque novamente',async()=>actor(1,async()=>{
 const id=await importedSeed(),input=product({descricao:'Arroz importado'});const list=await imported('listar',{q:'ARRÓZ',offset:0});assert.equal(list.total,1);assert.equal(list.itens[0].id,id);
 const saved=await imported('concluir',{id,produto:input});assert.equal((await imported('listar',{q:'',offset:0})).total,0);assert.deepEqual(await imported('concluir',{id,produto:input}),saved);
 await importedReject('concluir',{id,produto:{...input,descricao:'Outro'}},'PT409');await become(2);await importedReject('concluir',{id,produto:input},'PT409',2);await become(1);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from erp.produto')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from erp.movimento_estoque')).rows[0].n,0);assert.equal((await db.query("select estado from erp_private.produto_importado where id=$1",[id])).rows[0].estado,'CONCLUIDO');
}));
test('CARGA-002 nega leitura/escrita direta, perfis/unidades indevidos e reverte produto se conclusão falha',async()=>actor(1,async()=>{
 const id=await importedSeed();await sqlRejects('select * from erp_private.produto_importado');await sqlRejects('delete from erp_private.produto_importado');
 await become(3);await importedReject('listar',{q:'',offset:0},'PT403');await become(6);await importedReject('listar',{q:'',offset:0},'PT404');await become(5);await importedReject('listar',{q:'',offset:0},'PT404');await become(1);
 await importedReject('listar',{q:'',offset:-1},'PT422');await importedReject('concluir',{id,produto:{id:'1'}},'PT422');
 await db.exec("reset role; create function erp_private.falhar_importado() returns trigger language plpgsql as $$ begin raise exception 'Falha induzida';end $$;create trigger falhar_importado before update on erp_private.produto_importado for each row execute function erp_private.falhar_importado()");await become(1);
 await importedReject('concluir',{id,produto:product({descricao:'Arroz importado'})},'P0001');await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from erp.produto')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from erp.auditoria_estoque')).rows[0].n,0);assert.equal((await db.query('select estado from erp_private.produto_importado')).rows[0].estado,'PENDENTE');
}));
test('schema novo tem RLS, executor restrito e nenhum DML cliente ou USAGE auth', async () => {
  const rows = (await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'")).rows;
  assert.equal(rows.length, 28); assert.ok(rows.every((r) => r.relrowsecurity));
  const role = (await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname='erp_stock_writer'")).rows[0];
  assert.ok(Object.values(role).every((v) => v === false));
  const grants = (await db.query("select has_schema_privilege('erp_stock_writer','auth','USAGE') as auth_usage,pg_has_role('authenticated','erp_stock_writer','MEMBER') as member,has_schema_privilege('erp_stock_writer','erp_private','CREATE') as can_create")).rows[0];
  assert.deepEqual(grants, { auth_usage: false, member: false, can_create: false });
  const privileged = (await db.query("select pg_get_userbyid(p.proowner) as owner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname='estoque_operacao'")).rows[0];
  assert.equal(privileged.owner, 'erp_stock_writer'); assert.ok(privileged.proconfig.includes('search_path=""'));
  const exposed = (await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('erp','erp_private') and p.proname like 'estoque_%' and a.privilege_type='EXECUTE' and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='anon'))")).rows;
  assert.deepEqual(exposed, []);
});

test('estoquista sem CONFIGURACAO_LER seleciona unidade e contexto autorizado', async () => actor(1, async () => {
  assert.deepEqual((await db.query('select id::text from erp.unidade')).rows, [{ id: '1' }]);
  assert.deepEqual((await db.query('select * from erp.parametro_unidade')).rows, []);
  const ctx = await rpc('contexto'); assert.equal(ctx.medidas.length, 2); assert.equal(ctx.locais.length, 2);
  assert.deepEqual(ctx.capacidades, { produto_escrever: true, produto_ciclo_vida: false, recebimento_escrever: true, divergencia_aprovar: false });
}));

test('produto persiste, busca normalizada, parâmetros locais e revisão otimista', async () => actor(1, async () => {
  const p = await create(); assert.equal(typeof p.id, 'string'); assert.equal(p.estoque_minimo, '10.000000');
  assert.equal((await rpc('produtos', { q: '  ARROZ ', status: 'ATIVO', offset: 0 })).total, 1);
  const edited = (await rpc('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, estoque_minimo: '0', complemento: 'Tipo 1' })).produto;
  assert.equal(edited.revisao, '2'); assert.equal(edited.estoque_minimo, '0.000000');
  await rejects('produto_salvar', { ...product(), id: p.id, revisao: p.revisao }, 'PT412');
  assert.equal((await rpc('produtos', {})).produtos[0].complemento, 'Tipo 1');
}));

test('unicidade global normaliza NFC/NFD, caixa, acentos e espaços concorrentes', async () => actor(1, async () => {
  await create({ descricao: '  Café   Torrado ', complemento: 'Seleção' });
  await rejects('produto_salvar', product({ descricao: 'CAFE\u0301 TORRADO', complemento: 'selec\u0327a\u0303o' }), 'PT409');
  await rejects('produto_salvar', product({ descricao: '\tCAFÉ TORRADO\t', complemento: 'SELEÇÃO' }), 'PT409');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(2)]); await db.exec('set local role authenticated');
  assert.deepEqual(await rpc('produtos', {}, 2), { produtos: [], total: 0 });
  await rejects('produto_salvar', product({ descricao: 'cafe torrado', complemento: 'selecao' }), 'PT409', 2);
}));

test('payload de produto é estrito e não arredonda nem coage tipos', async () => actor(1, async () => {
  for (const extra of [{ descricao: '' }, { perecivel: 'false' }, { quantidade_apresentacao: '0' }, { fator_correcao: '0' }, { estoque_minimo: '-1' }, { estoque_minimo: '0.0000001' }, { estoque_minimo: '1000000000000' }, { estoque_minimo: 5 }, { estoque_minimo: 'NaN' }, { unidade_medida_id: 1 }, { saldo: '20' }, { ator_id: uid(1) }, { estoque_maximo: '5' }, { armazenamento: 'LIVRE' }]) await rejects('produto_salvar', product(extra));
  await rejects('produto_salvar', { ...product(), id: '1' });
  await rejects('produtos', { status: 'TODOS' }); await rejects('produtos', { offset: -1 });
  assert.equal((await rpc('produtos')).total, 0);
}));

test('compra 20 kg confirma um lote, livro, saldo exato e documento imutável', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id); assert.equal(e.estado, 'RASCUNHO'); assert.deepEqual((await rpc('saldos')).saldos, []);
  const confirmed = await confirm(e.id); assert.equal(confirmed.estado, 'CONFIRMADA');
  const [saldo] = (await rpc('saldos')).saldos; assert.equal(saldo.quantidade, '20.000000'); assert.equal(saldo.lote, 'LOTE-SINTETICO'); assert.equal(saldo.local, 'Almoxarifado A'); assert.equal(saldo.produto_id, p.id);
  assert.deepEqual(await confirm(e.id), confirmed); assert.deepEqual(await confirm(e.id, 2), confirmed);
  const e2 = await receive(p.id, { numero_nf: 'NF-OUTRA' }); await rejects('entrada_confirmar', { id: e2.id, chave: key() }, 'PT409');
  assert.equal((await rpc('saldos')).saldos.length, 1);
  await rejects('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, unidade_medida_id: '2' }, 'PT409');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n, 1);
  await sqlRejects(`update erp.entrada set numero_nf='OUTRA' where id=${e.id}`);
  await sqlRejects(`delete from erp.entrada_item where entrada_id=${e.id}`);
  await sqlRejects(`insert into erp.entrada_item(unidade_id,entrada_id,produto_id,unidade_medida_id,quantidade,valor_unitario,numero_lote,camara_id,aspecto_embalagem,conformidade,motivo) select unidade_id,entrada_id,produto_id,unidade_medida_id,1,1,'NOVO',camara_id,aspecto_embalagem,conformidade,motivo from erp.entrada_item where entrada_id=${e.id}`);
  await sqlRejects('delete from erp.movimento_estoque'); await sqlRejects('update erp.auditoria_estoque set acao=\'reescrita\'');
}));

test('recusado conserva documento/motivo mas não gera lote nem crédito; lote automático é determinístico', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { itens: [line(p.id, { conformidade: 'RECUSADO', motivo: 'Embalagem danificada' }), line(p.id, { quantidade: '1', numero_lote: null })], total_nota: null });
  await confirm(e.id); const [saldo] = (await rpc('saldos')).saldos; assert.equal(saldo.quantidade, '1.000000'); assert.match(saldo.lote, new RegExp(`^E-${e.id}-I-`));
  assert.equal((await rpc('entradas')).entradas[0].itens.length, 2);
}));

test('NF/fornecedor é única entre unidades e erro de item reverte entrada inteira', async () => actor(1, async () => {
  const p = await create(); await receive(p.id);
  await rejects('entrada_criar', receipt(p.id), 'PT409');
  await rejects('entrada_criar', receipt(p.id, { numero_nf: 'ERRO-ITEM', itens: [line(p.id), line(p.id, { camara_id: '2' })] }));
  assert.equal((await rpc('entradas')).entradas.length, 1);
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(2)]); await db.exec('set local role authenticated');
  const b = (await rpc('produto_salvar', product({ descricao: 'Produto B' }), 2)).produto;
  await rejects('entrada_criar', receipt(b.id, { itens: [line(b.id, { camara_id: '2' })] }), 'PT409', 2);
}));

test('data/validade/temperatura/conformidade e vínculo produto/local são validados', async () => actor(1, async () => {
  const p = await create({ perecivel: true, armazenamento: 'CONGELADO' });
  for (const item of [line(p.id), line(p.id, { validade: '2026-01-01', temperatura: '-18' }), line(p.id, { validade: '2030-01-01' }), line(p.id, { validade: '2030-01-01', temperatura: '-18', conformidade: 'RESSALVA' }), line(p.id, { validade: '2030-01-01', temperatura: '-18', quantidade: '0' })]) await rejects('entrada_criar', receipt(p.id, { itens: [item] }));
  await rejects('entrada_criar', receipt(p.id, { data_entrada: '2999-01-01' }));
  await rejects('entrada_criar', receipt(p.id, { data_entrada: '2026-02-30' }));
  await rejects('entrada_criar', receipt(p.id, { numero_nf: '' }));
  const e = await receive(p.id, { itens: [line(p.id, { validade: '2030-01-01', temperatura: '-18', camara_id: '3', numero_lote: null })] });
  await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '20.000000');
}));

test('total divergente exige aprovação distinta, que não credita estoque', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { total_nota: '56' });
  await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT409');
  await rejects('entrada_aprovar_divergencia', { id: e.id, motivo: 'Divergência documentada' }, 'PT403');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(4)]); await db.exec('set local role authenticated');
  const approval = await rpc('entrada_aprovar_divergencia', { id: e.id, motivo: 'Conferência distinta do gestor' }); assert.equal(approval.entrada.divergencia_aprovada, true); assert.equal(approval.entrada.estado, 'RASCUNHO'); assert.deepEqual((await rpc('saldos')).saldos, []);
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await db.exec('set local role authenticated');
  await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '20.000000');
}));

test('autoaprovação é negada mesmo com capacidade explícita e sem burlar trilha', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { total_nota: '56' });
  await db.exec('reset role'); await db.exec("insert into erp.perfil_permissao values(1,'RECEBIMENTO_APROVAR_DIVERGENCIA')"); await db.exec('set local role authenticated');
  await rejects('entrada_aprovar_divergencia', { id: e.id, motivo: 'Tentativa da própria autoria' }, 'PT403');
}));

test('falha de auditoria na confirmação reverte lote/livro/saldo/estado/idempotência', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role');
  await db.exec("create function erp_private.falha_stock() returns trigger language plpgsql as $$ begin if new.acao='entrada_confirmar' then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_stock before insert on erp.auditoria_estoque for each row execute function erp_private.falha_stock()");
  await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'P0001');
  assert.deepEqual((await rpc('saldos')).saldos, []); assert.equal((await rpc('entradas')).entradas[0].estado, 'RASCUNHO');
  await db.exec('reset role');
  for (const table of ['lote', 'movimento_estoque', 'saldo_lote_local', 'comando_estoque']) assert.equal((await db.query(`select count(*)::int as n from erp.${table}`)).rows[0].n, 0);
}));

test('decimais são exatos, preservam seis casas e total calculado sem float', async () => actor(1, async () => {
  const p = await create({ estoque_minimo: '0.000001' });
  const e = await receive(p.id, { total_nota: null, itens: [line(p.id, { quantidade: '0.123456', valor_unitario: '0.123456' })] });
  assert.equal(e.total_itens, '0.015241383936'); await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '0.123456');
}));

test('leitor, configuração isolada, inativo, revogado e ausência de identidade não gravam', async () => {
  for (const n of [3, 7]) await actor(n, async () => { await rejects('produto_salvar', product(), 'PT403'); await rejects('entrada_criar', receipt('1'), 'PT403'); });
  for (const n of [5, 6, 999]) await actor(n, async () => { await rejects('contexto', {}, 'PT404'); });
  await actor(null, async () => { await rejects('contexto', {}, 'PT403'); });
  await actor(null, async () => { await rejects('contexto', {}, '42501'); }, 'anon');
  await actor(1, async () => {
    await rejects('saldos', {}, 'PT404', 2);
    await db.exec('reset role'); await db.exec(`delete from erp.usuario_unidade where usuario_id='${uid(1)}'`); await db.exec('set local role authenticated'); await rejects('contexto', {}, 'PT404');
  });
});

test('DML direto não altera documento/livro/saldo/catálogo/capacidade', async () => actor(1, async () => {
  for (const sql of ["insert into erp.produto(descricao) values('Invasão')", "update erp.entrada set estado='CONFIRMADA'", 'delete from erp.entrada_item', 'update erp.saldo_lote_local set quantidade=99', 'delete from erp.movimento_estoque', 'delete from erp.auditoria_estoque', "insert into erp.perfil_permissao values(1,'RECEBIMENTO_APROVAR_DIVERGENCIA')"]) await sqlRejects(sql);
}));

test('revogação de capacidade e inativação do produto/local são revalidadas na confirmação', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role'); await db.exec(`update erp.produto set status='INATIVO' where id=${p.id}`); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() });
  await db.exec('reset role'); await db.exec(`update erp.produto set status='ATIVO' where id=${p.id}; update erp.camara set status='INATIVO' where id=1`); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() });
  await db.exec('reset role'); await db.exec("update erp.camara set status='ATIVO' where id=1; delete from erp.perfil_permissao where permissao='RECEBIMENTO_GERIR'"); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT403');
}));

test('FK composta impede câmara de outra unidade mesmo em DML administrativo', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role'); await sqlRejects(`update erp.entrada_item set camara_id=2 where entrada_id=${e.id}`, '23503');
}));

test('rascunho conserva unidade-base da quantidade e rejeita confirmação após mudança do catálogo', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await rpc('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, unidade_medida_id: '2' });
  assert.equal((await rpc('entradas')).entradas[0].itens[0].unidade_medida, 'KG');
  await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT409');
}));

test('duas conexões confirmam uma única vez e NF concorrente entre unidades é única', { skip: !process.env.DATABASE_STOCK_TEST_URL, timeout: 20000 }, async () => {
  const a = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  const b = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  let pending;
  async function waitForLock(pid) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await db.query('select cardinality(pg_blocking_pids($1))>0 as blocked', [pid])).rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Segunda conexão não aguardou o lock esperado');
  }
  try {
    await a.connect(); await b.connect();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)]); await db.exec('set role authenticated');
    const p = (await rpc('produto_salvar', product({ descricao: 'Produto concorrente' }))).produto;
    const e = (await rpc('entrada_criar', receipt(p.id, { numero_nf: 'NF-CONCORRENTE' }))).entrada;
    await db.exec('reset role');
    for (const client of [a, b]) { await client.query('begin'); await client.query("set local statement_timeout='5s'"); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await client.query('set local role authenticated'); }
    await rpc('entrada_confirmar', { id: e.id, chave: key(10) }, 1, a);
    const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    pending = rpc('entrada_confirmar', { id: e.id, chave: key(11) }, 1, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid);
    await a.query('commit'); const result = await pending; assert.ifError(result.error); assert.equal(result.value.entrada.estado, 'CONFIRMADA'); await b.query('commit');
    assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n, 1);
    assert.equal((await db.query('select sum(quantidade)::text as q from erp.saldo_lote_local')).rows[0].q, '20.000000');
    // Native lock orchestration for cross-unit invoice UNIQUE, without table scans or advisory stand-ins.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(2)]); await db.exec('set role authenticated');
    const p2 = (await rpc('produto_salvar', product({ descricao: 'Produto concorrente B' }), 2)).produto; await db.exec('reset role');
    for (const [client, n] of [[a, 1], [b, 2]]) { await client.query('begin'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(n)]); await client.query('set local role authenticated'); }
    await rpc('entrada_criar', receipt(p.id, { numero_nf: 'NF-RACE' }), 1, a);
    pending = rpc('entrada_criar', receipt(p2.id, { numero_nf: 'NF-RACE', itens: [line(p2.id, { camara_id: '2' })] }), 2, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid);
    await a.query('commit'); assert.equal((await pending).error?.code, 'PT409'); await b.query('rollback');
    assert.equal((await db.query("select count(*)::int as n from erp.entrada where numero_nf='NF-RACE'")).rows[0].n, 1);
    // Permission revoked while an editor waits for a product lock must be fresh.
    await a.query('begin'); await a.query('select id from erp.produto where id=$1 for no key update', [p.id]);
    await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await b.query('set local role authenticated');
    pending = rpc('produto_salvar', { ...product({ descricao: p.descricao }), id: p.id, revisao: p.revisao }, 1, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid); await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='PRODUTO_GERIR'");
    await a.query('commit'); assert.equal((await pending).error?.code, 'PT403'); await b.query('rollback');
    await db.exec("insert into erp.perfil_permissao values(1,'PRODUTO_GERIR')");
  } finally {
    await a.query('rollback').catch(() => {}); if (pending) await pending; await b.query('rollback').catch(() => {}); await db.exec('reset role'); await Promise.all([a.end(), b.end()]);
  }
});

test('catálogo disponível não expõe dados da origem; vínculo mantém produto único e estoque separado',async()=>actor(1,async()=>{
 const p=await create({descricao:'CAD-002 catálogo compartilhado'});const body=linkInput(p);
 await db.exec('reset role');const movements=(await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n;await become(2);
 const available=await catalog('disponiveis',{q:'CAD-002 CATALOGO',offset:0},2);
 assert.equal(available.total,1);assert.equal(available.produtos[0].id,p.id);
 assert.deepEqual(Object.keys(available.produtos[0]).sort(),['id','revisao','descricao','complemento','unidade_sigla','categoria_descricao','apresentacao_compra','armazenamento'].sort());
 const saved=(await catalog('vincular',body,2)).produto;
 assert.equal(saved.id,p.id);assert.equal(saved.revisao,p.revisao);assert.equal(saved.estoque_minimo,'5.000001');
 assert.equal((await catalog('disponiveis',{q:'CAD-002 CATALOGO',offset:0},2)).total,0);
 assert.equal((await catalog('vincular',body,2)).produto.id,p.id);
 await catalogRejects('vincular',{...body,estoque_minimo:'9'},'PT409');
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int as n from erp.produto where id=$1',[p.id])).rows[0].n,1);
 assert.deepEqual((await db.query('select unidade_id::text,estoque_minimo::text from erp.produto_unidade where produto_id=$1 order by unidade_id',[p.id])).rows,[{unidade_id:'1',estoque_minimo:'10.000000'},{unidade_id:'2',estoque_minimo:'5.000001'}]);
 const audits=(await db.query("select unidade_id::text,antes,depois->>'estoque_minimo' as minimo from erp.auditoria_estoque where entidade_id=$1 and acao='produto_vincular'",[p.id])).rows;
 assert.deepEqual(audits,[{unidade_id:'2',antes:null,minimo:'5.000001'}]);
 assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n,movements);
}));

test('vínculo exige revisão atual e JSON estrito, preserva parâmetros após conflitos',async()=>actor(1,async()=>{
 const p=await create({descricao:'CAD-002 revisão'});await rpc('produto_salvar',{...product({descricao:p.descricao}),id:p.id,revisao:p.revisao});await become(2);
 await catalogRejects('vincular',linkInput(p),'PT412');
 for(const change of [{estoque_minimo:0},{estoque_maximo:'1'},{estoque_minimo:'-1'},{ponto_reposicao:'-1'},{ator_id:uid(1)},{unidade_id:'1'},{revisao:'0'}])await catalogRejects('vincular',linkInput({...p,revisao:'2'},change),'PT422');
 await catalogRejects('disponiveis',{q:'',offset:-1},'PT422');await catalogRejects('disponiveis',{q:'',offset:0,status:'ATIVO'},'PT422');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from erp.produto_unidade where produto_id=$1 and unidade_id=2',[p.id])).rows[0].n,0);
}));

test('leitor, unidade alheia e DML direto não vinculam produto; helpers não são públicos',async()=>actor(1,async()=>{
 const p=await create({descricao:'CAD-002 permissões'});
 await become(3);assert.ok(Array.isArray((await catalog('disponiveis',{q:'',offset:0},1)).produtos));await catalogRejects('vincular',linkInput(p),'PT403',1);
 await become(1);await catalogRejects('disponiveis',{q:'',offset:0},'PT404');
 await become(2);await sqlRejects(`insert into erp.produto_unidade(unidade_id,produto_id,estoque_minimo) values(2,${p.id},0)`);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',true)");await db.exec('set local role authenticated');await catalogRejects('disponiveis',{q:'',offset:0},'PT403');
 await db.exec('reset role');await db.exec('set local role anon');await catalogRejects('disponiveis',{q:'',offset:0},'42501');
}));

test('produto, medida ou categoria inativa não aparecem nem aceitam vínculo',async()=>actor(1,async()=>{
 const p=await create({descricao:'CAD-002 inativos'});
 for(const table of ['unidade_medida','categoria','produto']){
  await db.exec('reset role');await db.query(`update erp.${table} set status='INATIVO' where id=$1`,[table==='produto'?p.id:'1']);await become(2);
  assert.equal((await catalog('disponiveis',{q:p.descricao,offset:0},2)).total,0);await catalogRejects('vincular',linkInput(p),'PT422');
  await db.exec('reset role');await db.query(`update erp.${table} set status='ATIVO' where id=$1`,[table==='produto'?p.id:'1']);
 }
}));

test('falha de auditoria desfaz o vínculo e não altera produto ou saldo',async()=>actor(1,async()=>{
 const p=await create({descricao:'CAD-002 rollback'});await db.exec('reset role');
 await db.exec("create function erp_private.falha_vinculo() returns trigger language plpgsql as $$ begin if new.acao='produto_vincular' then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_vinculo before insert on erp.auditoria_estoque for each row execute function erp_private.falha_vinculo()");
 await become(2);await catalogRejects('vincular',linkInput(p),'P0001');await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int as n from erp.produto_unidade where produto_id=$1',[p.id])).rows[0].n,1);
 assert.equal((await db.query('select revisao::text from erp.produto where id=$1',[p.id])).rows[0].revisao,p.revisao);
}));

test('vínculo concorrente audita uma vez e revogação durante lock bloqueia escrita',{skip:!process.env.DATABASE_STOCK_TEST_URL,timeout:20000},async()=>{
 const a=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});const b=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});let pending;
 const wait=async pid=>{const limit=Date.now()+3000;while(Date.now()<limit){if((await db.query('select cardinality(pg_blocking_pids($1))>0 as blocked',[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,20));}assert.fail('Lock não observado');};
 try{
  await a.connect();await b.connect();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);await db.exec('set role authenticated');
  const p=await create({descricao:'CAD-002 concorrente'});const revoked=await create({descricao:'CAD-002 revogado'});await db.exec('reset role');
  for(const client of[a,b]){await client.query('begin');await client.query("set local statement_timeout='5s'");await client.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]);await client.query('set local role authenticated');}
  await catalog('vincular',linkInput(p),2,a);const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  pending=catalog('vincular',linkInput(p),2,b).then(value=>({value}),error=>({error}));await wait(pid);await a.query('commit');assert.ifError((await pending).error);await b.query('commit');
  assert.equal((await db.query("select count(*)::int as n from erp.auditoria_estoque where acao='produto_vincular' and entidade_id=$1",[p.id])).rows[0].n,1);
  await a.query('begin');await a.query('select id from erp.produto where id=$1 for update',[revoked.id]);
  await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]);await b.query('set local role authenticated');
  pending=catalog('vincular',linkInput(revoked),2,b).then(value=>({value}),error=>({error}));await wait(pid);
  await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='PRODUTO_GERIR'");await a.query('commit');assert.equal((await pending).error?.code,'PT403');await b.query('rollback');
  await db.exec("insert into erp.perfil_permissao values(1,'PRODUTO_GERIR')");assert.equal((await db.query('select count(*)::int as n from erp.produto_unidade where produto_id=$1 and unidade_id=2',[revoked.id])).rows[0].n,0);
 }finally{await a.query('rollback').catch(()=>{});if(pending)await pending;await b.query('rollback').catch(()=>{});await db.exec('reset role');await Promise.all([a.end(),b.end()]);}
});

test('categorias: duas conexões revalidam revogação e vínculo concorrente impede exclusão', { skip: !process.env.DATABASE_STOCK_TEST_URL, timeout: 20000 }, async () => {
 const a = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL }), b = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
 await Promise.all([a.connect(), b.connect()]); let pending; let categoryId;
 const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 async function waitLock() { for(let i=0;i<200;i++){if((await db.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected blocked category operation'); }
 try {
  categoryId = (await db.query("insert into erp.categoria(descricao) values ('Categoria concorrente') returning id::text")).rows[0].id;
  await a.query('begin'); await a.query('select id from erp.categoria where id=$1 for update',[categoryId]);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]); await b.query('set local role authenticated');
  pending=category('editar',{...categoryInput(),id:categoryId,revisao:'1'},1,b).then(value=>({value}),error=>({error})); await waitLock();
  await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='CATEGORIA_EDITAR'"); await a.query('commit'); assert.equal((await pending).error?.code,'PT403'); await b.query('rollback');
  await db.exec("insert into erp.perfil_permissao values(1,'CATEGORIA_EDITAR')");
  await a.query('begin'); await a.query('select id from erp.categoria where id=$1 for share',[categoryId]);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]); await b.query('set local role authenticated');
  pending=category('excluir',{id:categoryId,revisao:'1'},1,b).then(value=>({value}),error=>({error})); await waitLock();
  await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]); await a.query('set local role authenticated');
  await rpc('produto_salvar',product({descricao:'CAD003 produto disputa exclusiva',categoria_id:categoryId}),2,a); await a.query('commit'); assert.equal((await pending).error?.code,'PT409'); await b.query('rollback');
  // Two writers cannot create duplicate normalized descriptions.
  await a.query('begin'); await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]); await a.query('set local role authenticated');
  await category('criar',categoryInput({descricao:'Unicidade concorrente'}),1,a);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]); await b.query('set local role authenticated');
  pending=category('criar',categoryInput({descricao:'UNICIDADE CONCORRENTE'}),1,b).then(value=>({value}),error=>({error})); await waitLock();
  await a.query('commit'); assert.equal((await pending).error?.code,'PT409'); await b.query('rollback');
 } finally {
  await a.query('rollback').catch(()=>{}); if(pending)await pending; await b.query('rollback').catch(()=>{});
  await db.exec('reset role'); await db.exec("insert into erp.perfil_permissao values(1,'CATEGORIA_EDITAR') on conflict do nothing"); await Promise.all([a.end(),b.end()]);
 }
});

test('medidas: duas conexões revalidam revogação e vínculo concorrente impede exclusão', { skip: !process.env.DATABASE_STOCK_TEST_URL, timeout: 20000 }, async () => {
 const a = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL }), b = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
 await Promise.all([a.connect(), b.connect()]); let pending; let measureId;
 const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 async function waitLock() { for(let i=0;i<200;i++){if((await db.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected blocked category operation'); }
 try {
  measureId = (await db.query("insert into erp.unidade_medida(sigla,descricao) values ('CAD004','Medida concorrente') returning id::text")).rows[0].id;
  await a.query('begin'); await a.query('select id from erp.unidade_medida where id=$1 for update',[measureId]);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]); await b.query('set local role authenticated');
  pending=measure('editar',{...measureInput(),id:measureId,revisao:'1'},1,b).then(value=>({value}),error=>({error})); await waitLock();
  await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='MEDIDA_EDITAR'"); await a.query('commit'); assert.equal((await pending).error?.code,'PT403'); await b.query('rollback');
  await db.exec("insert into erp.perfil_permissao values(1,'MEDIDA_EDITAR')");
  await a.query('begin'); await a.query('select id from erp.unidade_medida where id=$1 for share',[measureId]);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]); await b.query('set local role authenticated');
  pending=measure('excluir',{id:measureId,revisao:'1'},1,b).then(value=>({value}),error=>({error})); await waitLock();
  await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]); await a.query('set local role authenticated');
  await rpc('produto_salvar',product({descricao:'CAD004 produto disputa exclusiva',unidade_medida_id:measureId}),2,a); await a.query('commit'); assert.equal((await pending).error?.code,'PT409'); await b.query('rollback');
  // Two writers cannot create duplicate normalized descriptions.
  await a.query('begin'); await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]); await a.query('set local role authenticated');
  await measure('criar',measureInput({descricao:'Unicidade concorrente'}),1,a);
  await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]); await b.query('set local role authenticated');
  pending=measure('criar',measureInput({descricao:'UNICIDADE CONCORRENTE'}),1,b).then(value=>({value}),error=>({error})); await waitLock();
  await a.query('commit'); assert.equal((await pending).error?.code,'PT409'); await b.query('rollback');
 } finally {
  await a.query('rollback').catch(()=>{}); if(pending)await pending; await b.query('rollback').catch(()=>{});
  await db.exec('reset role'); await db.exec("insert into erp.perfil_permissao values(1,'MEDIDA_EDITAR') on conflict do nothing"); await Promise.all([a.end(),b.end()]);
 }
});

test('calendário: duas conexões revalidam permissão/revisão após lock e não sobrescrevem', {skip:!process.env.DATABASE_STOCK_TEST_URL,timeout:20000},async()=>{
 const a=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL}),b=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});await Promise.all([a.connect(),b.connect()]);let pending;const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waitLock(){for(let i=0;i<200;i++){if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected calendar lock');}
 async function start(){await a.query('begin');await a.query("select pg_advisory_xact_lock(hashtextextended('erp.calendario:1',0))");await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);await b.query('set local role authenticated');pending=calendar('salvar',calendarInput(),1,b).then(value=>({value}),error=>({error}));await waitLock();}
 try{await start();await db.exec("delete from erp.perfil_permissao where perfil_id=2 and permissao='CALENDARIO_EDITAR'");await a.query('commit');assert.equal((await pending).error?.code,'PT403');await b.query('rollback');await db.exec("insert into erp.perfil_permissao values(2,'CALENDARIO_EDITAR')");
 await start();await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(7)]);await a.query('set local role authenticated');await calendar('salvar',calendarInput({atende_feriados:true}),1,a);await a.query('commit');assert.equal((await pending).error?.code,'PT412');await b.query('rollback');
 }finally{await a.query('rollback').catch(()=>{});if(pending)await pending;await b.query('rollback').catch(()=>{});await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(2,'CALENDARIO_EDITAR') on conflict do nothing");await Promise.all([a.end(),b.end()]);}
});
test('produto ciclo: concorrência revalida X e impede exclusão diante de novo vínculo/recebimento', {skip:!process.env.DATABASE_STOCK_TEST_URL,timeout:25000},async()=>{
 const a=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL}),b=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});await Promise.all([a.connect(),b.connect()]);let pending;
 const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waitLock(){for(let i=0;i<200;i++){if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected blocked product operation');}
 async function committedProduct(name){await db.exec('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await db.exec('set local role authenticated');const p=(await rpc('produto_salvar',product({descricao:name}))).produto;await db.exec('commit;reset role');return p;}
 async function waitDelete(p){await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);await b.query('set local role authenticated');pending=cycle('excluir',{id:p.id,revisao:p.revisao},1,b).then(value=>({value}),error=>({error}));await waitLock();}
 try{
  const p=await committedProduct('CAD006 concorrente X');await a.query('begin');await a.query('select id from erp.produto where id=$1 for update',[p.id]);await waitDelete(p);
  await db.exec("delete from erp.perfil_permissao where perfil_id=2 and permissao='PRODUTO_CICLO_VIDA'");await a.query('commit');assert.equal((await pending).error?.code,'PT403');await b.query('rollback');await db.exec("insert into erp.perfil_permissao values(2,'PRODUTO_CICLO_VIDA')");
  await a.query('begin');await a.query('select id from erp.produto where id=$1 for update',[p.id]);await waitDelete(p);await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]);await a.query('set local role authenticated');await catalog('vincular',linkInput(p),2,a);await a.query('commit');assert.equal((await pending).error?.code,'PT409');await b.query('rollback');
  const q=await committedProduct('CAD006 concorrente entrada');await a.query('begin');await a.query('select id from erp.produto where id=$1 for share',[q.id]);await waitDelete(q);await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await a.query('set local role authenticated');await rpc('entrada_criar',receipt(q.id,{numero_nf:'CAD006-CONCORRENTE'}),1,a);await a.query('commit');assert.equal((await pending).error?.code,'PT409');await b.query('rollback');
 }finally{await a.query('rollback').catch(()=>{});if(pending)await pending;await b.query('rollback').catch(()=>{});await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(2,'PRODUTO_CICLO_VIDA') on conflict do nothing");await Promise.all([a.end(),b.end()]);}
});
test('fornecedor: concorrência revalida revogação, recebimento vinculado e documento único', {skip:!process.env.DATABASE_STOCK_TEST_URL,timeout:20000},async()=>{
 const a=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL}),b=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});await Promise.all([a.connect(),b.connect()]);let pending;
 const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waitLock(){for(let i=0;i<200;i++){if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected blocked supplier operation');}
 try {
  const id=(await db.query('insert into erp.fornecedor(razao_social,cnpj_cpf) values ($1,$2) returning id::text',['Fornecedor bloqueado',supplierDocument('CAD005LOCK01')])).rows[0].id;
  await a.query('begin');await a.query('select id from erp.fornecedor where id=$1 for update',[id]);
  await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await b.query('set local role authenticated');
  pending=supplier('editar',{...supplierInput(),id,revisao:'1'},1,b).then(value=>({value}),error=>({error}));await waitLock();
  await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='FORNECEDOR_EDITAR'");await a.query('commit');assert.equal((await pending).error?.code,'PT403');await b.query('rollback');await db.exec("insert into erp.perfil_permissao values(1,'FORNECEDOR_EDITAR')");
  await a.query('begin');await a.query('select id from erp.fornecedor where id=$1 for share',[id]);
  await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);await b.query('set local role authenticated');
  pending=supplier('excluir',{id,revisao:'1'},1,b).then(value=>({value}),error=>({error}));await waitLock();
  await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(2)]);await a.query('set local role authenticated');
  const p=(await rpc('produto_salvar',product({descricao:'Fornecedor concorrente produto B'}),2,a)).produto;
  await rpc('entrada_criar',receipt(p.id,{fornecedor_id:id,numero_nf:'CAD005-CONCORRENTE',itens:[line(p.id,{camara_id:'2'})]}),2,a);await a.query('commit');assert.equal((await pending).error?.code,'PT409');await b.query('rollback');
  await a.query('begin');await a.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await a.query('set local role authenticated');await supplier('criar',supplierInput({razao_social:'Fornecedor unicidade concorrente'}),1,a);
  await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);await b.query('set local role authenticated');
  pending=supplier('criar',supplierInput({razao_social:'FORNECEDOR UNICIDADE CONCORRENTE'}),1,b).then(value=>({value}),error=>({error}));await waitLock();await a.query('commit');assert.equal((await pending).error?.code,'PT409');await b.query('rollback');
 } finally {await a.query('rollback').catch(()=>{});if(pending)await pending;await b.query('rollback').catch(()=>{});await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(1,'FORNECEDOR_EDITAR') on conflict do nothing");await Promise.all([a.end(),b.end()]);}
});

test('EST-002 duas conexões: replay único, saldo disputado, revogação após lock e conferência concorrente', {skip:!process.env.DATABASE_STOCK_TEST_URL,timeout:30000}, async()=>{
 const a=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL}),b=new pg.Client({connectionString:process.env.DATABASE_STOCK_TEST_URL});let pending;
 const begin=async(client,n=1)=>{await client.query('begin');await client.query("set local statement_timeout='5s'");await client.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(n)]);await client.query('set local role authenticated');};
 let pid;
 const waitLock=async()=>{for(let i=0;i<150;i++){if((await db.query('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,20));}assert.fail('Não aguardou lock esperado');};
 const run=(data,action='registrar')=>{pending=withdrawal(action,data,1,b).then(value=>({value}),error=>({error}));return waitLock();};
 try {
  await a.connect();await b.connect();pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  await db.exec('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await withdrawalSetup();
  const p=await create({descricao:'EST002 produto concorrente'});await confirm((await receive(p.id,{numero_nf:'EST002-CONCORRENTE'})).id,850);await db.exec('commit');
  const body=withdrawalInput(p.id,{chave:key(851)});
  await begin(a);await begin(b);const first=await withdrawal('registrar',body,1,a);await run(body);await a.query('commit');const replay=await pending;assert.ifError(replay.error);assert.deepEqual(replay.value,first);await b.query('commit');
  await begin(a);await begin(b);await withdrawal('registrar',{...body,quantidade:'10',chave:key(852)},1,a);
  await run({...body,quantidade:'10',chave:key(853)});await a.query('commit');assert.equal((await pending).error?.code,'PT409');await b.query('rollback');
  assert.equal((await db.query('select sum(s.quantidade)::text q from erp.saldo_lote_local s join erp.lote l on l.id=s.lote_id where l.produto_id=$1',[p.id])).rows[0].q,'5.000000');
  await a.query('begin');await a.query('select id from erp.produto where id=$1 for no key update',[p.id]);await begin(b);
  await run({...body,quantidade:'1',chave:key(854)});await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='REQUISICAO_REGISTRAR'");await a.query('commit');assert.equal((await pending).error?.code,'PT403');await b.query('rollback');await db.exec("insert into erp.perfil_permissao values(1,'REQUISICAO_REGISTRAR')");
  await begin(a,4);await begin(b,4);await withdrawal('conferir',reviewInput(first.requisicao),1,a);await run(reviewInput(first.requisicao),'conferir');await a.query('commit');assert.equal((await pending).error?.code,'PT412');await b.query('rollback');
  assert.equal((await db.query('select count(*)::int n from erp.requisicao_rapida where produto_id=$1',[p.id])).rows[0].n,2);
  assert.equal((await db.query('select sum(s.quantidade)::text q from erp.saldo_lote_local s join erp.lote l on l.id=s.lote_id where l.produto_id=$1',[p.id])).rows[0].q,'5.000000');
 } finally {await a.query('rollback').catch(()=>{});if(pending)await pending;await b.query('rollback').catch(()=>{});await db.exec('reset role');await db.exec("insert into erp.perfil_permissao values(1,'REQUISICAO_REGISTRAR') on conflict do nothing");await Promise.all([a.end(),b.end()]);}
});
