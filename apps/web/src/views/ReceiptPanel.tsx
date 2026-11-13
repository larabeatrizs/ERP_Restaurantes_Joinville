import { useEffect, useRef, useState } from 'react';
import type { EntradaInput, EntradaItemInput, Product, Receipt } from '@erp/contracts';
import { isEntradaInput } from '@erp/contracts';
import { decimalInput, decimalLabel, decimalUnits, stockError } from '../services/stock-api.ts';
import { dateLabel } from './StockPanel.tsx';
import type { StockPageProps } from './StockPanel.tsx';
import { receiptReport } from '../services/stock-reports.ts';
import type { ConsultationReport } from '../services/stock-reports.ts';
import { ReportPreview } from './ReportPreview.tsx';

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
function blankItem(): EntradaItemInput {
  return { produto_id: '', quantidade: '', valor_unitario: '', numero_lote: null, validade: null, camara_id: '', temperatura: null, aspecto_embalagem: '', conformidade: 'CONFORME', motivo: '' };
}
function normalize(draft: EntradaInput, products: Product[]): EntradaInput {
  const result: EntradaInput = {
    ...draft, numero_nf: draft.numero_nf.trim(), total_nota: draft.total_nota?.trim() ? decimalInput(draft.total_nota) : null, observacoes: draft.observacoes.trim(),
    itens: draft.itens.map(item => ({
      ...item, quantidade: decimalInput(item.quantidade), valor_unitario: decimalInput(item.valor_unitario),
      numero_lote: item.numero_lote?.trim() || null, validade: item.validade || null,
      temperatura: item.temperatura?.trim() ? decimalInput(item.temperatura, true) : null,
      aspecto_embalagem: item.aspecto_embalagem.trim(), motivo: item.motivo.trim(),
    })),
  };
  if (!isEntradaInput(result) || result.data_entrada > today()) throw new Error('Confira os campos obrigatórios, a data do recebimento e os valores de cada item.');
  for (const item of result.itens) {
    const product = products.find(product => product.id === item.produto_id);
    if (!product) throw new Error('Selecione um produto ativo para cada item.');
    if (product.perecivel && (!item.validade || item.validade < result.data_entrada)) throw new Error('Produto perecível exige validade igual ou posterior à data do recebimento.');
    if (product.armazenamento !== 'SECO' && item.temperatura === null) throw new Error('Informe a temperatura de recebimento para resfriados e congelados.');
  }
  return result;
}
function divergent(receipt: Receipt): boolean {
  return receipt.total_nota !== null && decimalUnits(receipt.total_nota) !== decimalUnits(receipt.total_itens);
}
const condition = { CONFORME: 'Conforme', RESSALVA: 'Aceito com ressalva', RECUSADO: 'Recusado' };

