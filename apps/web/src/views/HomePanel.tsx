import { useEffect, useState } from 'react';
import type { StockBalance } from '@erp/contracts';
import { stockTotalCents } from '@erp/contracts';
import { StockApi, decimalLabel, decimalUnits } from '../services/stock-api.ts';
import type { WorkspacePage } from './Workspace.tsx';
export function stockValue(rows: StockBalance[]): string {
  const cents = stockTotalCents(rows);
  return decimalLabel(`${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, 2);
}
export function HomePanel({ api, unit, name, onNavigate }: { api: StockApi; unit: string; name: string; onNavigate: (page: WorkspacePage) => void }) {
  const [products, setProducts] = useState<number>(), [balances, setBalances] = useState<StockBalance[]>(), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setProducts(undefined); setBalances(undefined); setFailed(false);
    void Promise.allSettled([api.products(unit), api.balances(unit)]).then(([p, b]) => {
      if (!active) return;
      if (p.status === 'fulfilled') setProducts(p.value.total);
      if (b.status === 'fulfilled') setBalances(b.value.saldos);
      setFailed(p.status === 'rejected' || b.status === 'rejected'); setLoading(false);
    }); return () => { active = false; };
  }, [api, unit, retry]);
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <section aria-label="Resumo da unidade"><div className="card home-welcome"><p className="eyebrow">{date}</p><h2>Olá{name ? `, ${name}` : ''}.</h2><p>Acompanhe o estoque da unidade selecionada.</p><button className="primary" onClick={() => onNavigate('recebimentos')}>Consultar recebimentos</button></div>
    {loading && <p role="status">Consultando indicadores…</p>}{failed && <p role="alert">Alguns indicadores não estão disponíveis para sua conta ou não puderam ser carregados. <button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p>}
    <div className="home-metrics"><article className="card"><h3>Produtos ativos</h3><strong>{products ?? '—'}</strong><button onClick={() => onNavigate('produtos')}>Ver produtos</button></article><article className="card"><h3>Lotes com saldo</h3><strong>{balances ? new Set(balances.filter(row => decimalUnits(row.quantidade) > 0n).map(row => row.lote_id)).size : '—'}</strong><button onClick={() => onNavigate('saldo')}>Consultar saldo</button></article><article className="card"><h3>Valor do estoque</h3><strong>{balances ? `R$ ${stockValue(balances)}` : '—'}</strong><p className="hint">Valor dos lotes na unidade, exibido em reais.</p></article></div>
    <div className="card"><h3>Parâmetros da unidade</h3><p>As configurações guardam as regras e os prazos usados nas rotinas do restaurante. Elas ficam separadas deste resumo inicial.</p><button onClick={() => onNavigate('configuracoes')}>Ver configurações</button></div>
  </section>;
}
