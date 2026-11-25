import { Skeleton } from './Skeleton.tsx';
import { CategoryApi } from '../services/category-api.ts';
import { MeasureApi } from '../services/measure-api.ts';
import { SupplierApi } from '../services/supplier-api.ts';
import { CalendarApi } from '../services/calendar-api.ts';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { StockContext, StockBalance, StockLossReportFilter, StockLossReportQuery, UnitSummary } from '@erp/contracts';
import { filterBalances, balancesCsv, isStockLossReportQuery, stockLossReportFilterFields } from '@erp/contracts';
import { SettingsApi } from '../services/api.ts';
import { StockApi, decimalLabel, stockError } from '../services/stock-api.ts';
import { workspacePages } from './Workspace.tsx';
import type { WorkspacePage } from './Workspace.tsx';
import { ProductPanel } from './ProductPanel.tsx';
import { ReceiptPanel } from './ReceiptPanel.tsx';
import { WithdrawalPanel } from './WithdrawalPanel.tsx';
import { StockLossRegistrationPanel } from './StockLossRegistrationPanel.tsx';
import { HomePanel } from './HomePanel.tsx';
import { AccountPanel } from './AccountPanel.tsx';
import { ReportPreview } from './ReportPreview.tsx';
import { balanceReport, stockExpiryReport, stockLossReport, stockLossReportFilterLabels, stockMinimumReport, stockValueReport } from '../services/stock-reports.ts';
import type { ConsultationReport } from '../services/stock-reports.ts';
import { StockLedgerPanel } from './StockLedgerPanel.tsx';
const CategoryPanel = lazy(() => import('./CategoryPanel.tsx').then(module => ({ default: module.CategoryPanel })));
const MeasurePanel = lazy(() => import('./MeasurePanel.tsx').then(module => ({ default: module.MeasurePanel })));
const SupplierPanel = lazy(() => import('./SupplierPanel.tsx').then(module => ({ default: module.SupplierPanel })));
const CalendarPanel = lazy(() => import('./CalendarPanel.tsx').then(module => ({ default: module.CalendarPanel })));

export type StockPageProps = { api: StockApi; unit: string; unitName?: string; context: StockContext; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void };
const title = { calendario: 'Calendário e refeições', fornecedores: 'Fornecedores', medidas: 'Unidades de medida', inicio: 'Início', conta: 'Meu acesso', categorias: 'Categorias de produtos', produtos: 'Produtos e alimentos', recebimentos: 'Entrada de materiais', saldo: 'Saldo de estoque' };
const subtitle = { calendario: 'Dias de funcionamento, refeições e datas especiais da unidade.', fornecedores: 'Mantenha os fornecedores do cadastro compartilhado.', medidas: 'Mantenha as unidades do catálogo compartilhado.', inicio: 'Resumo do estoque da sua unidade.', conta: 'Identificação e recuperação da sua senha.', categorias: 'Organize o catálogo compartilhado de produtos.', produtos: 'Cadastro do estoque seco, resfriado e congelado.', recebimentos: 'Registre o recebimento de uma nota fiscal.', saldo: 'Consulte os lotes e os locais da unidade selecionada.' };

