import { CategoryApi } from '../services/category-api.ts';
import { MeasureApi } from '../services/measure-api.ts';
import { SupplierApi } from '../services/supplier-api.ts';
import { useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { StockApi } from '../services/stock-api.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { StockPanel } from './StockPanel.tsx';

export type WorkspacePage = 'inicio' | 'conta' | 'configuracoes' | 'produtos' | 'recebimentos' | 'saldo' | 'categorias' | 'medidas' | 'fornecedores';
export const workspacePages: { key: WorkspacePage; label: string }[] = [
  { key: 'inicio', label: 'Início' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'medidas', label: 'Unidades de medida' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'recebimentos', label: 'Recebimentos' },
  { key: 'saldo', label: 'Saldo' },
  { key: 'conta', label: 'Meu acesso' },
];

export function Workspace({ api, stock, categories, measures, suppliers, onSignOut, initialUnit, userName }: { suppliers: SupplierApi; measures: MeasureApi; initialUnit: string; userName: string; categories: CategoryApi; api: SettingsApi; stock: StockApi; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkspacePage>('inicio');
  const [unit, setUnit] = useState(initialUnit);
  return page === 'configuracoes'
    ? <SettingsPanel userName={userName} api={api} onSignOut={onSignOut} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} />
    : <StockPanel suppliers={suppliers} measures={measures} userName={userName} categories={categories} key={page} api={api} stock={stock} page={page} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} onSignOut={onSignOut} />;
}
