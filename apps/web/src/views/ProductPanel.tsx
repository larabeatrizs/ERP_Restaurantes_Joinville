import { useEffect, useState } from 'react';
import type { Product, ProdutoInput } from '@erp/contracts';
import { isProdutoInput, productInputFields } from '@erp/contracts';
import { decimalInput, decimalLabel, stockError } from '../services/stock-api.ts';
import type { StockPageProps } from './StockPanel.tsx';

const storage = { SECO: 'Seco', RESFRIADO: 'Resfriado', CONGELADO: 'Congelado' };
function localDraft(product: ProdutoInput): ProdutoInput {
  const copy = Object.fromEntries(productInputFields.map(key => [key, product[key]])) as unknown as ProdutoInput;
  for (const key of ['fator_correcao', 'quantidade_apresentacao', 'estoque_minimo'] as const) copy[key] = copy[key].replace('.', ',');
  for (const key of ['estoque_maximo', 'ponto_reposicao'] as const) copy[key] = copy[key]?.replace('.', ',') ?? null;
  return copy;
}
function normalize(draft: ProdutoInput): ProdutoInput {
  const result = { ...draft, descricao: draft.descricao.trim(), complemento: draft.complemento.trim(), apresentacao_compra: draft.apresentacao_compra.trim() };
  for (const key of ['fator_correcao', 'quantidade_apresentacao', 'estoque_minimo'] as const) result[key] = decimalInput(draft[key]);
  for (const key of ['estoque_maximo', 'ponto_reposicao'] as const) result[key] = draft[key]?.trim() ? decimalInput(draft[key]!) : null;
  if (!isProdutoInput(result)) throw new Error('Confira os campos obrigatórios, os valores positivos e o estoque máximo, que deve ser maior ou igual ao mínimo.');
  return result;
}

