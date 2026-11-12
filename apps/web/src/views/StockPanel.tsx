import { CategoryApi } from '../services/category-api.ts';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { StockContext, StockBalance, UnitSummary } from '@erp/contracts';
import { filterBalances, balancesCsv } from '@erp/contracts';
import { SettingsApi } from '../services/api.ts';
import { StockApi, decimalLabel, stockError } from '../services/stock-api.ts';
import { workspacePages } from './Workspace.tsx';
import type { WorkspacePage } from './Workspace.tsx';
import { ProductPanel } from './ProductPanel.tsx';
import { ReceiptPanel } from './ReceiptPanel.tsx';
import { HomePanel } from './HomePanel.tsx';
import { AccountPanel } from './AccountPanel.tsx';
const CategoryPanel = lazy(() => import('./CategoryPanel.tsx').then(module => ({ default: module.CategoryPanel })));

export type StockPageProps = { api: StockApi; unit: string; context: StockContext; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void };
const title = { inicio: 'Início', conta: 'Meu acesso', categorias: 'Categorias de produtos', produtos: 'Produtos e alimentos', recebimentos: 'Entrada de materiais', saldo: 'Saldo de estoque' };
const subtitle = { inicio: 'Resumo do estoque da sua unidade.', conta: 'Identificação e recuperação da sua senha.', categorias: 'Organize o catálogo compartilhado de produtos.', produtos: 'Cadastro do estoque seco, resfriado e congelado.', recebimentos: 'Registre o recebimento de uma nota fiscal.', saldo: 'Consulte os lotes e os locais da unidade selecionada.' };

export function StockPanel({ api, stock, categories, page, onNavigate, initialUnit, onUnitChange, onSignOut, userName }: {
  userName: string;
  categories: CategoryApi; api: SettingsApi; stock: StockApi; page: Exclude<WorkspacePage, 'configuracoes'>; onNavigate: (page: WorkspacePage) => void;
  initialUnit: string; onUnitChange: (unit: string) => void; onSignOut: () => Promise<void>;
}) {
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [unit, setUnit] = useState(initialUnit);
  const [context, setContext] = useState<StockContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api.units().then(list => { if (active) { setUnits(list); setUnit(current => list.some(item => item.id === current) ? current : list[0]?.id ?? ''); if (!list.length) setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, retry]);
  useEffect(() => {
    if (!unit) return;
    let active = true;
    onUnitChange(unit);
    setContext(undefined); setLoading(true); setError('');
    if (page === 'inicio' || page === 'conta') { setLoading(false); return; }
    void stock.context(unit).then(data => { if (active) { setContext(data); setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [stock, unit, retry, onUnitChange, page]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const discard = () => !dirty || window.confirm('Descartar as alterações ainda não salvas?');
  return <div className="shell">
    <a className="skip" href="#conteudo">Ir para o conteúdo</a>
    <aside className="side">
      <div className="brand">Restaurante Popular</div><p className="unit-caption"><strong>{userName || 'Conta conectada'}</strong><br />{units.find(item => item.id === unit)?.nome ?? 'Consultando unidade…'}</p>
      <nav aria-label="Principal">{workspacePages.map(item => <a key={item.key} href={`#${item.key}`} aria-current={item.key === page ? 'page' : undefined} aria-disabled={busy} onClick={event => {
        event.preventDefault(); if (!busy && item.key !== page && discard()) onNavigate(item.key);
      }}>{item.label}</a>)}</nav>
      <button className="signout" disabled={busy} onClick={() => { if (discard()) void onSignOut().catch(err => setError(stockError(err))); }}>Sair</button>
    </aside>
    <main id="conteudo" className="main stock-main">
      <header><p className="eyebrow">GESTÃO DA UNIDADE</p><h1>{title[page]}</h1><p className="muted">{subtitle[page]}</p></header>
      <section className="card unit-card" aria-label="Unidade">
        <label className="field">Unidade<select value={unit} disabled={busy || loading || !units.length} onChange={event => { if (discard()) setUnit(event.target.value); }}>
          {units.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}
        </select></label><p className="hint">Seu vínculo e suas permissões definem as ações disponíveis.</p>
      </section>
      {error && <p role="alert" className="notice error">{error}</p>}
      {loading && <p role="status">Carregando unidade…</p>}
      {!loading && !units.length && !error && <p className="notice">Nenhuma unidade ativa disponível para sua conta. Procure a administração.</p>}
      {!loading && !context && error && <button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
      {!loading && unit && page === 'inicio' && <HomePanel key={unit} api={stock} unit={unit} name={userName} onNavigate={onNavigate} />}
      {!loading && unit && page === 'conta' && <AccountPanel name={userName} />}
      {context && !loading && <>
        {page === 'categorias' && <Suspense fallback={<p role="status">Carregando categorias…</p>}><CategoryPanel key={unit} api={categories} unit={unit} onDirty={setDirty} onBusy={setBusy} /></Suspense>}
        {page === 'produtos' && <ProductPanel key={unit} api={stock} unit={unit} context={context} onDirty={setDirty} onBusy={setBusy} />}
        {page === 'recebimentos' && <ReceiptPanel key={unit} api={stock} unit={unit} context={context} onDirty={setDirty} onBusy={setBusy} />}
        {page === 'saldo' && <Balances key={unit} api={stock} unit={unit} unitName={units.find(item => item.id === unit)?.nome ?? ''} />}
      </>}
    </main>
  </div>;
}

function Balances({ api, unit, unitName }: { api: StockApi; unit: string; unitName: string }) {
  const [rows, setRows] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api.balances(unit).then(data => { if (active) { setRows(data.saldos); setLoading(false); } }).catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, retry]);
  const filtered = filterBalances(rows, query);
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([balancesCsv(filtered, unitName)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'saldos.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="card" aria-label="Consulta de saldo">
    <div className="section-heading"><h2>Posição por lote e local</h2><button disabled={loading} onClick={() => setRetry(value => value + 1)}>Atualizar saldo</button></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="filters"><label className="field">Pesquisar saldos<input value={query} maxLength={200} placeholder="Produto, lote ou local" disabled={loading} onChange={event => setQuery(event.target.value)} /></label><button disabled={loading || !!error || !filtered.length} onClick={exportCsv}>Exportar saldos em CSV</button></div>
    {!loading && !error && <p className="hint">{filtered.length} de {rows.length} posições da unidade selecionada. O CSV respeita a pesquisa.</p>}
    {loading ? <p role="status">Consultando saldos…</p> : !error && !rows.length ? <p className="empty">Nenhum saldo registrado nesta unidade.</p> : !error && !filtered.length ? <p className="empty">Nenhum saldo corresponde à pesquisa.</p> : !error && <div className="table-wrap" tabIndex={0} aria-label="Saldos por lote e local"><table>
      <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th>Saldo</th><th>Valor unitário</th></tr></thead>
      <tbody>{filtered.map(row => <tr key={`${row.lote_id}-${row.camara_id}`}><th scope="row">{row.produto}</th><td>{row.lote}</td><td>{dateLabel(row.validade)}</td><td>{row.local}</td><td className="numeric">{decimalLabel(row.quantidade)} {row.unidade_medida}</td><td className="numeric">R$ {decimalLabel(row.valor_unitario, 2)}</td></tr>)}</tbody>
    </table></div>}
    <p className="hint stock-footnote">Os saldos refletem os recebimentos confirmados. Saídas, perdas e inventário serão disponibilizados nos próximos incrementos.</p>
  </section>;
}

export function dateLabel(value: string | null): string { return value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sem validade'; }
