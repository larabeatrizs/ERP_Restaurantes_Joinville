import { useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { StockApi } from '../services/stock-api.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { StockPanel } from './StockPanel.tsx';

export type WorkspacePage = 'configuracoes' | 'produtos' | 'recebimentos' | 'saldo';
export const workspacePages: { key: WorkspacePage; label: string }[] = [
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'recebimentos', label: 'Recebimentos' },
  { key: 'saldo', label: 'Saldo' },
];

export function Workspace({ api, stock, onSignOut }: { api: SettingsApi; stock: StockApi; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkspacePage>('configuracoes');
  const [unit, setUnit] = useState('');
  return page === 'configuracoes'
    ? <SettingsPanel api={api} onSignOut={onSignOut} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} />
    : <StockPanel key={page} api={api} stock={stock} page={page} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} onSignOut={onSignOut} />;
}