export function StockPanel({ api, stock, categories, measures, suppliers, calendar, page, onNavigate, initialUnit, onUnitChange, onSignOut, userName }: {
  calendar: CalendarApi;
  suppliers: SupplierApi;
  measures: MeasureApi;
  userName: string;
  categories: CategoryApi; api: SettingsApi; stock: StockApi; page: Exclude<WorkspacePage, 'configuracoes'>; onNavigate: (page: WorkspacePage) => void;
  initialUnit: string; onUnitChange: (unit: string) => void; onSignOut: () => Promise<void>;
}) {
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [unitsLoaded, setUnitsLoaded] = useState(false);
  const [unit, setUnit] = useState(initialUnit);
  const [context, setContext] = useState<StockContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setUnitsLoaded(false); setLoading(true);
    void api.units().then(list => { if (active) { setUnits(list); setUnitsLoaded(true); setUnit(current => list.some(item => item.id === current) ? current : list[0]?.id ?? ''); if (!list.length) setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); setUnitsLoaded(true); } });
    return () => { active = false; };
  }, [api, retry]);
  useEffect(() => {
    if (!unit || !unitsLoaded || !units.some(item => item.id === unit)) return;
    let active = true;
    onUnitChange(unit);
    setContext(undefined); setLoading(true); setError('');
    if (page === 'inicio' || page === 'conta' || page === 'calendario' || page === 'requisicoes' || page === 'perdas') { setLoading(false); return; }
    void stock.context(unit).then(data => { if (active) { setContext(data); setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [stock, unit, units, unitsLoaded, retry, onUnitChange, page]);
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
      <div className="brand-image sidebar-brand"><img src="/brand/programa.png" alt="Programa Restaurante Popular de Joinville" /></div><p className="unit-caption"><strong>{userName || 'Conta conectada'}</strong><br />{units.find(item => item.id === unit)?.nome ?? 'Consultando unidade…'}</p>
      <nav aria-label="Principal">{workspacePages.map(item => <a key={item.key} href={`#${item.key}`} aria-current={item.key === page ? 'page' : undefined} aria-disabled={busy} onClick={event => {
        event.preventDefault(); if (!busy && item.key !== page && discard()) onNavigate(item.key);
      }}>{item.label}</a>)}</nav>
      <button className="signout" disabled={busy} onClick={() => { if (discard()) void onSignOut().catch(err => setError(stockError(err))); }}>Sair</button>
    </aside>
    <main id="conteudo" tabIndex={-1} className="main stock-main">
      <header><p className="eyebrow">GESTÃO DA UNIDADE</p><h1>{page === 'perdas' ? 'Perdas de estoque' : page === 'requisicoes' ? 'Requisições rápidas' : title[page]}</h1>{page !== 'perdas' && <p className="muted">{page === 'requisicoes' ? 'Registre a retirada no momento em que acontece.' : subtitle[page]}</p>}</header>
      <section className="card unit-card" aria-label="Unidade">
        <label className="field">Unidade<select value={unit} disabled={busy || loading || !unitsLoaded || !units.length} onChange={event => { if (discard()) setUnit(event.target.value); }}>
          {units.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}
        </select></label><p className="hint">Seu vínculo e suas permissões definem as ações disponíveis.</p>
      </section>
      {error && <p role="alert" className="notice error">{error}</p>}
      {loading && <Skeleton label="Carregando unidade…" />}
      {unitsLoaded && !loading && !units.length && !error && <p className="notice">Nenhuma unidade ativa disponível para sua conta. Procure a administração.</p>}
      {!loading && !context && error && <button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
      {unitsLoaded && !loading && units.some(item => item.id === unit) && page === 'inicio' && <HomePanel key={unit} api={stock} unit={unit} name={userName} onNavigate={onNavigate} />}
      {unitsLoaded && !loading && units.some(item => item.id === unit) && page === 'conta' && <AccountPanel name={userName} />}
      {unitsLoaded && !loading && units.some(item => item.id === unit) && page === 'requisicoes' && <WithdrawalPanel key={unit} api={stock} unit={unit} onDirty={setDirty} onBusy={setBusy} />}
      {unitsLoaded && !loading && units.some(item => item.id === unit) && page === 'perdas' && (
        units.find(item => item.id === unit)?.codigo === 'RP-BUCAREIN'
          ? <StockLossRegistrationPanel key={unit} api={stock} unit={unit} onBusy={setBusy} onDirty={setDirty} />
          : <p className="notice">A revisão de perdas está disponível para Bucarein.</p>
      )}
      {unitsLoaded && !loading && units.some(item => item.id === unit) && page === 'calendario' && <Suspense fallback={<Skeleton label="Carregando calendário…" />}><CalendarPanel key={unit} api={calendar} unit={unit} onDirty={setDirty} onBusy={setBusy} /></Suspense>}
      {context && !loading && <>
        {page === 'fornecedores' && <Suspense fallback={<Skeleton label="Carregando fornecedores…" />}><SupplierPanel key={unit} api={suppliers} unit={unit} onDirty={setDirty} onBusy={setBusy} /></Suspense>}
        {page === 'medidas' && <Suspense fallback={<Skeleton label="Carregando medidas…" />}><MeasurePanel key={unit} api={measures} unit={unit} onDirty={setDirty} onBusy={setBusy} /></Suspense>}
        {page === 'categorias' && <Suspense fallback={<Skeleton label="Carregando categorias…" />}><CategoryPanel key={unit} api={categories} unit={unit} onDirty={setDirty} onBusy={setBusy} /></Suspense>}
        {page === 'produtos' && <ProductPanel key={unit} api={stock} unit={unit} unitName={units.find(item => item.id === unit)?.nome ?? ''} context={context} onDirty={setDirty} onBusy={setBusy} />}
        {page === 'recebimentos' && <ReceiptPanel key={unit} api={stock} unit={unit} unitName={units.find(item => item.id === unit)?.nome ?? ''} context={context} onDirty={setDirty} onBusy={setBusy} />}
        {page === 'saldo' && <Balances key={unit} api={stock} unit={unit} unitName={units.find(item => item.id === unit)?.nome ?? ''} userName={userName} />}
      </>}
    </main>
  </div>;
}

function Balances({ api, unit, unitName, userName }: { api: StockApi; unit: string; unitName: string; userName: string }) {
  const [ledgerProduct, setLedgerProduct] = useState<StockBalance>();
  const [report, setReport] = useState<ConsultationReport>();
  const [rows, setRows] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [consultation, setConsultation] = useState<'valor' | 'validade' | 'minimo' | 'perdas'>();
  const [lossPeriod, setLossPeriod] = useState<StockLossReportQuery['periodicidade']>('mensal');
  const [lossDate, setLossDate] = useState('');
  const [lossFilters, setLossFilters] = useState<Partial<Record<StockLossReportFilter, string>>>({});
  const [reportError, setReportError] = useState('');
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
  async function openConsultation(kind: 'valor' | 'validade' | 'minimo') {
    setConsultation(kind);
    setReportError('');
    try {
      const load = {
        valor: () => stockValueReport(api, unit, unitName),
        validade: async () => stockExpiryReport(await api.expiry(unit), unitName),
        minimo: () => stockMinimumReport(api, unit, unitName),
      };
      setReport(await load[kind]());
    } catch (reason) {
      setReportError(reason instanceof Error && reason.message && reason.name === 'Error' ? reason.message : stockError(reason));
    } finally {
      setConsultation(undefined);
    }
  }

  async function openLossReport() {
    const filters = Object.fromEntries(Object.entries(lossFilters).map(([field, value]) => [field, value.trim()]).filter(([, value]) => value));
    const period = { inicio: lossPeriod === 'mensal' ? `${lossDate}-01` : `${lossDate}-01-01`, periodicidade: lossPeriod, ...filters };
    if (!isStockLossReportQuery(period)) {
      setReportError('Informe um período válido para consultar as perdas.');
      return;
    }
    setReportError('');
    setConsultation('perdas');
    try {
      setReport(stockLossReport(await api.lossReport(unit, period), unitName, userName, period));
    } catch {
      setReportError('Não foi possível consultar as perdas deste período.');
    } finally {
      setConsultation(undefined);
    }
  }
  if (ledgerProduct) return <StockLedgerPanel api={api} unit={unit} product={ledgerProduct}
    positions={rows.filter(row => row.produto_id === ledgerProduct.produto_id)}
    onClose={() => setLedgerProduct(undefined)} />;
  return <section className="card" aria-label="Consulta de saldo">
    <div className="section-heading"><h2>Posição por lote e local</h2><button disabled={loading} onClick={() => setRetry(value => value + 1)}>Atualizar saldo</button></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    {reportError && <p role="alert" className="notice error">{reportError}</p>}
    {report && <ReportPreview report={report} onClose={() => setReport(undefined)} />}
    <div className="filters"><label className="field">Pesquisar saldos<input value={query} maxLength={200} placeholder="Produto, lote ou local" disabled={loading} onChange={event => setQuery(event.target.value)} /></label><button disabled={loading || !!error || !filtered.length} onClick={exportCsv}>Exportar saldos em CSV</button><button disabled={loading || !!error} onClick={() => setReport(balanceReport(filtered, unitName, query))}>Relatório de saldos</button></div>
    <div className="actions">
      <button disabled={loading || !!error || !!consultation} onClick={() => void openConsultation('valor')}>{consultation === 'valor' ? 'Consultando valor…' : 'Consultar valor imobilizado'}</button>
      <button disabled={!!consultation} onClick={() => void openConsultation('validade')}>{consultation === 'validade' ? 'Consultando vencimentos…' : 'Consultar vencimentos'}</button>
      <button disabled={!!consultation} onClick={() => void openConsultation('minimo')}>{consultation === 'minimo' ? 'Consultando mínimo…' : 'Consultar estoque mínimo'}</button>
    </div>
    <form className="filters" aria-label="Consulta de perdas" onSubmit={event => { event.preventDefault(); void openLossReport(); }}>
      <label className="field"><span id="perdas-periodicidade-label">Periodicidade das perdas</span>
        <select aria-labelledby="perdas-periodicidade-label" value={lossPeriod} disabled={!!consultation}
          onChange={event => { setLossPeriod(event.target.value === 'anual' ? 'anual' : 'mensal'); setLossDate(''); }}>
          <option value="mensal">Mensal</option><option value="anual">Anual</option>
        </select>
      </label>
      <label className="field">{lossPeriod === 'mensal' ? 'Mês das perdas' : 'Ano das perdas'}
        <input required type={lossPeriod === 'mensal' ? 'month' : 'text'} inputMode={lossPeriod === 'anual' ? 'numeric' : undefined}
          pattern={lossPeriod === 'anual' ? '[0-9]{4}' : undefined} maxLength={lossPeriod === 'anual' ? 4 : undefined}
          value={lossDate} disabled={!!consultation} onChange={event => setLossDate(event.target.value)} />
      </label>
      {(Object.keys(stockLossReportFilterFields) as StockLossReportFilter[]).map(field => (
        <label className="field" key={field}>{field === 'fornecedor' ? 'Fornecedor do lote' : `${stockLossReportFilterLabels[field]} da perda`}
          <input value={lossFilters[field] ?? ''} maxLength={stockLossReportFilterFields[field]} disabled={!!consultation}
            onChange={event => setLossFilters(current => ({ ...current, [field]: event.target.value }))} />
        </label>
      ))}
      <button disabled={!!consultation}>{consultation === 'perdas' ? 'Consultando perdas…' : 'Consultar perdas'}</button>
    </form>
    {!loading && !error && <p className="hint">{filtered.length} de {rows.length} posições da unidade selecionada. O CSV respeita a pesquisa.</p>}
    {loading ? <p role="status">Consultando saldos…</p> : !error && !rows.length ? <p className="empty">Nenhum saldo registrado nesta unidade.</p> : !error && !filtered.length ? <p className="empty">Nenhum saldo corresponde à pesquisa.</p> : !error && <div className="table-wrap" tabIndex={0} aria-label="Saldos por lote e local"><table>
      <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th>Saldo</th><th>Valor unitário</th><th>Ações</th></tr></thead>
      <tbody>{filtered.map(row => <tr key={`${row.lote_id}-${row.camara_id}`}><th scope="row">{row.produto}</th><td>{row.lote}</td><td>{dateLabel(row.validade)}</td><td>{row.local}</td><td className="numeric">{decimalLabel(row.quantidade)} {row.unidade_medida}</td><td className="numeric">R$ {decimalLabel(row.valor_unitario, 2)}</td><td><button type="button" aria-label={`Ver extrato de ${row.produto}, lote ${row.lote}`} onClick={() => setLedgerProduct(row)}>Ver extrato</button></td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function dateLabel(value: string | null): string { return value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sem validade'; }
