import type { Category, CategoryInput, CategoryQuery } from '@erp/contracts';
import type { CategoryRepository } from '../repositories/category-repository.ts';
export class CategoryService {
  private repository: CategoryRepository;
  constructor(repository: CategoryRepository) { this.repository = repository; }
  list(unit: string, query: CategoryQuery, exporting = false) { return this.repository.list(unit, query, exporting); }
  save(unit: string, input: CategoryInput, id?: string, revision?: string) { return this.repository.save(unit, input, id, revision); }
  status(unit: string, id: string, revision: string, status: Category['status']) { return this.repository.status(unit, id, revision, status); }
  remove(unit: string, id: string, revision: string) { return this.repository.remove(unit, id, revision); }
}
