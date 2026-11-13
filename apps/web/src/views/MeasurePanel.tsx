import { useEffect, useRef, useState } from 'react';
import { measureErrors } from '@erp/contracts';
import type { Measure, MeasureInput, MeasureList, MeasureQuery } from '@erp/contracts';
import { decimalInput, decimalLabel } from '../services/stock-api.ts';
import { MeasureApi, MeasureRequestError, measureError } from '../services/measure-api.ts';
const dimensions = { MASSA: 'Massa', VOLUME: 'Volume', CONTAGEM: 'Contagem' };
type Draft = Omit<MeasureInput, 'fator_base'> & { fator_base: string };
export function MeasurePanel({ api, unit, onDirty, onBusy }: { api: MeasureApi; unit: string; onDirty: (value: boolean) => void; onBusy: (value: boolean) => void }) {
  const [data, setData] = useState<MeasureList>(); const [search, setSearch] = useState('');
  const [query, setQuery] = useState<MeasureQuery>({ q: '', status: 'ATIVO', ordem: 'asc', offset: 0 });
  const [reload, setReload] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Measure>(), [draft, setDraft] = useState<Draft>(), [view, setView] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    let active = true; setLoading(true); setData(undefined); setError('');
    void api.list(unit, query).then(value => { if (active) { setData(value); setLoading(false); } }).catch(err => { if (active) { setError(measureError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, query, reload]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [draft === undefined]);
  const discard = () => !dirty || window.confirm('Descartar as alterações ainda não salvas?');
  function open(row?: Measure, readonly = false) {
    if (!discard()) return; setSelected(row); setView(readonly); setDirty(false); setError(''); setMessage(''); setFields({});
    setDraft(row ? { sigla: row.sigla, descricao: row.descricao, grandeza: row.grandeza, fator_base: row.fator_base?.replace('.', ',') ?? '' } : { sigla: '', descricao: '', grandeza: 'MASSA', fator_base: '' });
  }
  function close() { if (discard()) { setDraft(undefined); setSelected(undefined); setDirty(false); setFields({}); setError(''); } }
  function edit(key: keyof Draft, value: string) { setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true); setMessage(''); }
  async function save() {
    if (!draft || busy || !data?.capacidades.editar) return;
    let factor: string | null;
    try { factor = draft.fator_base.trim() ? decimalInput(draft.fator_base) : null; } catch { setFields({fator_base:'Informe um decimal positivo com até seis casas.'}); setError('Revise o fator-base.'); return; }
    const input = { ...draft, sigla: draft.sigla.trim(), descricao: draft.descricao.trim(), fator_base: factor };
    const invalid = measureErrors(input); setFields(invalid); if (Object.keys(invalid).length) { setError('Revise os campos indicados.'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await api.save(unit, input, selected); setDraft(undefined); setSelected(undefined); setDirty(false); setMessage('Medida salva com sucesso.'); setReload(value => value + 1); }
    catch (err) { setError(measureError(err)); if (err instanceof MeasureRequestError) setFields(err.fields); }
    finally { setBusy(false); }
  }
  async function lifecycle(row: Measure, remove = false) {
    if (busy || !data?.capacidades.ciclo_vida || !discard()) return;
    if (!window.confirm(remove ? `Excluir a medida ${row.descricao}? Esta ação só é permitida sem vínculos.` : `${row.status === 'ATIVO' ? 'Inativar' : 'Ativar'} a medida ${row.descricao} em todo o catálogo compartilhado? O histórico será preservado.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { if (remove) await api.remove(unit, row); else await api.status(unit, row); setDraft(undefined); setDirty(false); setMessage(remove ? 'Medida excluída; auditoria preservada.' : 'Status da medida atualizado.'); setReload(value => value + 1); }
    catch (err) { setError(measureError(err)); } finally { setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError('');
    try { const blob = await api.exportCsv(unit, query); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'medidas.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (err) { setError(measureError(err)); } finally { setBusy(false); }
  }
  return <section className="card" aria-label="Cadastro de medidas">
    <p className="notice">Catálogo compartilhado: alterações nesta medida afetam todas as unidades. Produtos e saldos existentes permanecem preservados.</p>
    {error && <p role="alert" className="notice error">{error}</p>}{message && <p role="status" className="notice success">{message}</p>}
    {draft ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 tabIndex={-1} ref={heading}>{view ? 'Visualizar medida' : selected ? 'Editar medida' : 'Nova medida'}</h2>
      <fieldset disabled={busy || view || !data?.capacidades.editar} className="form-grid">
        <label className="field">Descrição *<input aria-label="Descrição *" value={draft.descricao} maxLength={200} required aria-invalid={!!fields.descricao} aria-describedby={fields.descricao ? 'medida-descricao-erro' : undefined} onChange={event => edit('descricao', event.target.value)} />{fields.descricao && <span id="medida-descricao-erro">{fields.descricao}</span>}</label>
        <label className="field">Sigla *<input aria-label="Sigla *" value={draft.sigla} maxLength={12} required aria-invalid={!!fields.sigla} aria-describedby="medida-sigla-erro" onChange={event => edit('sigla', event.target.value)} /><span id="medida-sigla-erro">{fields.sigla}</span></label>
        <label className="field">Grandeza *<select value={draft.grandeza} onChange={event => edit('grandeza', event.target.value)}>{Object.entries(dimensions).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>{fields.grandeza && <span>{fields.grandeza}</span>}</label>
        <label className="field">Fator-base<input aria-label="Fator-base" value={draft.fator_base} inputMode="decimal" aria-invalid={!!fields.fator_base} aria-describedby="medida-fator-ajuda medida-fator-erro" onChange={event => edit('fator_base', event.target.value)} /><span id="medida-fator-ajuda" className="hint">Decimal positivo, por exemplo 0,001 para grama em kg. Vazio significa fator não informado.</span><span id="medida-fator-erro">{fields.fator_base}</span></label>
      </fieldset>
      {selected && <p>Status: {selected.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</p>}
      <div className="actions"><button type="button" disabled={busy} onClick={close}>Voltar à lista</button>{!view && <button className="primary" disabled={busy || loading || !data?.capacidades.editar}>{busy ? 'Salvando…' : 'Salvar medida'}</button>}</div>
    </form> : <>
      <div className="section-heading"><h2>Unidades de medida</h2><button className="primary" disabled={busy || loading || !data?.capacidades.editar} onClick={() => open()}>Incluir medida</button></div>
      <form className="filters" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, q: search, offset: 0 })); }}>
        <label className="field">Buscar medida<input value={search} maxLength={200} disabled={busy} onChange={event => setSearch(event.target.value)} /></label>
        <label className="field">Status<select value={query.status} disabled={busy} onChange={event => setQuery(current => ({ ...current, status: event.target.value as MeasureQuery['status'], offset: 0 }))}><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></label>
        <label className="field">Ordenação<select value={query.ordem} disabled={busy} onChange={event => setQuery(current => ({ ...current, ordem: event.target.value as MeasureQuery['ordem'], offset: 0 }))}><option value="asc">Descrição A–Z</option><option value="desc">Descrição Z–A</option></select></label>
        <button disabled={busy}>Buscar</button><button type="button" disabled={busy || loading || !data} onClick={() => void exportCsv()}>Exportar CSV</button>
      </form>
      <p className="hint">A exportação inclui todos os resultados filtrados, até 10000 medidas.</p>
      {loading ? <p role="status">Carregando medidas…</p> : !data ? <button disabled={busy} onClick={() => setReload(value => value + 1)}>Tentar novamente</button> : !data.medidas.length ? <p className="empty">Nenhuma medida encontrada.</p> : <div className="table-wrap" role="region" tabIndex={0} aria-label="Unidades de medida"><table><thead><tr><th>Descrição</th><th>Sigla</th><th>Grandeza</th><th>Fator-base</th><th>Ações</th></tr></thead><tbody>{data.medidas.map(row => <tr key={row.id}><th scope="row">{row.descricao}</th><td>{row.sigla}</td><td>{dimensions[row.grandeza]}</td><td>{row.fator_base === null ? 'Não informado' : decimalLabel(row.fator_base)}</td><td><div className="actions"><button disabled={busy} onClick={() => open(row, true)} aria-label={`Visualizar ${row.descricao}`}>Visualizar</button><button disabled={busy || !data.capacidades.editar} onClick={() => open(row)} aria-label={`Editar ${row.descricao}`}>Editar</button><button disabled={busy || !data.capacidades.ciclo_vida} onClick={() => void lifecycle(row)} aria-label={`${row.status === 'ATIVO' ? 'Inativar' : 'Ativar'} ${row.descricao}`}>{row.status === 'ATIVO' ? 'Inativar' : 'Ativar'}</button><button disabled={busy || !data.capacidades.ciclo_vida || !row.pode_excluir} title={!row.pode_excluir ? 'Possui vínculos; use a inativação se tiver permissão.' : undefined} aria-label={`Excluir ${row.descricao}`} onClick={() => void lifecycle(row, true)}>Excluir</button></div>{!row.pode_excluir && <span className="hint">Possui vínculos; exclusão bloqueada.</span>}</td></tr>)}</tbody></table></div>}
      {data && <div className="actions"><button disabled={busy || loading || query.offset === 0} onClick={() => setQuery(current => ({ ...current, offset: Math.max(0, current.offset - 50) }))}>Anterior</button><span>{data.total} medidas · página {Math.floor(query.offset / 50) + 1}</span><button disabled={busy || loading || query.offset + 50 >= data.total} onClick={() => setQuery(current => ({ ...current, offset: current.offset + 50 }))}>Próxima</button></div>}
    </>}
  </section>;
}