export function ProductPanel({ api, unit, context, onDirty, onBusy }: StockPageProps) {
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ATIVO');
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProdutoInput>();
  const [selected, setSelected] = useState<Product>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editable = context.capacidades.produto_escrever;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(saving); return () => onBusy(false); }, [saving, onBusy]);
  useEffect(() => {
    let active = true; setLoading(true);
    void api.products(unit, query, status, offset).then(data => { if (active) { setRows(data.produtos); setTotal(data.total); setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, query, status, offset, reload]);
  const discard = () => !dirty || window.confirm('Descartar as alterações ainda não salvas?');
  function open(product?: Product) {
    if (!discard()) return;
    setSelected(product); setError(''); setMessage(''); setDirty(false);
    setDraft(product ? localDraft(product) : {
      descricao: '', complemento: '', unidade_medida_id: context.medidas[0]?.id ?? '', categoria_id: context.categorias[0]?.id ?? '',
      perecivel: false, armazenamento: context.categorias[0]?.armazenamento_padrao ?? 'SECO', fator_correcao: '1', apresentacao_compra: '',
      quantidade_apresentacao: '1', estoque_minimo: '0', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO',
    });
  }
  function edit<K extends keyof ProdutoInput>(key: K, value: ProdutoInput[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true); setMessage('');
  }
  async function save() {
    if (!draft || !editable || saving) return;
    let input: ProdutoInput;
    try { input = normalize(draft); } catch (err) { setError((err as Error).message); return; }
    if (selected?.status === 'ATIVO' && input.status === 'INATIVO'
      && !window.confirm('Inativar este produto? Ele deixará de aparecer em novos lançamentos e continuará disponível no histórico.')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const product = await api.saveProduct(unit, input, selected);
      setSelected(product); setDraft(localDraft(product)); setDirty(false); setMessage('Produto salvo com sucesso.'); setReload(value => value + 1);
    } catch (err) { setError(stockError(err)); } finally { setSaving(false); }
  }
  return <>
    {message && <p role="status" className="success">{message}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {draft ? <form onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Cadastro de produto">
      <div className="section-heading stock-form-heading"><div><h2>{selected ? editable ? 'Editar produto' : 'Visualizar produto' : 'Novo produto'}</h2><p className="hint">Campos com * são obrigatórios.</p></div><span className="badge">{editable ? 'Edição permitida' : 'Somente leitura'}</span></div>
      <fieldset disabled={saving || !editable}>
        <section className="card stock-fields">
          <div className="row"><label className="field">Nome do produto *<input required maxLength={200} value={draft.descricao} onChange={e => edit('descricao', e.target.value)} /></label>
            <label className="field">Descrição complementar<input aria-label="Descrição complementar" maxLength={200} value={draft.complemento} onChange={e => edit('complemento', e.target.value)} /><span className="hint">Tipo, variedade ou marca, quando necessário.</span></label></div>
          <div className="row"><label className="field">Categoria *<select required value={draft.categoria_id} onChange={e => { edit('categoria_id', e.target.value); const category = context.categorias.find(item => item.id === e.target.value); if (category) edit('armazenamento', category.armazenamento_padrao); }}>
            <option value="">Selecione</option>{context.categorias.map(item => <option key={item.id} value={item.id}>{item.descricao}</option>)}
          </select></label><label className="field">Unidade de medida *<select aria-label="Unidade de medida *" required value={draft.unidade_medida_id} onChange={e => edit('unidade_medida_id', e.target.value)}>
            <option value="">Selecione</option>{context.medidas.map(item => <option key={item.id} value={item.id}>{item.sigla} · {item.descricao}</option>)}
          </select><span className="hint">A unidade-base fica fixa após a primeira movimentação.</span></label></div>
          <div className="row"><label className="field">Armazenamento *<select value={draft.armazenamento} onChange={e => edit('armazenamento', e.target.value as ProdutoInput['armazenamento'])}>{Object.entries(storage).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="field">Perecível *<select aria-label="Perecível *" value={draft.perecivel ? 'SIM' : 'NAO'} onChange={e => edit('perecivel', e.target.value === 'SIM')}><option value="NAO">Não</option><option value="SIM">Sim</option></select><span className="hint">Perecíveis exigem validade no recebimento.</span></label></div>
          <div className="row"><label className="field">Apresentação de compra *<input required maxLength={100} placeholder="Ex.: pacote de 5 kg" value={draft.apresentacao_compra} onChange={e => edit('apresentacao_compra', e.target.value)} /></label>
            <label className="field">Quantidade da apresentação *<input aria-label="Quantidade da apresentação *" required inputMode="decimal" value={draft.quantidade_apresentacao} onChange={e => edit('quantidade_apresentacao', e.target.value)} /><span className="hint">Conteúdo na unidade-base, maior que zero.</span></label></div>
          <h3>Parâmetros da unidade</h3>
          <div className="row"><label className="field">Estoque mínimo *<input required inputMode="decimal" value={draft.estoque_minimo} onChange={e => edit('estoque_minimo', e.target.value)} /></label>
            <label className="field">Estoque máximo<input inputMode="decimal" value={draft.estoque_maximo ?? ''} onChange={e => edit('estoque_maximo', e.target.value)} /></label>
            <label className="field">Ponto de reposição<input inputMode="decimal" value={draft.ponto_reposicao ?? ''} onChange={e => edit('ponto_reposicao', e.target.value)} /></label></div>
          <div className="row"><label className="field">Fator de correção *<input required inputMode="decimal" value={draft.fator_correcao} onChange={e => edit('fator_correcao', e.target.value)} /></label>
            <label className="field">Situação<select value={draft.status} onChange={e => edit('status', e.target.value as ProdutoInput['status'])}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div>
        </section>
      </fieldset>
      <div className="actions footer-actions"><button type="button" disabled={saving} onClick={() => { if (discard()) { setDraft(undefined); setSelected(undefined); setDirty(false); setError(''); setReload(value => value + 1); } }}>Voltar aos produtos</button>
        <button className="primary" disabled={saving || !editable || !dirty}>{saving ? 'Salvando…' : 'Salvar produto'}</button></div>
    </form> : <>
      <div className="section-heading"><p className="hint">{editable ? 'Produtos compartilhados; parâmetros de estoque definidos por unidade.' : 'Acesso somente para consulta.'}</p><button className="primary" disabled={!editable || saving || !context.medidas.length || !context.categorias.length} onClick={() => open()}>Novo produto</button></div>
      <section className="card">
        <form className="stock-filters" aria-label="Filtros de produtos" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setOffset(0); setReload(value => value + 1); }}>
          <label className="field">Buscar produto<input type="search" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /></label>
          <label className="field compact-field">Situação<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></label><button disabled={loading}>Buscar</button>
        </form>
        {loading ? <p role="status">Carregando produtos…</p> : rows.length ? <div className="table-wrap" tabIndex={0} aria-label="Lista de produtos"><table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Armazenamento</th><th>Unidade</th><th>Estoque mínimo</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{rows.map(product => <tr key={product.id}><th scope="row">{product.descricao}<span className="table-secondary">{product.complemento}</span></th><td>{product.categoria_descricao}</td><td>{storage[product.armazenamento]}</td><td>{product.unidade_sigla}</td><td className="numeric">{decimalLabel(product.estoque_minimo)}</td><td><span className="badge">{product.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</span></td><td><button className="table-action" onClick={() => open(product)}>{editable ? 'Editar' : 'Visualizar'}<span className="sr-only"> {product.descricao}</span></button></td></tr>)}</tbody>
        </table></div> : <p className="empty">Nenhum produto encontrado para esta consulta.</p>}
        <div className="pagination"><p className="hint">{total ? `${offset + 1} a ${Math.min(offset + rows.length, total)} de ${total} produtos` : '0 produtos'}</p><div className="actions"><button disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Anterior</button><button disabled={loading || offset + rows.length >= total} onClick={() => setOffset(value => value + 50)}>Próxima</button></div></div>
      </section>
    </>}
  </>;
}
