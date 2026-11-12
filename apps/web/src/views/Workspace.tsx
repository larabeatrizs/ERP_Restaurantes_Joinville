import { MeasureApi } from '../services/measure-api.ts';
import { CategoryApi } from '../services/category-api.ts';
import { useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { StockApi } from '../services/stock-api.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { StockPanel } from './StockPanel.tsx';

export type WorkspacePage = 'configuracoes' | 'produtos' | 'recebimentos' | 'saldo' | 'categorias' | 'medidas';
export const workspacePages: { key: WorkspacePage; label: string }[] = [
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'medidas', label: 'Unidades de medida' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'recebimentos', label: 'Recebimentos' },
  { key: 'saldo', label: 'Saldo' },
];

export function Workspace({ api, stock, categories, measures, onSignOut }: { measures: MeasureApi; categories: CategoryApi; api: SettingsApi; stock: StockApi; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkspacePage>('configuracoes');
  const [unit, setUnit] = useState('');
  return page === 'configuracoes'
    ? <SettingsPanel api={api} onSignOut={onSignOut} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} />
    : <StockPanel measures={measures} categories={categories} key={page} api={api} stock={stock} page={page} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} onSignOut={onSignOut} />;
}
