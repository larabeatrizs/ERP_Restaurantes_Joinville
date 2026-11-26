import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { isMenuEstimateChanges } from '@erp/contracts';
import type { MenuDraftDetail, MenuDraftPage } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';

export const mealLabels = { CAFE_MANHA: 'Café da manhã', ALMOCO: 'Almoço', JANTAR: 'Jantar' };
const periodLabels = { SEMANAL: 'Semanal', MENSAL: 'Mensal' };
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function MenuSavedDrafts({ api, unit, onDirty, onBusy }: {
  api: StockApi; unit: string; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [version, setVersion] = useState<string>();
  const [page, setPage] = useState<MenuDraftPage>();
  const [detail, setDetail] = useState<MenuDraftDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [estimates, setEstimates] = useState<Record<string, string>>();
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const cursor = cursors.at(-1);

  useEffect(() => {
    let active = true;
    const operation = version
      ? api.menuDraft(unit, version).then(value => { if (active) setDetail(value); })
      : api.menuDrafts(unit, cursor).then(value => { if (active) setPage(value); });
    void operation.catch(err => {
      if (active) setError(err instanceof RequestError && err.status === 403 ? 'A consulta exige perfil de nutricionista vinculado à unidade.'
        : err instanceof RequestError && err.status === 404 ? 'Rascunho indisponível nesta unidade.'
          : 'Não foi possível consultar os rascunhos. Tente novamente.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, unit, cursor, version, reload]);

  function prepareRead() {
    setLoading(true);
    setError('');
  }

  function cancelEdit() {
    setEstimates(undefined);
    setSaveError('');
    onDirty(false);
  }

  async function saveEstimates(event: FormEvent) {
    event.preventDefault();
    if (!detail || !estimates) return;
    const refeicoes = detail.refeicoes.flatMap(row => {
      const value = estimates[`${row.data}:${row.tipo_refeicao}`]?.trim();
      const count = value && /^\d+$/.test(value) ? Number(value) : Number.NaN;
      return count === row.estimadas ? [] : [{ ...row, estimadas: count }];
    });
    if (!refeicoes.length) { cancelEdit(); return; }
    const changes = { revisao: detail.revisao, refeicoes };
    if (!isMenuEstimateChanges(changes)) { setSaveError('Informe números inteiros e não negativos.'); return; }
    setSaving(true);
    onBusy(true);
    setSaveError('');
    try {
      setDetail(await api.editMenuEstimates(unit, detail.versao_id, changes));
      cancelEdit();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof RequestError && err.status === 412
        ? 'Outra sessão alterou o rascunho. Recarregue a versão antes de editar novamente.'
        : err instanceof RequestError && err.status === 422
          ? 'Confira as estimativas e se as refeições continuam disponíveis no calendário da unidade.'
          : 'Não foi possível confirmar a alteração. Confira a versão antes de reenviar.');
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  return <section className="card" aria-label="Rascunhos salvos">
    <div className="section-heading">
      <h2>{version ? 'Rascunho salvo' : 'Rascunhos salvos'}</h2>
      {version && <button type="button" disabled={saving} onClick={() => {
        if (estimates && !window.confirm('Descartar as estimativas ainda não salvas?')) return;
        cancelEdit(); setSaved(false); prepareRead(); setVersion(undefined); setDetail(undefined);
      }}>Voltar aos rascunhos</button>}
    </div>
    {loading && <Skeleton label="Consultando rascunhos…" />}
    {error && <><p role="alert" className="notice error">{error}</p><button type="button"
      onClick={() => { prepareRead(); setReload(value => value + 1); }}>Tentar novamente</button></>}
    {!loading && !error && (version ? detail && <>
      <p>{periodLabels[detail.tipo_periodo]} · {dateLabel(detail.inicio)} a {dateLabel(detail.fim)}</p>
      {saved && <p role="status" className="notice">Estimativas atualizadas.</p>}
      {saveError && <p role="alert" className="notice error">{saveError}</p>}
      {!detail.refeicoes.length ? <p>Nenhuma refeição neste rascunho.</p> :
        <form onSubmit={event => void saveEstimates(event)}>
          <div className="table-wrap" role="region" aria-label="Refeições do rascunho" tabIndex={0}>
          <table><thead><tr><th>Data</th><th>Refeição</th><th>Refeições estimadas</th></tr></thead>
            <tbody>{detail.refeicoes.map(row => <tr key={`${row.data}:${row.tipo_refeicao}`}>
              <td>{dateLabel(row.data)}</td><td>{mealLabels[row.tipo_refeicao]}</td><td>{estimates
                ? <input inputMode="numeric" maxLength={10} disabled={saving} required
                  aria-label={`Estimativa de ${mealLabels[row.tipo_refeicao]} em ${dateLabel(row.data)}`}
                  value={estimates[`${row.data}:${row.tipo_refeicao}`] ?? ''}
                  onChange={event => {
                    setEstimates({ ...estimates, [`${row.data}:${row.tipo_refeicao}`]: event.target.value });
                    onDirty(true);
                  }} /> : row.estimadas}</td>
            </tr>)}</tbody></table>
          </div>
          <div className="actions footer-actions">
            {estimates ? <>
              <button type="button" disabled={saving} onClick={cancelEdit}>Cancelar edição</button>
              {saveError && <button type="button" disabled={saving} onClick={() => {
                if (!window.confirm('Descartar as estimativas ainda não salvas?')) return;
                cancelEdit(); prepareRead(); setReload(value => value + 1);
              }}>Recarregar versão</button>}
              <button className="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar estimativas'}</button>
            </> : <button type="button" onClick={() => {
              setSaved(false);
              setEstimates(Object.fromEntries(detail.refeicoes.map(row => [`${row.data}:${row.tipo_refeicao}`, String(row.estimadas)])));
            }}>Editar estimativas</button>}
          </div>
        </form>}
    </> : page && <>
      {!page.rascunhos.length ? <p>Nenhum rascunho nesta página.</p> :
        <div className="table-wrap" role="region" aria-label="Lista de rascunhos" tabIndex={0}>
          <table><thead><tr><th>Período</th><th>Tipo</th><th>Ações</th></tr></thead>
            <tbody>{page.rascunhos.map(row => <tr key={row.versao_id}>
              <td>{dateLabel(row.inicio)} a {dateLabel(row.fim)}</td><td>{periodLabels[row.tipo_periodo]}</td>
              <td><button type="button" onClick={() => { prepareRead(); setVersion(row.versao_id); }}>Abrir rascunho #{row.cardapio_id}</button></td>
            </tr>)}</tbody></table>
        </div>}
      {(cursors.length > 0 || page.proximo) && <div className="actions footer-actions">
        <button type="button" disabled={!cursors.length} onClick={() => { prepareRead(); setCursors(value => value.slice(0, -1)); }}>Página anterior</button>
        <button type="button" disabled={!page.proximo} onClick={() => {
          const next = page.proximo;
          if (next) { prepareRead(); setCursors(value => [...value, next]); }
        }}>Próxima página</button>
      </div>}
    </>)}
  </section>;
}
