import { resolveCalendar } from '@erp/contracts';
import type { CalendarSave } from '@erp/contracts';
import type { CalendarRepository } from '../repositories/calendar-repository.ts';
export class CalendarService {
  private repository: CalendarRepository;
  constructor(repository: CalendarRepository) { this.repository = repository; }
  read(unit: string) { return this.repository.read(unit); }
  save(unit: string, input: CalendarSave) { return this.repository.save(unit, input); }
  async day(unit: string, date: string) { const s = await this.repository.read(unit); return { unidade: s.unidade, funcionamento: resolveCalendar(s.calendario, date) }; }
}
