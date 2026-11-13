import type { Measure, MeasureInput, MeasureQuery } from '@erp/contracts';
import type { MeasureRepository } from '../repositories/measure-repository.ts';
export class MeasureService {
  private repository: MeasureRepository;
  constructor(repository: MeasureRepository) { this.repository = repository; }
  list(unit: string, query: MeasureQuery, exporting = false) { return this.repository.list(unit, query, exporting); }
  save(unit: string, input: MeasureInput, id?: string, revision?: string) { return this.repository.save(unit, input, id, revision); }
  status(unit: string, id: string, revision: string, status: Measure['status']) { return this.repository.status(unit, id, revision, status); }
  remove(unit: string, id: string, revision: string) { return this.repository.remove(unit, id, revision); }
}
