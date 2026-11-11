import type { Category, CategoryInput, CategoryList, CategoryQuery } from '@erp/contracts';
import type { StockRuntimeEnv } from './stock-repository.ts';
export interface CategoryRepository {
  list(unit: string, query: CategoryQuery, exporting?: boolean): Promise<CategoryList>;
  save(unit: string, input: CategoryInput, id?: string, revision?: string): Promise<Category>;
  status(unit: string, id: string, revision: string, status: Category['status']): Promise<Category>;
  remove(unit: string, id: string, revision: string): Promise<void>;
}
export type CategorySessionFactory = (env: StockRuntimeEnv, token: string) => { authenticate(): Promise<void>; repository: CategoryRepository };
