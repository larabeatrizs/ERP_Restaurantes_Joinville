import { useEffect, useRef, useState } from 'react';
import { calendarInput, calendarTemplate, csvDocument, isCalendarInput, isIsoDate, mealTypes } from '@erp/contracts';
import type { CalendarDay, CalendarException, CalendarInput, CalendarMeal, CalendarSnapshot, MealType } from '@erp/contracts';
import { CalendarApi, calendarError } from '../services/calendar-api.ts';
const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const meals: Record<MealType, string> = { CAFE_MANHA: 'Café da manhã', ALMOCO: 'Almoço', JANTAR: 'Jantar' };
const kinds = { FERIADO: 'Feriado (seguir rotina)', FECHADO: 'Fechado', ESPECIAL: 'Funcionamento especial' };
const blank = (): CalendarInput => ({ dias_semana: [], atende_feriados: false, refeicoes: [], excecoes: [] });
const normalize = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const mealLabel = (list: CalendarMeal[]) => list.map(m => `${meals[m.tipo]} ${m.inicio}–${m.fim}${m.capacidade === null ? '' : ` (${m.capacidade} pessoas)`}`).join('; ') || 'Nenhuma refeição';
function today() { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(t => p.find(p => p.type === t)!.value).join('-'); }
function MealFields({ value, onChange, label }: { value: CalendarMeal[]; onChange: (v: CalendarMeal[]) => void; label: string }) {
  function update(type: MealType, patch: Partial<CalendarMeal>) { onChange(value.map(m => m.tipo === type ? { ...m, ...patch } : m)); }
  return <fieldset aria-label={label}><legend>{label}</legend>{mealTypes.map(type => {
    const meal = value.find(m => m.tipo === type);
    return <div className="calendar-meal" key={type}><label><input type="checkbox" checked={!!meal} onChange={e => onChange(e.target.checked ? [...value, { tipo: type, inicio: '', fim: '', capacidade: null }] : value.filter(m => m.tipo !== type))} /> {meals[type]}</label>
      {meal && <div className="row"><label className="field">Início — {meals[type]}<input type="time" value={meal.inicio} onChange={e => update(type, { inicio: e.target.value })} /></label><label className="field">Fim — {meals[type]}<input type="time" value={meal.fim} onChange={e => update(type, { fim: e.target.value })} /></label><label className="field">Capacidade — {meals[type]}<input type="number" min={1} max={2147483647} step={1} placeholder="Não informada" value={meal.capacidade ?? ''} onChange={e => update(type, { capacidade: e.target.value === '' ? null : Number(e.target.value) })} /></label></div>}</div>;
  })}</fieldset>;
}
function Review({ before, after, reason, setReason, busy, error, close, save }: { before: CalendarInput | null; after: CalendarInput; reason: string; setReason: (v: string) => void; busy: boolean; error: string; close: () => void; save: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  const description = (c: CalendarInput | null) => c ? `${c.dias_semana.map(d => days[d]).join(', ') || 'Sem dias'}\nAtende feriados: ${c.atende_feriados ? 'Sim' : 'Não'}\n${mealLabel(c.refeicoes)}` : 'Não configurado';
  const dates = [...new Set([...(before?.excecoes ?? []).map(e => e.data), ...after.excecoes.map(e => e.data)])].sort();
  const changedDates = dates.filter(d => JSON.stringify(before?.excecoes.find(e => e.data === d)) !== JSON.stringify(after.excecoes.find(e => e.data === d)));
  const exception = (e?: CalendarException) => e ? `${kinds[e.tipo]} — ${e.descricao}; ${mealLabel(e.refeicoes)}` : 'Sem exceção';
  return <dialog ref={ref} aria-labelledby="calendar-review-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <h2 id="calendar-review-title">Revisar calendário</h2><div className="calendar-comparison"><section><h3>Antes</h3><p>{description(before)}</p></section><section><h3>Depois</h3><p>{description(after)}</p></section></div>
    {changedDates.length > 0 && <div className="table-wrap" tabIndex={0} aria-label="Revisão de datas especiais"><table><thead><tr><th>Data</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{changedDates.map(d => <tr key={d}><th>{d.split('-').reverse().join('/')}</th><td>{exception(before?.excecoes.find(e => e.data === d))}</td><td>{exception(after.excecoes.find(e => e.data === d))}</td></tr>)}</tbody></table></div>}
    <label className="field">Motivo da alteração *<textarea aria-label="Motivo da alteração *" minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={close}>Voltar à edição</button><button className="primary" disabled={busy || reason.trim().length < 3} onClick={save}>{busy ? 'Salvando…' : 'Salvar calendário'}</button></div>
  </dialog>;
}
export function CalendarPanel({ api, unit, onDirty, onBusy }: { api: CalendarApi; unit: string; onDirty: (v: boolean) => void; onBusy: (v: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>(); const [draft, setDraft] = useState<CalendarInput>(blank);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [retry, setRetry] = useState(0);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [review, setReview] = useState(false), [reason, setReason] = useState('');
  const [q, setQ] = useState(''), [offset, setOffset] = useState(0), [descending, setDescending] = useState(false), [editing, setEditing] = useState<number | null>(null);
  const [date, setDate] = useState(today), [day, setDay] = useState<CalendarDay>(), [dayBusy, setDayBusy] = useState(false), [dayError, setDayError] = useState('');
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(saving); return () => onBusy(false); }, [saving, onBusy]);
  useEffect(() => { let active = true; setLoading(true); setError(''); void api.read(unit).then(s => { if (active) { setSnapshot(s); setDraft(s.calendario ? calendarInput(s.calendario) : blank()); setDirty(false); setLoading(false); setEditing(null); setDay(undefined); } }).catch(e => { if (active) { setError(calendarError(e)); setLoading(false); } }); return () => { active = false; }; }, [api, unit, retry]);
  function change(patch: Partial<CalendarInput>) { setDraft(v => ({ ...v, ...patch })); setDirty(true); setMessage(''); }
  function updateException(patch: Partial<CalendarException>) { if (editing !== null) change({ excecoes: draft.excecoes.map((e, i) => i === editing ? { ...e, ...patch } : e) }); }
  const editable = !!snapshot?.pode_editar;
  const filtered = draft.excecoes.map((e, index) => ({ e, index })).filter(({ e }) => normalize(`${e.data} ${e.descricao}`).includes(normalize(q))).sort((a, b) => (descending ? -1 : 1) * a.e.data.localeCompare(b.e.data));
  const selected = editing === null ? undefined : draft.excecoes[editing];
  async function save() { if (!editable || saving || !isCalendarInput(draft) || reason.trim().length < 3) return; setSaving(true); setError(''); try { const s = await api.save(unit, { ...draft, revisao: snapshot?.calendario?.revisao ?? null, motivo: reason.trim() }); setSnapshot(s); setDraft(calendarInput(s.calendario!)); setDirty(false); setReview(false); setReason(''); setDay(undefined); setMessage('Calendário salvo com sucesso.'); } catch (e) { setError(calendarError(e)); } finally { setSaving(false); } }
  async function consult() { if (dayBusy || !isIsoDate(date)) { setDayError('Informe uma data válida.'); return; } setDayBusy(true); setDayError(''); setDay(undefined); try { setDay(await api.day(unit, date)); } catch (e) { setDayError(calendarError(e)); } finally { setDayBusy(false); } }
  function exportDates() {
    const rows = (snapshot?.calendario?.excecoes ?? []).filter(e => normalize(`${e.data} ${e.descricao}`).includes(normalize(q))).sort((a, b) => (descending ? -1 : 1) * a.data.localeCompare(b.data));
    const csv = csvDocument([['Unidade', 'Data', 'Regime', 'Descrição', 'Refeições'], ...rows.map(e => [snapshot!.unidade.nome, e.data, kinds[e.tipo], e.descricao, mealLabel(e.refeicoes)])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'calendario-datas.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    {loading ? <p role="status">Carregando calendário…</p> : <>
      {error && !review && <p role="alert" className="notice error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
      <div className="section-heading"><p className="hint">{editable ? 'Gestor e nutricionista podem configurar suas unidades autorizadas.' : 'Acesso somente para consulta.'}</p><button disabled={saving} onClick={() => { if (!dirty || window.confirm('Descartar alterações e recarregar o calendário salvo?')) { setRetry(v => v + 1); setReview(false); } }}>Recarregar calendário</button></div>
      {snapshot && <>
        {!snapshot.calendario && <p className="notice">Calendário ainda não configurado. Nenhuma refeição ou horário foi presumido.</p>}
        <fieldset disabled={!editable || saving} className="calendar-editor"><legend>Funcionamento da unidade</legend>
          <section className="card"><h2>Grade semanal</h2><div className="actions"><button type="button" onClick={() => { if (window.confirm('Aplicar a grade do Bucarein à prévia? As datas especiais serão preservadas.')) change({ ...calendarTemplate('RP1'), excecoes: draft.excecoes }); }}>Usar modelo Bucarein</button><button type="button" onClick={() => { if (window.confirm('Aplicar a grade do Adhemar Garcia à prévia? As datas especiais serão preservadas.')) change({ ...calendarTemplate('RP2'), excecoes: draft.excecoes }); }}>Usar modelo Adhemar Garcia</button></div><p className="hint">Modelos preenchem a edição; nada é salvo automaticamente.</p>
            <div className="calendar-days">{days.map((name, d) => <label key={d}><input type="checkbox" checked={draft.dias_semana.includes(d)} onChange={e => change({ dias_semana: e.target.checked ? [...draft.dias_semana, d].sort() : draft.dias_semana.filter(v => v !== d) })} /> {name}</label>)}</div>
            <label><input type="checkbox" checked={draft.atende_feriados} onChange={e => change({ atende_feriados: e.target.checked })} /> Atender feriados nos dias da semana habilitados</label><p className="hint">Feriados precisam ser cadastrados abaixo. Uma data de funcionamento especial substitui a rotina.</p>
            <MealFields label="Refeições regulares" value={draft.refeicoes} onChange={refeicoes => change({ refeicoes })} />
          </section>
        </fieldset>
        <section className="card"><div className="section-heading"><h2>Feriados e datas especiais</h2><div className="actions"><button disabled={!editable || saving || draft.excecoes.length >= 200} onClick={() => { change({ excecoes: [...draft.excecoes, { data: '', tipo: 'FECHADO', descricao: '', refeicoes: [] }] }); setEditing(draft.excecoes.length); }}>Adicionar data especial</button><button disabled={saving || !snapshot.calendario} onClick={exportDates}>Exportar datas salvas em CSV</button></div></div>
          <p className="hint">Até 200 datas por configuração. O CSV usa somente datas salvas e respeita a pesquisa.</p><div className="filters"><label className="field">Pesquisar datas<input maxLength={200} value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} /></label><label className="field">Ordenação das datas<select value={descending ? 'desc' : 'asc'} onChange={e => { setDescending(e.target.value === 'desc'); setOffset(0); }}><option value="asc">Mais antigas primeiro</option><option value="desc">Mais recentes primeiro</option></select></label></div>
          {selected && <fieldset disabled={!editable || saving} aria-label="Edição da data especial"><legend>Data especial</legend><div className="row"><label className="field">Data *<input type="date" value={selected.data} onChange={e => updateException({ data: e.target.value })} /></label><label className="field">Funcionamento na data *<select aria-label="Funcionamento na data *" value={selected.tipo} onChange={e => updateException({ tipo: e.target.value as CalendarException['tipo'], refeicoes: [] })}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label className="field">Descrição da data *<input maxLength={200} value={selected.descricao} onChange={e => updateException({ descricao: e.target.value })} /></label>{selected.tipo === 'ESPECIAL' && <MealFields label="Refeições especiais" value={selected.refeicoes} onChange={refeicoes => updateException({ refeicoes })} />}</fieldset>}{selected && <button type="button" disabled={saving} onClick={() => setEditing(null)}>Fechar visualização da data</button>}
          {filtered.length ? <div className="table-wrap" tabIndex={0} aria-label="Datas especiais"><table><thead><tr><th>Data</th><th>Regime</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>{filtered.slice(offset, offset + 10).map(({ e, index }) => <tr key={index}><th>{e.data ? e.data.split('-').reverse().join('/') : 'Data pendente'}</th><td>{kinds[e.tipo]}</td><td>{e.descricao}</td><td><button className="table-action" onClick={() => setEditing(index)} disabled={saving}>{editable ? 'Editar' : 'Visualizar'} data {e.data || 'pendente'}</button><button className="table-action" disabled={!editable || saving} onClick={() => { if (window.confirm('Remover esta exceção? Após salvar, a data voltará à rotina da unidade.')) { change({ excecoes: draft.excecoes.filter((_, i) => i !== index) }); setEditing(null); setOffset(0); } }}>Remover data {e.data || 'pendente'}</button></td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma data especial nesta pesquisa.</p>}
          <div className="pagination"><p className="hint">{filtered.length} datas · página {Math.floor(offset / 10) + 1}</p><div className="actions"><button disabled={!offset || saving} onClick={() => setOffset(v => Math.max(0, v - 10))}>Anterior</button><button disabled={offset + 10 >= filtered.length || saving} onClick={() => setOffset(v => v + 10)}>Próxima</button></div></div>
        </section>
        <div className="actions footer-actions"><button className="primary" disabled={!editable || !dirty || saving} onClick={() => { if (!isCalendarInput(draft)) { setError('Revise dias únicos, horários de início/fim no mesmo dia, capacidades positivas e datas especiais sem duplicidade.'); return; } setError(''); setReview(true); }}>Revisar calendário</button></div>
        <section className="card"><h2>Consultar funcionamento por data</h2><p className="hint">Usa o calendário salvo. Esta consulta prepara a integração com o planejamento de refeições; não altera estoque.</p><form className="filters" onSubmit={e => { e.preventDefault(); void consult(); }}><label className="field">Data da consulta<input type="date" required value={date} onChange={e => { setDate(e.target.value); setDay(undefined); }} /></label><button disabled={dayBusy || saving}>{dayBusy ? 'Consultando…' : 'Consultar funcionamento'}</button></form>{dayError && <p role="alert" className="notice error">{dayError}</p>}{day && <div role="status"><p>{day.origem === 'NAO_CONFIGURADO' ? 'Calendário não configurado.' : day.aberto ? 'Unidade com refeições nesta data.' : 'Sem refeições nesta data.'}</p><p>{mealLabel(day.refeicoes)}</p><p className="hint">Origem: {day.origem} · revisão {day.revisao ?? 'não configurada'}</p></div>}</section>
      </>}
    </>}
    {review && <Review before={snapshot?.calendario ?? null} after={draft} reason={reason} setReason={setReason} busy={saving} error={error} close={() => setReview(false)} save={() => void save()} />}
  </>;
}
