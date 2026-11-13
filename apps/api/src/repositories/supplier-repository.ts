import type { Supplier, SupplierInput, SupplierList, SupplierQuery } from '@erp/contracts';
import type { StockRuntimeEnv } from './stock-repository.ts';
export interface SupplierRepository {
  list(unit: string, query: SupplierQuery, exporting?: boolean): Promise<SupplierList>;
  save(unit: string, input: SupplierInput, id?: string, revision?: string): Promise<Supplier>;
  status(unit: string, id: string, revision: string, status: Supplier['status']): Promise<Supplier>;
  remove(unit: string, id: string, revision: string): Promise<void>;
}
export type SupplierSessionFactory = (env: StockRuntimeEnv, token: string) => { authenticate(): Promise<void>; repository: SupplierRepository };
