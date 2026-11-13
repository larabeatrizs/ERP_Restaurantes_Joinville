import { CategoryApi } from '../services/category-api.ts';
import { useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { StockApi } from '../services/stock-api.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { StockPanel } from './StockPanel.tsx';

export type WorkspacePage = 'inicio' | 'conta' | 'configuracoes' | 'produtos' | 'recebimentos' | 'saldo' | 'categorias';
export const workspacePages: { key: WorkspacePage; label: string }[] = [
  { key: 'inicio', label: 'Início' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'recebimentos', label: 'Recebimentos' },
  { key: 'saldo', label: 'Saldo' },
  { key: 'conta', label: 'Meu acesso' },
];

export function Workspace({ api, stock, categories, onSignOut, initialUnit, userName }: { initialUnit: string; userName: string; categories: CategoryApi; api: SettingsApi; stock: StockApi; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkspacePage>('inicio');
  const [unit, setUnit] = useState(initialUnit);
  return page === 'configuracoes'
    ? <SettingsPanel userName={userName} api={api} onSignOut={onSignOut} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} />
    : <StockPanel userName={userName} categories={categories} key={page} api={api} stock={stock} page={page} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} onSignOut={onSignOut} />;
}
