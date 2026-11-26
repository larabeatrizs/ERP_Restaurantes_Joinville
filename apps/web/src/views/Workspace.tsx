import { CategoryApi } from '../services/category-api.ts';
import { MeasureApi } from '../services/measure-api.ts';
import { SupplierApi } from '../services/supplier-api.ts';
import { CalendarApi } from '../services/calendar-api.ts';
import { useEffect, useRef, useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { StockApi } from '../services/stock-api.ts';
import { StockPanel } from './StockPanel.tsx';

export type WorkspacePage = 'inicio' | 'conta' | 'calendario' | 'cardapios' | 'produtos' | 'recebimentos' | 'saldo' | 'categorias' | 'medidas' | 'fornecedores' | 'requisicoes' | 'perdas';
export const workspacePages: { key: WorkspacePage; label: string }[] = [
  { key: 'inicio', label: 'Início' },
  { key: 'calendario', label: 'Calendário e refeições' },
  { key: 'cardapios', label: 'Cardápios' },
  { key: 'medidas', label: 'Unidades de medida' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'recebimentos', label: 'Recebimentos' },
  { key: 'requisicoes', label: 'Requisições rápidas' },
  { key: 'saldo', label: 'Saldo' },
  { key: 'perdas', label: 'Perdas' },
  { key: 'conta', label: 'Meu acesso' },
];

export function Workspace({ api, stock, categories, measures, suppliers, calendar, onSignOut, initialUnit, userName }: { calendar: CalendarApi; suppliers: SupplierApi; measures: MeasureApi; initialUnit: string; userName: string; categories: CategoryApi; api: SettingsApi; stock: StockApi; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkspacePage>('inicio');
  const [unit, setUnit] = useState(initialUnit);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current !== page) document.getElementById('conteudo')?.focus();
    previousPage.current = page;
  }, [page]);
  return <StockPanel calendar={calendar} suppliers={suppliers} measures={measures} userName={userName} categories={categories} key={page} api={api} stock={stock} page={page} onNavigate={setPage} initialUnit={unit} onUnitChange={setUnit} onSignOut={onSignOut} />;
}
