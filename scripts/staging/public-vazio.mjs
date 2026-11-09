// Utilitário restrito às tabelas vazias inventariadas. Não é substituto de pg_dump.
export const legacyTables = ['auditoria', 'categoria', 'cotacao', 'fornecedor', 'lote', 'movimento_estoque', 'perfil', 'prato', 'produto', 'refeicao_servida', 'unidade_medida', 'unidade_restaurante', 'usuario', 'usuario_unidade'];
const identifier = value => '"' + String(value).replaceAll('"', '""') + '"';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const numeric = value => { if (!/^-?\d+$/.test(String(value))) throw Error('Sequência inválida'); return String(value); };
const privilege = value => { if (!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN','USAGE'].includes(value)) throw Error('Privilégio não suportado'); return value; };
const qualified = name => `public.${identifier(name)}`;
const role = name => name === 'PUBLIC' ? 'PUBLIC' : identifier(name);
export function validateSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tables) || !Array.isArray(snapshot.sequences)) throw Error('Snapshot inválido');
  if (!Array.isArray(snapshot.required_extensions) || snapshot.required_extensions.some(extension => extension.name !== 'uuid-ossp' || extension.schema !== 'extensions' || extension.version !== '1.1')) throw Error('Dependência de extensão não suportada');
  if (snapshot.tables.map(table => table.name).sort().join(',') !== legacyTables.join(',')) throw Error('Lista de tabelas divergente');
  if (Object.values(snapshot.unsupported ?? {}).some(count => Number(count) !== 0) || Object.keys(snapshot.unsupported ?? {}).length < 7) throw Error('Há objetos não suportados');
  if (snapshot.tables.some(table => Number(table.count) !== 0)) throw Error('Backup restrito exige tabelas vazias');
  if (snapshot.tables.some(table => table.columns.some(column => column.identity || column.generated))) throw Error('Coluna gerada/identity não suportada');
  if (new Set(snapshot.sequences.map(sequence => sequence.name)).size !== snapshot.sequences.length) throw Error('Sequências duplicadas');
  for (const sequence of snapshot.sequences) { numeric(sequence.last); if (typeof sequence.called !== 'boolean') throw Error('Estado da sequência ausente'); }
}
function restoreAccess(snapshot) {
  const statements = [];
  for (const [kind, objects] of [['TABLE', snapshot.tables], ['SEQUENCE', snapshot.sequences]]) {
    for (const object of objects) {
      // Remover papéis mencionados na cópia, preservando outros acessos administrativos.
      const roles = [...new Set(['PUBLIC','anon','authenticated',...object.acl.map(grant => grant.role)])];
      statements.push(`REVOKE ALL ON ${kind} ${qualified(object.name)} FROM ${roles.map(role).join(', ')};`);
      for (const grant of object.acl) statements.push(`GRANT ${privilege(grant.privilege)} ON ${kind} ${qualified(object.name)} TO ${role(grant.role)}${grant.grant_option ? ' WITH GRANT OPTION' : ''};`);
    }
  }
  for (const table of snapshot.tables) statements.push(`ALTER TABLE ${qualified(table.name)} ${table.rls ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;`, `ALTER TABLE ${qualified(table.name)} ${table.force_rls ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY;`);
  return statements;
}
export function renderRestore(snapshot) {
  validateSnapshot(snapshot);
  const statements = ['BEGIN;', 'SET LOCAL search_path = public, pg_catalog;'];
  for (const extension of snapshot.required_extensions) statements.push(`CREATE SCHEMA IF NOT EXISTS ${identifier(extension.schema)};`, `CREATE EXTENSION IF NOT EXISTS ${identifier(extension.name)} WITH SCHEMA ${identifier(extension.schema)} VERSION ${literal(extension.version)};`);
  for (const sequence of snapshot.sequences) {
    if (!['smallint','integer','bigint'].includes(sequence.type)) throw Error('Tipo de sequência não suportado');
    statements.push(`CREATE SEQUENCE ${qualified(sequence.name)} AS ${sequence.type} INCREMENT BY ${numeric(sequence.increment)} MINVALUE ${numeric(sequence.min)} MAXVALUE ${numeric(sequence.max)} START WITH ${numeric(sequence.start)} CACHE ${numeric(sequence.cache)} ${sequence.cycle ? 'CYCLE' : 'NO CYCLE'};`);
  }
  for (const table of snapshot.tables) {
    statements.push(`CREATE TABLE ${qualified(table.name)} (${table.columns.map(column => `${identifier(column.name)} ${column.type}${column.default ? ` DEFAULT ${column.default}` : ''}${column.not_null ? ' NOT NULL' : ''}`).join(', ')});`);
  }
  for (const table of snapshot.tables) {
    for (const constraint of table.constraints.filter(item => !item.definition.startsWith('FOREIGN KEY'))) statements.push(`ALTER TABLE ${qualified(table.name)} ADD CONSTRAINT ${identifier(constraint.name)} ${constraint.definition};`);
    statements.push(...table.indexes.map(index => index + ';'));
    statements.push(`ALTER TABLE ${qualified(table.name)} OWNER TO ${identifier(table.owner)};`);
  }
  for (const table of snapshot.tables) for (const constraint of table.constraints.filter(item => item.definition.startsWith('FOREIGN KEY'))) statements.push(`ALTER TABLE ${qualified(table.name)} ADD CONSTRAINT ${identifier(constraint.name)} ${constraint.definition};`);
  for (const sequence of snapshot.sequences) {
    if (sequence.owned_table) statements.push(`ALTER SEQUENCE ${qualified(sequence.name)} OWNED BY ${qualified(sequence.owned_table)}.${identifier(sequence.owned_column)};`);
    statements.push(`ALTER SEQUENCE ${qualified(sequence.name)} OWNER TO ${identifier(sequence.owner)};`);
    statements.push(`SELECT setval(${literal(qualified(sequence.name))}, ${numeric(sequence.last)}, ${sequence.called ? 'true' : 'false'});`);
  }
  return [...statements, ...restoreAccess(snapshot), 'COMMIT;'].join('\n') + '\n';
}
function guards(snapshot) {
  const names = snapshot.tables.map(table => literal(table.name)).join(',');
  const seqNames = snapshot.sequences.map(sequence => literal(sequence.name)).join(',');
  return [
    'SET LOCAL lock_timeout = \'5s\';', 'SET LOCAL statement_timeout = \'30s\';',
    `DO $guard$ BEGIN IF (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) IS DISTINCT FROM ARRAY[${names}]::text[] THEN RAISE EXCEPTION 'Tabelas public divergentes'; END IF;
    IF COALESCE((SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'),ARRAY[]::text[]) IS DISTINCT FROM ARRAY[${seqNames}]::text[] THEN RAISE EXCEPTION 'Sequências public divergentes'; END IF;
    IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public') THEN RAISE EXCEPTION 'Políticas public divergentes'; END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attacl IS NOT NULL) THEN RAISE EXCEPTION 'ACL de coluna não suportada'; END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') THEN RAISE EXCEPTION 'Funções public não suportadas'; END IF; END $guard$;`,
    `LOCK TABLE ${snapshot.tables.map(table => qualified(table.name)).join(', ')} IN ACCESS EXCLUSIVE MODE;`,
    `DO $guard$ BEGIN ${snapshot.tables.map(table => `IF EXISTS(SELECT 1 FROM ${qualified(table.name)}) THEN RAISE EXCEPTION 'Tabela não vazia'; END IF;`).join('\n')} END $guard$;`,
  ];
}
export function renderContainment(snapshot) {
  validateSnapshot(snapshot);
  if (snapshot.tables.some(table => table.rls || table.force_rls)) throw Error('Baseline de RLS divergente');
  return ['BEGIN;', ...guards(snapshot),
    ...snapshot.tables.map(table => `ALTER TABLE ${qualified(table.name)} ENABLE ROW LEVEL SECURITY;`),
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;`,
    'COMMIT;'].join('\n') + '\n';
}
export function renderRollback(snapshot) {
  validateSnapshot(snapshot);
  return ['BEGIN;', ...guards(snapshot), ...restoreAccess(snapshot), 'COMMIT;'].join('\n') + '\n';
}
