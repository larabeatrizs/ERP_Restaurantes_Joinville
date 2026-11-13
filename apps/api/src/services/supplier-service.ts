import type { Supplier, SupplierInput, SupplierQuery } from '@erp/contracts';
import type { SupplierRepository } from '../repositories/supplier-repository.ts';
import { canonicalDocument } from '@erp/contracts';
export class SupplierService {
  private repository: SupplierRepository;
  constructor(repository: SupplierRepository) { this.repository = repository; }
  list(unit: string, query: SupplierQuery, exporting = false) { return this.repository.list(unit, query, exporting); }
  save(unit: string, input: SupplierInput, id?: string, revision?: string) { return this.repository.save(unit, { ...input, cnpj_cpf: canonicalDocument(input.cnpj_cpf) }, id, revision); }
  status(unit: string, id: string, revision: string, status: Supplier['status']) { return this.repository.status(unit, id, revision, status); }
  remove(unit: string, id: string, revision: string) { return this.repository.remove(unit, id, revision); }
}
