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
      (2,'PRODUTO_LER'),(2,'PRODUTO_GERIR'),(2,'ESTOQUE_LER'),(2,'RECEBIMENTO_APROVAR_DIVERGENCIA'),
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

const categoryInput = (extra = {}) => ({ descricao: 'Categoria CAD-003', tipo_item: 'ALIMENTO', armazenamento_padrao: 'SECO', dias_alerta_validade: null, ...extra });
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

test('schema novo tem RLS, executor restrito e nenhum DML cliente ou USAGE auth', async () => {
  const rows = (await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'")).rows;
  assert.equal(rows.length, 20); assert.ok(rows.every((r) => r.relrowsecurity));
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
  assert.deepEqual(ctx.capacidades, { produto_escrever: true, recebimento_escrever: true, divergencia_aprovar: false });
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
