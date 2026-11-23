import { useEffect, useRef, useState } from 'react';
import { csvDocument, isStockLedgerFilters, stockLedgerPageSize } from '@erp/contracts';
import type { StockBalance, StockLedger, StockLedgerFilters } from '@erp/contracts';
import { decimalLabel, stockError } from '../services/stock-api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { PaginationArrow } from './PaginationArrow.tsx';
import { Skeleton } from './Skeleton.tsx';

const movements = { ENTRADA: 'Entrada confirmada', REQUISICAO_RAPIDA: 'Requisição rápida' };
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo',
});

export function StockLedgerPanel({ api, unit, product, positions, onClose }: {
  api: StockApi; unit: string; product: StockBalance; positions: StockBalance[]; onClose: () => void;
}) {
  const [selection, setSelection] = useState({ lote_id: '', data_inicio: '', data_fim: '', tipo: '' });
  const [filters, setFilters] = useState<StockLedgerFilters>({ produto_id: product.produto_id });
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<StockLedger>();
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportRequest = useRef<AbortController | null>(null);
  const lots = [...new Map(positions.map(row => [row.lote_id, row.lote])).entries()];
  useEffect(() => () => exportRequest.current?.abort(), [unit]);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setError('');
    void api.ledger(unit, { ...filters, offset, exportar: false })
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(stockError(reason)); });
    return () => { active = false; };
  }, [api, unit, filters, offset, retry]);

  function applyFilters() {
    const next = { produto_id: product.produto_id, ...Object.fromEntries(Object.entries(selection).filter(([, value]) => value)) };
    if (!isStockLedgerFilters(next)) {
      setExportError('Revise o período informado.');
      return;
    }
    setData(undefined);
    setFilters(next);
    setOffset(0);
    setExportError('');
  }

  async function exportCsv() {
    const request = new AbortController();
    exportRequest.current = request;
    setExporting(true);
    setExportError('');
    try {
      const result = await api.ledger(unit, { ...filters, offset: 0, exportar: true }, request.signal);
      if (request.signal.aborted) return;
      if (result.total !== result.itens.length) {
        setExportError('O CSV aceita até 10.000 movimentos. Refine os filtros.');
        return;
      }
      const rows = result.itens.map(row => [
        dateTime.format(new Date(row.ocorrido_em)), movements[row.tipo], product.produto, row.lote, row.local,
        result.unidade_medida, row.quantidade, row.saldo_apos,
      ]);
      const content = csvDocument([['Data e hora', 'Tipo', 'Produto', 'Lote', 'Local', 'Medida', 'Quantidade', 'Saldo após movimentação'], ...rows], [6, 7]);
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'extrato-estoque.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      if (!request.signal.aborted) setExportError(stockError(reason));
    } finally {
      if (!request.signal.aborted) setExporting(false);
    }
  }

  return <section className="card" aria-label="Extrato de movimentações">
    <div className="section-heading">
      <h2>Extrato de {product.produto}</h2>
      <button type="button" onClick={onClose}>Voltar aos saldos</button>
    </div>
    <form className="stock-filters" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
      <label className="field">Lote<select aria-label="Lote" value={selection.lote_id} onChange={event => setSelection({ ...selection, lote_id: event.target.value })}>
        <option value="">Todos os lotes</option>
        {lots.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select></label>
      <label className="field">Data inicial<input type="date" value={selection.data_inicio} onChange={event => setSelection({ ...selection, data_inicio: event.target.value })} /></label>
      <label className="field">Data final<input type="date" value={selection.data_fim} onChange={event => setSelection({ ...selection, data_fim: event.target.value })} /></label>
      <label className="field">Tipo<select aria-label="Tipo" value={selection.tipo} onChange={event => setSelection({ ...selection, tipo: event.target.value })}>
        <option value="">Todos os tipos</option>
        {Object.entries(movements).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button disabled={exporting}>Filtrar</button>
    </form>
    {error && <><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></>}
    {exportError && <p role="alert">{exportError}</p>}
    {!data && !error && <Skeleton label="Consultando movimentações…" />}
    {data && <>
      <div className="section-heading">
        <p><strong>Saldo corrente:</strong> {decimalLabel(data.saldo_corrente)} {data.unidade_medida}</p>
        <button onClick={() => void exportCsv()} disabled={exporting || !data.total}>{exporting ? 'Exportando…' : 'Exportar extrato em CSV'}</button>
      </div>
      {data.itens.length ? <div className="table-wrap" role="region" tabIndex={0} aria-label="Movimentações">
        <table>
          <thead><tr><th>Data e hora</th><th>Tipo</th><th>Lote</th><th>Local</th><th>Quantidade</th><th>Saldo após movimentação</th></tr></thead>
          <tbody>{data.itens.map(row => <tr key={row.id}>
            <td>{dateTime.format(new Date(row.ocorrido_em))}</td><td>{movements[row.tipo]}</td>
            <td>{row.lote}</td><td>{row.local}</td><td className="numeric">{decimalLabel(row.quantidade)}</td>
            <td className="numeric">{decimalLabel(row.saldo_apos)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p>Nenhuma movimentação nesta seleção.</p>}
      <div className="pagination">
        <p className="hint">{data.total} movimentações · Página {offset / stockLedgerPageSize + 1}</p>
        <div className="actions">
          <PaginationArrow direction="previous" disabled={offset === 0 || exporting} onClick={() => setOffset(offset - stockLedgerPageSize)} />
          <PaginationArrow direction="next" disabled={offset + stockLedgerPageSize >= data.total || exporting} onClick={() => setOffset(offset + stockLedgerPageSize)} />
        </div>
      </div>
    </>}
  </section>;
}
