import { useEffect, useState } from 'react';
import type { StockAlert } from '@erp/contracts';
import type { StockApi } from '../services/stock-api.ts';
import { stockError } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';

const labels: Record<StockAlert['tipo'], string> = {
  LOTE_VENCIDO: 'Lote vencido',
  LOTE_A_VENCER: 'Lote a vencer',
  ESTOQUE_MINIMO: 'Estoque no mínimo ou abaixo',
};

export function StockAlertsPanel({ api, unit }: { api: StockApi; unit: string }) {
  const [alerts, setAlerts] = useState<StockAlert[]>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setAlerts(undefined);
    setError('');
    void api.alerts(unit).then(data => {
      if (active) setAlerts(data.alertas);
    }).catch(reason => {
      if (active) setError(stockError(reason));
    });
    return () => { active = false; };
  }, [api, unit, reload]);

  return <section aria-label="Alertas de estoque">
    {!alerts && !error ? <Skeleton label="Consultando alertas…" /> : <>
      <button type="button" onClick={() => setReload(value => value + 1)}>{error ? 'Tentar novamente' : 'Atualizar alertas'}</button>
      {error && <p role="alert" className="error">{error}</p>}
      {alerts?.length === 0 && <p>Nenhum alerta de estoque para sua conta nesta unidade.</p>}
      {!!alerts?.length && <ul>{alerts.map(alert => <li key={`${alert.tipo}-${alert.id}`}>
        <strong>{labels[alert.tipo]}</strong> · {alert.produto}
        {alert.lote && <> · Lote {alert.lote} · Validade {alert.validade?.split('-').reverse().join('/')}</>}
      </li>)}</ul>}
    </>}
  </section>;
}
