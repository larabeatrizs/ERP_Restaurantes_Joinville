import { useEffect, useState } from 'react';
import { dishTypes } from '@erp/contracts';
import type { DishRecipe, DishSearchPage, DishSearchQuery, DishType } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { DishRecipeRead } from './DishRecipeRead.tsx';
import { Skeleton } from './Skeleton.tsx';

export function DishSavedPanel({ api, unit }: { api: StockApi; unit: string }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<DishType | ''>('');
  const [applied, setApplied] = useState<DishSearchQuery>({ q: '' });
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<{ id: string; numero: number }>();
  const [page, setPage] = useState<DishSearchPage>();
  const [detail, setDetail] = useState<DishRecipe>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors.at(-1);

  useEffect(() => {
    let active = true;
    const operation = selected
      ? api.dishRecipe(unit, selected.id, selected.numero).then(value => { if (active) setDetail(value); })
      : api.searchDishes(unit, { ...applied, ...(cursor ? { antes: cursor } : {}) }).then(value => { if (active) setPage(value); });
    void operation.catch(reason => {
      if (active) setError(reason instanceof RequestError && reason.status === 403
        ? 'Seu perfil não permite consultar fichas nesta unidade.' : 'Não foi possível consultar as fichas técnicas.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, unit, applied, cursor, selected, attempt]);

  function refresh() { setLoading(true); setError(''); }
  function back() { refresh(); setSelected(undefined); setDetail(undefined); }

  if (detail && !loading && !error) return <DishRecipeRead recipe={detail} action="Voltar à busca" onAction={back} />;
  return <section className="card" aria-label="Fichas salvas">
    {selected ? <button type="button" onClick={back}>Voltar à busca</button> :
      <form className="filters" onSubmit={event => {
        event.preventDefault(); refresh();
        setCursors([]); setApplied({ q: query.trim(), ...(type ? { tipo: type } : {}) });
      }}>
        <label className="field">Nome do prato ou ingrediente<input value={query} maxLength={200} disabled={loading}
          onChange={event => setQuery(event.target.value)} /></label>
        <label className="field"><span id="ficha-salva-tipo-label">Tipo de prato</span>
          <select aria-labelledby="ficha-salva-tipo-label" value={type} disabled={loading}
            onChange={event => setType(event.target.value as DishType | '')}>
            <option value="">Todos</option>{Object.entries(dishTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <button disabled={loading}>Buscar fichas</button>
      </form>}
    {loading && <Skeleton label="Consultando fichas técnicas…" />}
    {error && <><p role="alert" className="notice error">{error}</p>
      <button type="button" onClick={() => { refresh(); setAttempt(value => value + 1); }}>Tentar novamente</button></>}
    {!selected && !loading && !error && page && <>
      {page.pratos.length ? <div className="table-wrap" role="region" tabIndex={0} aria-label="Pratos encontrados">
        <table><thead><tr><th>Prato</th><th>Tipo</th><th>Situação</th><th>Versão</th><th>Ações</th></tr></thead>
          <tbody>{page.pratos.map(row => <tr key={row.id}>
            <td>{row.descricao}</td><td>{dishTypes[row.tipo_prato]}</td><td>{row.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</td><td>{row.numero}</td>
            <td><button type="button" onClick={() => { refresh(); setSelected({ id: row.id, numero: row.numero }); }}>
              Abrir ficha de {row.descricao}
            </button></td>
          </tr>)}</tbody></table>
      </div> : <p>Nenhuma ficha encontrada.</p>}
      {(cursors.length > 0 || page.proximo) && <div className="actions footer-actions">
        <button type="button" disabled={!cursors.length} onClick={() => { refresh(); setCursors(value => value.slice(0, -1)); }}>Página anterior</button>
        <button type="button" disabled={!page.proximo} onClick={() => {
          const next = page.proximo;
          if (next) { refresh(); setCursors(value => [...value, next]); }
        }}>Próxima página</button>
      </div>}
    </>}
  </section>;
}
