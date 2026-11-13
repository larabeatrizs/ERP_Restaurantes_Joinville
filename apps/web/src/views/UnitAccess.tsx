import { useEffect, useState } from 'react';
import type { UnitSummary } from '@erp/contracts';
import { SettingsApi } from '../services/api.ts';
export function UnitAccess({ api, onEnter, onSignOut }: { api: SettingsApi; onEnter: (unit: UnitSummary, name: string) => void; onSignOut: () => Promise<void> }) {
  const [units, setUnits] = useState<UnitSummary[]>(), [selected, setSelected] = useState(''), [name, setName] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setUnits(undefined); setError('');
    void api.units().then(value => { if (active) setUnits(value); }).catch(() => { if (active) setError('Não foi possível consultar suas unidades. Tente novamente.'); });
    void api.identity().then(value => { if (active) setName(value.nome); }).catch(() => { /* Acesso por unidade continua protegido, mesmo sem nome disponível. */ });
    return () => { active = false; };
  }, [api, retry]);
  const unit = units?.find(item => item.id === selected);
  return <main className="login-form"><form onSubmit={event => { event.preventDefault(); if (unit) onEnter(unit, name); }}>
    <h1>Selecionar unidade</h1>{name && <p>Olá, {name}.</p>}<p>Escolha a unidade em que deseja trabalhar. Apenas seus vínculos ativos aparecem aqui.</p>
    {error && <p role="alert">{error}</p>}{!units && !error && <p role="status">Consultando suas unidades…</p>}
    {units && !units.length && <p role="status">Nenhuma unidade ativa vinculada. Procure a administração.</p>}
    <label className="field">Unidade de acesso<select aria-label="Unidade de acesso" required disabled={!units?.length} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Selecione uma unidade</option>{units?.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}</select></label>
    <button className="primary" disabled={!unit}>Acessar unidade</button>{error && <button type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
    <button type="button" onClick={() => { void onSignOut().catch(() => setError('Não foi possível sair. Tente novamente.')); }}>Sair</button>
  </form></main>;
}
