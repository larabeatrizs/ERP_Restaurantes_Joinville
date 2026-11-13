import type { Measure, MeasureInput, MeasureList, MeasureQuery } from '@erp/contracts';
import type { StockRuntimeEnv } from './stock-repository.ts';
export interface MeasureRepository {
  list(unit: string, query: MeasureQuery, exporting?: boolean): Promise<MeasureList>;
  save(unit: string, input: MeasureInput, id?: string, revision?: string): Promise<Measure>;
  status(unit: string, id: string, revision: string, status: Measure['status']): Promise<Measure>;
  remove(unit: string, id: string, revision: string): Promise<void>;
}
export type MeasureSessionFactory = (env: StockRuntimeEnv, token: string) => { authenticate(): Promise<void>; repository: MeasureRepository };
