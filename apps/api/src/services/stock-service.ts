import type { EntradaInput, ProductQuery, ProdutoInput } from '@erp/contracts';
import type { StockRepository } from '../repositories/stock-repository.ts';

/** Casos de uso de estoque independentes das capacidades de configurações. */
export class StockService {
  private readonly repository: StockRepository;
  constructor(repository: StockRepository) { this.repository = repository; }
  context(unit: string) { return this.repository.context(unit); }
  products(unit: string, query: ProductQuery) { return this.repository.products(unit, query); }
  saveProduct(unit: string, input: ProdutoInput, id?: string, revision?: string) {
    return this.repository.saveProduct(unit, input, id, revision);
  }
  receipts(unit: string) { return this.repository.receipts(unit); }
  createReceipt(unit: string, input: EntradaInput) { return this.repository.createReceipt(unit, input); }
  confirmReceipt(unit: string, id: string, key: string) { return this.repository.confirmReceipt(unit, id, key); }
  approveReceipt(unit: string, id: string, reason: string) { return this.repository.approveReceipt(unit, id, reason); }
  balances(unit: string) { return this.repository.balances(unit); }
}
