import { useEffect, useState } from 'react';
import { isProductLinkInput } from '@erp/contracts';
import type { CatalogProduct, ProductLinkInput } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import { decimalInput, stockError } from '../services/stock-api.ts';
import type { StockPageProps } from './StockPanel.tsx';
import type { Product } from '@erp/contracts';

export function ProductLinkPanel({ api, unit, context, onDirty, onBusy, onDone, onCancel }: StockPageProps & { onDone: (product: Product) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogProduct>();
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('');
  const [reorder, setReorder] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = context.capacidades.produto_escrever;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(saving); return () => onBusy(false); }, [saving, onBusy]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api.availableProducts(unit, query, offset).then(result => {
      if (active) { setRows(result.produtos); setTotal(result.total); setLoading(false); }
    }).catch(failed => { if (active) { setError(stockError(failed)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, query, offset, reload]);
  function discard() { return !dirty || window.confirm('Descartar os parâmetros ainda não salvos?'); }
  async function save() {
    if (!selected || !editable || saving) return;
    let input: ProductLinkInput;
    try {
      input = { revisao: selected.revisao, estoque_minimo: decimalInput(minimum), estoque_maximo: maximum.trim() ? decimalInput(maximum) : null, ponto_reposicao: reorder.trim() ? decimalInput(reorder) : null };
      if (!isProductLinkInput(input)) throw Error('Confira o mínimo obrigatório e o máximo, que deve ser maior ou igual ao mínimo.');
    } catch (failed) { setError((failed as Error).message); return; }
    setSaving(true); setError('');
    try { const product = await api.linkProduct(unit, selected.id, input); setDirty(false); onDone(product); }
    catch (failed) {
      setError(failed instanceof RequestError && failed.status === 409 ? 'Este produto já foi configurado nesta unidade. Volte à lista de produtos para consultar os parâmetros atuais.'
        : failed instanceof RequestError && failed.status === 412 ? 'O cadastro do produto mudou. Seus parâmetros foram preservados; volte ao catálogo e selecione a versão atual.'
        : failed instanceof RequestError && failed.status === 403 ? 'Você não tem permissão para vincular produtos nesta unidade. Atualize seu acesso ou procure a administração.' : stockError(failed));
    } finally { setSaving(false); }
  }
  return <>
    <div className="section-heading"><div><h2>Vincular produto existente</h2><p className="hint">Use o cadastro compartilhado e defina os parâmetros desta unidade. O vínculo não cria saldo.</p></div></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    {selected ? <form aria-label="Parâmetros do vínculo" onSubmit={event => { event.preventDefault(); void save(); }}>
      <section className="card stock-fields">
        <h3>{selected.descricao}</h3><p>{selected.complemento}</p>
        <p className="hint">{selected.categoria_descricao} · {selected.unidade_sigla} · {selected.apresentacao_compra}</p>
        <fieldset disabled={saving || !editable}>
          <div className="row">
            <label className="field">Estoque mínimo *<input required inputMode="decimal" value={minimum} onChange={e => { setMinimum(e.target.value); setDirty(true); }} /></label>
            <label className="field">Estoque máximo<input inputMode="decimal" value={maximum} onChange={e => { setMaximum(e.target.value); setDirty(true); }} /></label>
            <label className="field">Ponto de reposição<input inputMode="decimal" value={reorder} onChange={e => { setReorder(e.target.value); setDirty(true); }} /></label>
          </div>
        </fieldset>
      </section>
      <div className="actions footer-actions"><button type="button" disabled={saving} onClick={() => { if (discard()) { setSelected(undefined); setDirty(false); setError(''); setReload(v => v + 1); } }}>Voltar ao catálogo</button>
        <button className="primary" disabled={saving || !editable}>{saving ? 'Vinculando…' : 'Vincular à unidade'}</button></div>
    </form> : <section className="card">
      <form className="stock-filters" aria-label="Busca no catálogo compartilhado" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setOffset(0); setReload(v => v + 1); }}>
        <label className="field">Buscar no catálogo<input type="search" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /></label><button disabled={loading}>Buscar</button>
      </form>
      {loading ? <p role="status">Consultando catálogo…</p> : rows.length ? <div className="table-wrap" tabIndex={0} aria-label="Produtos disponíveis para vínculo"><table>
        <thead><tr><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Apresentação</th><th>Ações</th></tr></thead>
        <tbody>{rows.map(product => <tr key={product.id}><th scope="row">{product.descricao}<span className="table-secondary">{product.complemento}</span></th><td>{product.categoria_descricao}</td><td>{product.unidade_sigla}</td><td>{product.apresentacao_compra}</td>
          <td><button disabled={!editable} className="table-action" onClick={() => { setSelected(product); setMinimum('0'); setMaximum(''); setReorder(''); setDirty(false); setError(''); }}>Selecionar<span className="sr-only"> {product.descricao}</span></button></td></tr>)}</tbody>
      </table></div> : <p className="empty">Nenhum produto disponível para vínculo nesta consulta.</p>}
      <div className="pagination"><p className="hint">{total} produtos disponíveis</p><div className="actions"><button disabled={loading || !offset} onClick={() => setOffset(v => Math.max(0, v - 50))}>Anterior</button><button disabled={loading || offset + rows.length >= total} onClick={() => setOffset(v => v + 50)}>Próxima</button></div></div>
    </section>}
    <div className="actions footer-actions"><button disabled={saving} onClick={() => { if (discard()) onCancel(); }}>Voltar aos produtos</button></div>
  </>;
}
