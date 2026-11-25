import type { EntradaInput, ProductLinkInput, ProductQuery, ProdutoInput, StockLedgerQuery, StockLossReviewState } from '@erp/contracts';
import type { StockRepository } from '../repositories/stock-repository.ts';
import { ApiError } from '../errors.ts';

/** Casos de uso de estoque independentes das capacidades de configurações. */
export class StockService {
  private readonly repository: StockRepository;
  constructor(repository: StockRepository) { this.repository = repository; }
  context(unit: string) { return this.repository.context(unit); }
  pendingLosses(unit: string) {
    if (!this.repository.pendingLosses) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Consulta de perdas indisponível.');
    return this.repository.pendingLosses(unit);
  }
  reviewLoss(unit: string, id: string, decision: StockLossReviewState) {
    if (!this.repository.reviewLoss) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Revisão de perdas indisponível.');
    return this.repository.reviewLoss(unit, id, decision);
  }
  importedProducts(unit:string,query:Pick<ProductQuery,'q'|'offset'>){if(!this.repository.importedProducts)throw new ApiError(503,'SERVICE_UNAVAILABLE','Importação indisponível.');return this.repository.importedProducts(unit,query);}
  completeImportedProduct(unit:string,id:string,input:ProdutoInput){if(!this.repository.completeImportedProduct)throw new ApiError(503,'SERVICE_UNAVAILABLE','Importação indisponível.');return this.repository.completeImportedProduct(unit,id,input);}
  products(unit: string, query: ProductQuery) { return this.repository.products(unit, query); }
  availableProducts(unit: string, query: Pick<ProductQuery, 'q' | 'offset'>) { return this.repository.availableProducts(unit, query); }
  linkProduct(unit: string, id: string, input: ProductLinkInput) { return this.repository.linkProduct(unit, id, input); }
  saveProduct(unit: string, input: ProdutoInput, id?: string, revision?: string) {
    return this.repository.saveProduct(unit, input, id, revision);
  }
  setProductStatus(unit: string, id: string, revision: string, status: 'ATIVO' | 'INATIVO') { return this.repository.setProductStatus(unit, id, revision, status); }
  deleteProduct(unit: string, id: string, revision: string) { return this.repository.deleteProduct(unit, id, revision); }
  receipts(unit: string) { return this.repository.receipts(unit); }
  createReceipt(unit: string, input: EntradaInput) { return this.repository.createReceipt(unit, input); }
  confirmReceipt(unit: string, id: string, key: string) { return this.repository.confirmReceipt(unit, id, key); }
  approveReceipt(unit: string, id: string, reason: string) { return this.repository.approveReceipt(unit, id, reason); }
  balances(unit: string) { return this.repository.balances(unit); }
  ledger(unit: string, query: StockLedgerQuery) { return this.repository.ledger(unit, query); }
  expiry(unit: string) { return this.repository.expiry(unit); }
  alerts(unit: string) { return this.repository.alerts(unit); }
}
