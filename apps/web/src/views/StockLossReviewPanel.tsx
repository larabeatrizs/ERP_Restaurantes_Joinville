import { useEffect, useState } from 'react';
import type { PendingStockLoss, StockLossReviewState } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import { decimalLabel } from '../services/stock-api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';

function lossError(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.status === 401) return 'Entre novamente para continuar.';
    if (error.status === 403) return 'A revisão exige uma nutricionista vinculada ou um gestor designado em Bucarein e uma pessoa diferente de quem registrou a perda.';
    if (error.status === 404) return 'A perda está indisponível nesta unidade. Atualize a consulta.';
    if (error.status === 409) return 'A perda pode já ter sido revisada, o saldo pode ser insuficiente ou a competência pode estar fechada.';
  }
  return 'Não foi possível consultar ou revisar as perdas. Tente novamente.';
}

export function StockLossReviewPanel({ api, unit, onBusy }: {
  api: StockApi;
  unit: string;
  onBusy: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<PendingStockLoss[]>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void api.pendingLosses(unit).then(result => {
      if (active) setRows(result.perdas);
    }).catch(err => {
      if (active) {
        setRows(undefined);
        setError(lossError(err));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, unit, reload]);

  function refresh() {
    setError('');
    setLoading(true);
    setReload(value => value + 1);
  }

  async function review(row: PendingStockLoss, decision: StockLossReviewState) {
    const approving = decision === 'APROVADA';
    const effect = approving ? `Baixar ${decimalLabel(row.quantidade)} ${row.unidade_medida} do estoque?` : 'Rejeitar a perda e conservar o saldo?';
    if (!window.confirm(`${row.produto}, lote ${row.lote}. ${effect}`)) return;
    setSaving(true);
    onBusy(true);
    setError('');
    setMessage('');
    try {
      await api.reviewLoss(unit, row.id, decision);
      setMessage(approving ? 'Perda aprovada. A baixa foi registrada no estoque.' : 'Perda rejeitada. O saldo foi preservado.');
      refresh();
    } catch (err) {
      setError(lossError(err));
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  async function downloadPhoto(id: string) {
    setSaving(true);
    onBusy(true);
    setError('');
    try {
      const photo = await api.lossAttachment(unit, id);
      const url = URL.createObjectURL(photo);
      const link = document.createElement('a');
      link.href = url;
      link.download = `perda-${id}.${photo.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(lossError(err));
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  return <section className="card" aria-label="Perdas pendentes">
    <h2>Perdas pendentes</h2>
    {message && <p role="status" className="notice">{message}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {error && !loading && <button type="button" onClick={refresh} disabled={saving}>Atualizar consulta</button>}
    {loading && <Skeleton label="Carregando perdas…" />}
    {!loading && rows?.length === 0 && <p>Nenhuma perda disponível para sua revisão.</p>}
    {!loading && !!rows?.length && <div className="table-wrap" role="region" tabIndex={0} aria-label="Perdas por lote">
      <table>
        <thead><tr><th>Data</th><th>Produto e lote</th><th>Motivo</th><th>Quantidade</th><th>Prejuízo</th><th>Ações</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>{row.data_registro.split('-').reverse().join('/')}</td>
          <td>{row.produto}<br />{row.lote} · {row.local}</td>
          <td>{row.motivo}{row.justificativa && <p>{row.justificativa}</p>}</td>
          <td>{decimalLabel(row.quantidade)} {row.unidade_medida}</td>
          <td>R$ {decimalLabel(row.valor_prejuizo, 2)}</td>
          <td><div className="actions">
            {row.tem_anexo && <button type="button" disabled={saving} aria-label={`Baixar foto da perda ${row.id}`} onClick={() => void downloadPhoto(row.id)}>Baixar foto</button>}
            <button type="button" disabled={saving} aria-label={`Aprovar perda ${row.id}`} onClick={() => void review(row, 'APROVADA')}>Aprovar</button>
            <button type="button" disabled={saving} aria-label={`Rejeitar perda ${row.id}`} onClick={() => void review(row, 'REJEITADA')}>Rejeitar</button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
