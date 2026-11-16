import type { CalendarSave, CalendarSnapshot } from '@erp/contracts';
import type { StockRuntimeEnv } from './stock-repository.ts';
export interface CalendarRepository { read(unit: string): Promise<CalendarSnapshot>; save(unit: string, input: CalendarSave): Promise<CalendarSnapshot> }
export type CalendarSessionFactory = (env: StockRuntimeEnv, token: string) => { authenticate(): Promise<void>; repository: CalendarRepository };