export function ReceiptPanel({ api, unit, unitName = '', context, onDirty, onBusy }: StockPageProps) {
  const [report, setReport] = useState<ConsultationReport>();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<EntradaInput>();
  const [selected, setSelected] = useState<Receipt>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const keys = useRef(new Map<string, string>());
  const canWrite = context.capacidades.recebimento_escrever;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    let active = true; setLoading(true);
    void api.receipts(unit).then(data => { if (active) { setRows(data.entradas); setLoading(false); } })
      .catch(err => { if (active) { setError(stockError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [api, unit, reload]);
  useEffect(() => {
    let active = true;
    async function loadProducts() {
      const found: Product[] = [];
      let total = 0;
      do {
        const page = await api.products(unit, '', 'ATIVO', found.length);
        if (!active) return;
        total = page.total; found.push(...page.produtos);
        if (!page.produtos.length) break;
      } while (found.length < total);
      if (active) setProducts(found);
    }
    if (canWrite) void loadProducts().catch(err => { if (active) setError(stockError(err)); });
    return () => { active = false; };
  }, [api, unit, canWrite]);
  const discard = () => !dirty || window.confirm('Descartar as alterações ainda não salvas?');
  function open() {
    if (!discard()) return;
    setSelected(undefined); setError(''); setMessage(''); setDirty(false); setReason('');
    setDraft({ data_entrada: today(), fornecedor_id: '', numero_nf: '', total_nota: null, observacoes: '', itens: [blankItem()] });
  }
  function edit<K extends keyof EntradaInput>(key: K, value: EntradaInput[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true); setMessage('');
  }
  function itemEdit<K extends keyof EntradaItemInput>(index: number, key: K, value: EntradaItemInput[K]) {
    if (draft) edit('itens', draft.itens.map((item, row) => row === index ? { ...item, [key]: value } : item));
  }
  async function create() {
    if (!draft || busy || !canWrite) return;
    let input: EntradaInput;
    try { input = normalize(draft, products); } catch (err) { setError((err as Error).message); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const receipt = await api.createReceipt(unit, input);
      setSelected(receipt); setDraft(undefined); setDirty(false); setMessage('Rascunho salvo. Confira os itens antes de confirmar o recebimento.'); setReload(value => value + 1);
    } catch (err) { setError(stockError(err)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!selected || busy || !canWrite || selected.estado !== 'RASCUNHO') return;
    if (!window.confirm('Confirmar este recebimento? Os itens aceitos serão incorporados ao estoque e a entrada não poderá ser editada.')) return;
    const key = keys.current.get(selected.id) ?? crypto.randomUUID(); keys.current.set(selected.id, key);
    setBusy(true); setError(''); setMessage('');
    try {
      const receipt = await api.confirmReceipt(unit, selected.id, key);
      setSelected(receipt); setMessage('Recebimento confirmado. O saldo dos itens aceitos foi atualizado.'); setReload(value => value + 1);
    } catch (err) { setError(stockError(err)); } finally { setBusy(false); }
  }
  async function approve() {
    if (!selected || busy || reason.trim().length < 3 || !context.capacidades.divergencia_aprovar) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const receipt = await api.approveReceipt(unit, selected.id, reason.trim());
      setSelected(receipt); setReason(''); setDirty(false); setMessage('Divergência aprovada. A entrada ainda precisa ser confirmada pelo responsável pelo recebimento.'); setReload(value => value + 1);
    } catch (err) { setError(stockError(err)); } finally { setBusy(false); }
  }
  function back() { if (discard()) { setDraft(undefined); setSelected(undefined); setDirty(false); setError(''); setReason(''); } }
  return <>
    {report && <ReportPreview report={report} onClose={() => setReport(undefined)} />}
    {message && <p role="status" className="success">{message}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {draft ? <form aria-label="Novo recebimento" onSubmit={event => { event.preventDefault(); void create(); }}>
      <fieldset disabled={busy || !canWrite}>
        <section className="card stock-fields"><h2>Dados da nota</h2>
          <div className="row"><label className="field">Fornecedor *<select aria-label="Fornecedor *" required value={draft.fornecedor_id} onChange={e => edit('fornecedor_id', e.target.value)}><option value="">Selecione</option>{context.fornecedores.map(item => <option key={item.id} value={item.id}>{item.razao_social}</option>)}</select></label>
            <label className="field">Número da nota *<input required maxLength={60} value={draft.numero_nf} onChange={e => edit('numero_nf', e.target.value)} /></label></div>
          <div className="row"><label className="field">Data de recebimento *<input type="date" required max={today()} value={draft.data_entrada} onChange={e => edit('data_entrada', e.target.value)} /></label>
            <label className="field">Valor total da nota (R$)<input aria-label="Valor total da nota (R$)" inputMode="decimal" value={draft.total_nota ?? ''} onChange={e => edit('total_nota', e.target.value)} /><span className="hint">Se informado e diferente da soma dos itens, exige aprovação do gestor.</span></label></div>
          <label className="field">Observações<textarea maxLength={2000} value={draft.observacoes} onChange={e => edit('observacoes', e.target.value)} /></label>
        </section>
        <section className="card stock-fields"><h2>Itens recebidos</h2><p className="hint">Informe as quantidades na unidade-base do produto. Campos com * são obrigatórios.</p>
          {draft.itens.map((item, index) => {
            const product = products.find(product => product.id === item.produto_id);
            return <fieldset className="receipt-item" key={index} aria-label={`Item ${index + 1}`}><legend>Item {index + 1}</legend>
              <div className="row"><label className="field">Produto *<select aria-label="Produto *" required value={item.produto_id} onChange={e => itemEdit(index, 'produto_id', e.target.value)}><option value="">Selecione</option>{products.map(product => <option key={product.id} value={product.id}>{product.descricao}{product.complemento ? ` · ${product.complemento}` : ''} ({product.unidade_sigla})</option>)}</select></label>
                <label className="field">Quantidade{product ? ` (${product.unidade_sigla})` : ''} *<input inputMode="decimal" required value={item.quantidade} onChange={e => itemEdit(index, 'quantidade', e.target.value)} /></label>
                <label className="field">Valor unitário (R$) *<input inputMode="decimal" required value={item.valor_unitario} onChange={e => itemEdit(index, 'valor_unitario', e.target.value)} /></label></div>
              <div className="row"><label className="field">Lote<input aria-label="Lote" maxLength={100} value={item.numero_lote ?? ''} onChange={e => itemEdit(index, 'numero_lote', e.target.value)} /><span className="hint">Se vazio, será gerado um identificador único.</span></label>
                <label className="field">Validade{product?.perecivel ? ' *' : ''}<input type="date" min={draft.data_entrada} required={product?.perecivel} value={item.validade ?? ''} onChange={e => itemEdit(index, 'validade', e.target.value || null)} /></label>
                <label className="field">Local de destino *<select aria-label="Local de destino *" required value={item.camara_id} onChange={e => itemEdit(index, 'camara_id', e.target.value)}><option value="">Selecione</option>{context.locais.map(local => <option key={local.id} value={local.id}>{local.nome}</option>)}</select></label></div>
              <div className="row"><label className="field">Temperatura (°C){product && product.armazenamento !== 'SECO' ? ' *' : ''}<input inputMode="decimal" required={!!product && product.armazenamento !== 'SECO'} value={item.temperatura ?? ''} onChange={e => itemEdit(index, 'temperatura', e.target.value || null)} /></label>
                <label className="field">Aspecto da embalagem *<input required maxLength={200} placeholder="Ex.: íntegra e limpa" value={item.aspecto_embalagem} onChange={e => itemEdit(index, 'aspecto_embalagem', e.target.value)} /></label>
                <label className="field">Conformidade *<select value={item.conformidade} onChange={e => itemEdit(index, 'conformidade', e.target.value as EntradaItemInput['conformidade'])}>{Object.entries(condition).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
              <label className="field">Motivo{item.conformidade !== 'CONFORME' ? ' *' : ''}<input maxLength={500} required={item.conformidade !== 'CONFORME'} value={item.motivo} onChange={e => itemEdit(index, 'motivo', e.target.value)} /></label>
              {item.conformidade === 'RECUSADO' && <p className="notice">Item recusado: ficará registrado sem crédito no estoque.</p>}
              <button type="button" disabled={draft.itens.length === 1} onClick={() => edit('itens', draft.itens.filter((_, row) => row !== index))}>Remover item {index + 1}</button>
            </fieldset>;
          })}
          <button type="button" disabled={draft.itens.length >= 50} onClick={() => edit('itens', [...draft.itens, blankItem()])}>Adicionar item</button>
        </section>
      </fieldset>
      <div className="actions footer-actions"><button type="button" disabled={busy} onClick={back}>Cancelar</button><button className="primary" disabled={busy || !canWrite}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button></div>
    </form> : selected ? <>
      <div className="section-heading"><h2>Nota {selected.numero_nf}</h2><span className={`badge ${selected.estado === 'CONFIRMADA' ? 'badge-success' : ''}`}>{selected.estado === 'CONFIRMADA' ? 'Confirmada' : selected.estado === 'ESTORNADA' ? 'Estornada' : 'Rascunho'}</span></div>
      <section className="card stock-fields" aria-label="Detalhes do recebimento"><dl className="receipt-summary"><div><dt>Fornecedor</dt><dd>{selected.fornecedor}</dd></div><div><dt>Data de recebimento</dt><dd>{dateLabel(selected.data_entrada)}</dd></div><div><dt>Valor da nota</dt><dd>{selected.total_nota === null ? 'Não informado' : `R$ ${decimalLabel(selected.total_nota, 2)}`}</dd></div><div><dt>Total dos itens</dt><dd>R$ {decimalLabel(selected.total_itens, 2)}</dd></div></dl>
        {selected.observacoes && <p>{selected.observacoes}</p>}
        <div className="table-wrap" tabIndex={0} aria-label="Itens do recebimento"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Lote</th><th>Validade</th><th>Local</th><th>Valor unitário</th><th>Conformidade</th></tr></thead><tbody>{selected.itens.map((item, index) => <tr key={item.id ?? index}><th scope="row">{item.produto}</th><td className="numeric">{decimalLabel(item.quantidade)} {item.unidade_medida}</td><td>{item.numero_lote ?? 'Gerado ao confirmar'}</td><td>{dateLabel(item.validade)}</td><td>{item.local}</td><td className="numeric">R$ {decimalLabel(item.valor_unitario, 2)}</td><td>{condition[item.conformidade]}{item.motivo && <span className="table-secondary">{item.motivo}</span>}</td></tr>)}</tbody></table></div>
      </section>
      {selected.estado === 'RASCUNHO' && divergent(selected) && <section className="card warning" aria-label="Divergência da nota"><h2>Divergência na entrada</h2><p>A soma dos itens é diferente do valor da nota. A aprovação do gestor deve ser feita por pessoa diferente de quem registrou a entrada.</p>
        {selected.divergencia_aprovada ? <p className="success">Divergência aprovada. O recebimento pode ser confirmado.</p> : context.capacidades.divergencia_aprovar ? <form onSubmit={e => { e.preventDefault(); void approve(); }}><label className="field">Motivo da aprovação<input required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setDirty(e.target.value.length > 0); }} /></label><button className="primary" disabled={busy || reason.trim().length < 3}>Aprovar divergência</button></form> : <p>Aguarde a aprovação do gestor antes de confirmar.</p>}
      </section>}
      {selected.estado === 'CONFIRMADA' && <p className="notice">Entrada confirmada e preservada no histórico. Os itens aceitos já compõem o saldo.</p>}
      <div className="actions footer-actions"><button disabled={busy} onClick={back}>Voltar aos recebimentos</button>{selected.estado === 'RASCUNHO' && <button className="primary confirm-receipt" disabled={busy || !canWrite || (divergent(selected) && !selected.divergencia_aprovada)} onClick={() => void confirm()}>{busy ? 'Confirmando…' : 'Confirmar recebimento'}</button>}</div>
    </> : <>
      <div className="section-heading"><p className="hint">{canWrite ? 'Compras recebidas nesta unidade, com nota fiscal e conferência.' : 'Acesso para consulta dos recebimentos.'}</p><button className="primary" disabled={!canWrite || !context.fornecedores.length || !context.locais.length || !products.length} onClick={open}>Novo recebimento</button></div>
      <section className="card"><div className="section-heading"><h2>Recebimentos recentes</h2><div className="actions"><button disabled={loading || !!error} onClick={() => setReport(receiptReport(rows, unitName))}>Relatório de recebimentos</button><button disabled={loading} onClick={() => setReload(value => value + 1)}>Atualizar recebimentos</button></div></div>
        {loading ? <p role="status">Carregando recebimentos…</p> : rows.length ? <div className="table-wrap" tabIndex={0} aria-label="Lista de recebimentos"><table><thead><tr><th>Nota fiscal</th><th>Fornecedor</th><th>Data</th><th>Total dos itens</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{rows.map(receipt => <tr key={receipt.id}><th scope="row">{receipt.numero_nf}</th><td>{receipt.fornecedor}</td><td>{dateLabel(receipt.data_entrada)}</td><td className="numeric">R$ {decimalLabel(receipt.total_itens, 2)}</td><td><span className="badge">{receipt.estado === 'CONFIRMADA' ? 'Confirmada' : receipt.estado === 'ESTORNADA' ? 'Estornada' : 'Rascunho'}</span>{receipt.estado === 'RASCUNHO' && divergent(receipt) && !receipt.divergencia_aprovada && <span className="table-secondary">Aguarda aprovação de divergência</span>}</td><td><button className="table-action" onClick={() => { setSelected(receipt); setMessage(''); setError(''); setReason(''); }}>Visualizar<span className="sr-only"> nota {receipt.numero_nf}</span></button></td></tr>)}</tbody></table></div> : <p className="empty">Nenhum recebimento registrado nesta unidade.</p>}
        <p className="hint stock-footnote">Até 50 recebimentos mais recentes. Este fluxo recebe compras; doações e estornos serão disponibilizados nos próximos incrementos.</p>
      </section>
    </>}
  </>;
}
