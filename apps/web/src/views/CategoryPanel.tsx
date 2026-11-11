import { useEffect, useRef, useState } from 'react';
import { categoryErrors } from '@erp/contracts';
import type { Category, CategoryInput, CategoryList, CategoryQuery } from '@erp/contracts';
import { CategoryApi, CategoryRequestError, categoryError } from '../services/category-api.ts';
const types = { ALIMENTO: 'Alimento', LIMPEZA: 'Material de limpeza', DESCARTAVEL: 'Descartável' };
const storage = { SECO: 'Seco', RESFRIADO: 'Resfriado', CONGELADO: 'Congelado' };
type Draft = Omit<CategoryInput, 'dias_alerta_validade'> & { dias_alerta_validade: string };
export function CategoryPanel({ api, unit, onDirty, onBusy }: { api: CategoryApi; unit: string; onDirty: (value: boolean) => void; onBusy: (value: boolean) => void }) {
  const [data, setData] = useState<CategoryList>(); const [search, setSearch] = useState('');
  const [query, setQuery] = useState<CategoryQuery>({ q: '', status: 'ATIVO', ordem: 'asc', offset: 0 });
  const [reload, setReload] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Category>(), [draft, setDraft] = useState<Draft>(), [view, setView] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    let active = true; setLoading(true); setData(undefined); setError('');
    void api.list(unit, query).then(value => { if (active) { setData(value); setLoading(false); } }).catch(err => { if (active) { setError(categoryError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, query, reload]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [draft === undefined]);
  const discard = () => !dirty || window.confirm('Descartar as alterações ainda não salvas?');
  function open(row?: Category, readonly = false) {
    if (!discard()) return; setSelected(row); setView(readonly); setDirty(false); setError(''); setMessage(''); setFields({});
    setDraft(row ? { descricao: row.descricao, tipo_item: row.tipo_item, armazenamento_padrao: row.armazenamento_padrao, dias_alerta_validade: row.dias_alerta_validade === null ? '' : String(row.dias_alerta_validade) }
      : { descricao: '', tipo_item: 'ALIMENTO', armazenamento_padrao: 'SECO', dias_alerta_validade: '' });
  }
  function close() { if (discard()) { setDraft(undefined); setSelected(undefined); setDirty(false); setFields({}); setError(''); } }
  function edit(key: keyof Draft, value: string) { setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true); setMessage(''); }
  async function save() {
    if (!draft || busy || !data?.capacidades.editar) return;
    const raw = draft.dias_alerta_validade.trim();
    const input = { ...draft, descricao: draft.descricao.trim(), dias_alerta_validade: raw === '' ? null : /^(0|[1-9]\d{0,9})$/.test(raw) ? Number(raw) : NaN };
    const invalid = categoryErrors(input); setFields(invalid); if (Object.keys(invalid).length) { setError('Revise os campos indicados.'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await api.save(unit, input, selected); setDraft(undefined); setSelected(undefined); setDirty(false); setMessage('Categoria salva com sucesso.'); setReload(value => value + 1); }
    catch (err) { setError(categoryError(err)); if (err instanceof CategoryRequestError) setFields(err.fields); }
    finally { setBusy(false); }
  }
  async function lifecycle(row: Category, remove = false) {
    if (busy || !data?.capacidades.ciclo_vida || !discard()) return;
    if (!window.confirm(remove ? `Excluir a categoria ${row.descricao}? Esta ação só é permitida sem vínculos.` : `${row.status === 'ATIVO' ? 'Inativar' : 'Ativar'} a categoria ${row.descricao} em todo o catálogo compartilhado? O histórico será preservado.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { if (remove) await api.remove(unit, row); else await api.status(unit, row); setDraft(undefined); setDirty(false); setMessage(remove ? 'Categoria excluída; auditoria preservada.' : 'Status da categoria atualizado.'); setReload(value => value + 1); }
    catch (err) { setError(categoryError(err)); } finally { setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError('');
    try { const blob = await api.exportCsv(unit, query); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'categorias.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (err) { setError(categoryError(err)); } finally { setBusy(false); }
  }
  return <section className="card" aria-label="Cadastro de categorias">
    <p className="notice">Catálogo compartilhado: alterações nesta categoria afetam todas as unidades. Produtos e saldos existentes permanecem preservados.</p>
    {error && <p role="alert" className="notice error">{error}</p>}{message && <p role="status" className="notice success">{message}</p>}
    {draft ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 tabIndex={-1} ref={heading}>{view ? 'Visualizar categoria' : selected ? 'Editar categoria' : 'Nova categoria'}</h2>
      <fieldset disabled={busy || view || !data?.capacidades.editar} className="form-grid">
        <label className="field">Descrição *<input aria-label="Descrição *" value={draft.descricao} maxLength={200} required aria-invalid={!!fields.descricao} aria-describedby={fields.descricao ? 'categoria-descricao-erro' : undefined} onChange={event => edit('descricao', event.target.value)} />{fields.descricao && <span id="categoria-descricao-erro">{fields.descricao}</span>}</label>
        <label className="field">Tipo de item *<select value={draft.tipo_item} onChange={event => edit('tipo_item', event.target.value)}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{fields.tipo_item && <span>{fields.tipo_item}</span>}</label>
        <label className="field">Armazenamento padrão *<select value={draft.armazenamento_padrao} onChange={event => edit('armazenamento_padrao', event.target.value)}>{Object.entries(storage).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{fields.armazenamento_padrao && <span>{fields.armazenamento_padrao}</span>}</label>
        <label className="field">Dias de alerta de validade<input aria-label="Dias de alerta de validade" value={draft.dias_alerta_validade} inputMode="numeric" aria-invalid={!!fields.dias_alerta_validade} aria-describedby="categoria-dias-ajuda categoria-dias-erro" onChange={event => edit('dias_alerta_validade', event.target.value)} /><span id="categoria-dias-ajuda" className="hint">Vazio mantém a herança configurada; zero é um valor válido.</span><span id="categoria-dias-erro">{fields.dias_alerta_validade}</span></label>
      </fieldset>
      {selected && <p>Status: {selected.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</p>}
      <div className="actions"><button type="button" disabled={busy} onClick={close}>Voltar à lista</button>{!view && <button className="primary" disabled={busy || loading || !data?.capacidades.editar}>{busy ? 'Salvando…' : 'Salvar categoria'}</button>}</div>
    </form> : <>
      <div className="section-heading"><h2>Categorias de produtos</h2><button className="primary" disabled={busy || loading || !data?.capacidades.editar} onClick={() => open()}>Incluir categoria</button></div>
      <form className="filters" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, q: search, offset: 0 })); }}>
        <label className="field">Buscar categoria<input value={search} maxLength={200} disabled={busy} onChange={event => setSearch(event.target.value)} /></label>
        <label className="field">Status<select value={query.status} disabled={busy} onChange={event => setQuery(current => ({ ...current, status: event.target.value as CategoryQuery['status'], offset: 0 }))}><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></label>
        <label className="field">Ordenação<select value={query.ordem} disabled={busy} onChange={event => setQuery(current => ({ ...current, ordem: event.target.value as CategoryQuery['ordem'], offset: 0 }))}><option value="asc">Descrição A–Z</option><option value="desc">Descrição Z–A</option></select></label>
        <button disabled={busy}>Buscar</button><button type="button" disabled={busy || loading || !data} onClick={() => void exportCsv()}>Exportar CSV</button>
      </form>
      <p className="hint">A exportação inclui todos os resultados filtrados, até 10000 categorias.</p>
      {loading ? <p role="status">Carregando categorias…</p> : !data ? <button disabled={busy} onClick={() => setReload(value => value + 1)}>Tentar novamente</button> : !data.categorias.length ? <p className="empty">Nenhuma categoria encontrada.</p> : <div className="table-wrap" role="region" tabIndex={0} aria-label="Categorias de produtos"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Armazenamento</th><th>Dias de alerta</th><th>Ações</th></tr></thead><tbody>{data.categorias.map(row => <tr key={row.id}><th scope="row">{row.descricao}</th><td>{types[row.tipo_item]}</td><td>{storage[row.armazenamento_padrao]}</td><td>{row.dias_alerta_validade ?? 'Herdado'}</td><td><div className="actions"><button disabled={busy} onClick={() => open(row, true)} aria-label={`Visualizar ${row.descricao}`}>Visualizar</button><button disabled={busy || !data.capacidades.editar} onClick={() => open(row)} aria-label={`Editar ${row.descricao}`}>Editar</button><button disabled={busy || !data.capacidades.ciclo_vida} onClick={() => void lifecycle(row)} aria-label={`${row.status === 'ATIVO' ? 'Inativar' : 'Ativar'} ${row.descricao}`}>{row.status === 'ATIVO' ? 'Inativar' : 'Ativar'}</button><button disabled={busy || !data.capacidades.ciclo_vida || !row.pode_excluir} title={!row.pode_excluir ? 'Possui vínculos; use a inativação se tiver permissão.' : undefined} aria-label={`Excluir ${row.descricao}`} onClick={() => void lifecycle(row, true)}>Excluir</button></div>{!row.pode_excluir && <span className="hint">Possui vínculos; exclusão bloqueada.</span>}</td></tr>)}</tbody></table></div>}
      {data && <div className="actions"><button disabled={busy || loading || query.offset === 0} onClick={() => setQuery(current => ({ ...current, offset: Math.max(0, current.offset - 50) }))}>Anterior</button><span>{data.total} categorias · página {Math.floor(query.offset / 50) + 1}</span><button disabled={busy || loading || query.offset + 50 >= data.total} onClick={() => setQuery(current => ({ ...current, offset: current.offset + 50 }))}>Próxima</button></div>}
    </>}
  </section>;
}
