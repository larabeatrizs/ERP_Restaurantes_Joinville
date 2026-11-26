import { useEffect, useState } from 'react';
import type { MenuDraftDetail, MenuDraftPage } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';

export const mealLabels = { CAFE_MANHA: 'Café da manhã', ALMOCO: 'Almoço', JANTAR: 'Jantar' };
const periodLabels = { SEMANAL: 'Semanal', MENSAL: 'Mensal' };
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function MenuSavedDrafts({ api, unit }: { api: StockApi; unit: string }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [version, setVersion] = useState<string>();
  const [page, setPage] = useState<MenuDraftPage>();
  const [detail, setDetail] = useState<MenuDraftDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
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

  return <section className="card" aria-label="Rascunhos salvos">
    <div className="section-heading">
      <h2>{version ? 'Rascunho salvo' : 'Rascunhos salvos'}</h2>
      {version && <button type="button" onClick={() => { prepareRead(); setVersion(undefined); setDetail(undefined); }}>Voltar aos rascunhos</button>}
    </div>
    {loading && <Skeleton label="Consultando rascunhos…" />}
    {error && <><p role="alert" className="notice error">{error}</p><button type="button"
      onClick={() => { prepareRead(); setReload(value => value + 1); }}>Tentar novamente</button></>}
    {!loading && !error && (version ? detail && <>
      <p>{periodLabels[detail.tipo_periodo]} · {dateLabel(detail.inicio)} a {dateLabel(detail.fim)}</p>
      {!detail.refeicoes.length ? <p>Nenhuma refeição neste rascunho.</p> :
        <div className="table-wrap" role="region" aria-label="Refeições do rascunho" tabIndex={0}>
          <table><thead><tr><th>Data</th><th>Refeição</th><th>Refeições estimadas</th></tr></thead>
            <tbody>{detail.refeicoes.map(row => <tr key={`${row.data}:${row.tipo_refeicao}`}>
              <td>{dateLabel(row.data)}</td><td>{mealLabels[row.tipo_refeicao]}</td><td>{row.estimadas}</td>
            </tr>)}</tbody></table>
        </div>}
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
