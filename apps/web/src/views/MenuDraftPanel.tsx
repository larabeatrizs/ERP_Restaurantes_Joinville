import { useState } from 'react';
import type { FormEvent } from 'react';
import { isMenuDraft, isMenuPeriod } from '@erp/contracts';
import type { MenuDraft, MenuDraftResult, MenuGrade, MenuMeal, MenuPeriod } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';

const labels = { CAFE_MANHA: 'Café da manhã', ALMOCO: 'Almoço', JANTAR: 'Jantar' };
const mealKey = (meal: MenuMeal) => `${meal.data}:${meal.tipo_refeicao}`;

export function MenuDraftPanel({ api, unit, onDirty, onBusy }: {
  api: StockApi;
  unit: string;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [period, setPeriod] = useState<MenuPeriod>({ tipo_periodo: 'SEMANAL', inicio: '', fim: '' });
  const [selection, setSelection] = useState<{ period: MenuPeriod; grade: MenuGrade }>();
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<MenuDraft>();
  const [created, setCreated] = useState<MenuDraftResult>();
  const [busy, setBusy] = useState<'grade' | 'save'>();
  const [error, setError] = useState('');
  const locked = !!busy || !!pending;

  async function loadGrade(event: FormEvent) {
    event.preventDefault();
    if (!isMenuPeriod(period)) {
      setError('Confira as datas. O período semanal aceita até sete dias e o mensal até 31 dias.');
      return;
    }
    if (Object.values(estimates).some(value => value.trim()) && !window.confirm('Descartar as estimativas desta grade?')) return;
    setBusy('grade');
    onBusy(true);
    setError('');
    setCreated(undefined);
    try {
      setSelection({ period, grade: await api.menuGrade(unit, period) });
      setEstimates({});
      onDirty(false);
    } catch (err) {
      setError(err instanceof RequestError && err.status === 403
        ? 'O planejamento exige perfil de nutricionista com vínculo ativo nesta unidade.'
        : 'Não foi possível consultar as refeições. Tente novamente.');
    } finally {
      setBusy(undefined);
      onBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selection) return;
    const input = pending ?? {
      ...selection.period,
      chave: crypto.randomUUID(),
      refeicoes: selection.grade.refeicoes.flatMap(meal => {
        const value = estimates[mealKey(meal)]?.trim();
        return value ? [{ ...meal, estimadas: /^\d+$/.test(value) ? Number(value) : Number.NaN }] : [];
      }),
    };
    if (!isMenuDraft(input)) {
      setError('Informe uma estimativa inteira e não negativa para pelo menos uma refeição.');
      return;
    }
    setBusy('save');
    onBusy(true);
    setError('');
    try {
      setCreated(await api.createMenuDraft(unit, input));
      setPending(undefined);
      setSelection(undefined);
      setEstimates({});
      onDirty(false);
    } catch (err) {
      if (pending || !(err instanceof RequestError) || err.status >= 500) {
        setPending(input);
        setError('O envio ficou sem confirmação. Reenvie o mesmo rascunho para obter o resultado.');
      } else {
        setError(err.status === 403 ? 'Seu perfil ou vínculo não permite criar o rascunho.'
          : 'O rascunho foi recusado. Confira as estimativas e consulte novamente o calendário se a unidade mudou a programação.');
      }
    } finally {
      setBusy(undefined);
      onBusy(false);
    }
  }

  const samePeriod = selection?.period.inicio === period.inicio && selection.period.fim === period.fim
    && selection.period.tipo_periodo === period.tipo_periodo;
  return <>
    <section className="card" aria-label="Período do cardápio">
      <form className="filters" onSubmit={event => void loadGrade(event)}>
        <label className="field"><span id="cardapio-periodo-label">Tipo de período</span>
          <select aria-labelledby="cardapio-periodo-label" disabled={locked} value={period.tipo_periodo}
            onChange={event => setPeriod({ ...period, tipo_periodo: event.target.value === 'MENSAL' ? 'MENSAL' : 'SEMANAL' })}>
            <option value="SEMANAL">Semanal</option><option value="MENSAL">Mensal</option>
          </select>
        </label>
        <label className="field">Início<input type="date" required disabled={locked} value={period.inicio}
          onChange={event => setPeriod({ ...period, inicio: event.target.value })} /></label>
        <label className="field">Fim<input type="date" required disabled={locked} min={period.inicio || undefined} value={period.fim}
          onChange={event => setPeriod({ ...period, fim: event.target.value })} /></label>
        <button disabled={locked}>Consultar refeições</button>
      </form>
    </section>
    {error && <p className="notice error" role="alert">{error}</p>}
    {created && <p className="notice" role="status">Rascunho #{created.cardapio_id} criado.</p>}
    {busy === 'grade' && <Skeleton label="Consultando refeições…" />}
    {selection && samePeriod && busy !== 'grade' && <section className="card" aria-label="Refeições disponíveis">
      <h2>Refeições disponíveis</h2>
      {!selection.grade.refeicoes.length ? <p>Nenhuma refeição disponível no calendário para este período.</p> :
        <form onSubmit={event => void save(event)}>
          <p className="hint">Preencha a estimativa somente nas refeições que deseja incluir.</p>
          <div className="table-wrap" role="region" aria-label="Grade do cardápio" tabIndex={0}>
            <table>
              <thead><tr><th>Data</th><th>Refeição</th><th>Refeições estimadas</th></tr></thead>
              <tbody>{selection.grade.refeicoes.map(meal => {
                const key = mealKey(meal);
                const date = meal.data.split('-').reverse().join('/');
                return <tr key={key}><td>{date}</td><td>{labels[meal.tipo_refeicao]}</td>
                  <td><input inputMode="numeric" maxLength={10} aria-label={`Estimativa de ${labels[meal.tipo_refeicao]} em ${date}`}
                    disabled={locked} value={estimates[key] ?? ''} onChange={event => {
                      const next = { ...estimates, [key]: event.target.value };
                      setEstimates(next);
                      onDirty(Object.values(next).some(value => value.trim()));
                    }} /></td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="actions footer-actions"><button className="primary" disabled={!!busy}>
            {busy === 'save' ? 'Salvando…' : pending ? 'Reenviar rascunho' : 'Salvar rascunho'}
          </button></div>
        </form>}
    </section>}
  </>;
}
