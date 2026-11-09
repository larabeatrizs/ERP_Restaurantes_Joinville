import type { EntradaInput, ProductList, ProductQuery, ProductResult, ProdutoInput, ReceiptList, ReceiptResult, StockBalances, StockContext } from '@erp/contracts';

export interface StockRuntimeEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string }
export interface StockRepository {
  context(unit: string): Promise<StockContext>;
  products(unit: string, query: ProductQuery): Promise<ProductList>;
  saveProduct(unit: string, input: ProdutoInput, id?: string, revision?: string): Promise<ProductResult>;
  receipts(unit: string): Promise<ReceiptList>;
  createReceipt(unit: string, input: EntradaInput): Promise<ReceiptResult>;
  confirmReceipt(unit: string, id: string, key: string): Promise<ReceiptResult>;
  approveReceipt(unit: string, id: string, reason: string): Promise<ReceiptResult>;
  balances(unit: string): Promise<StockBalances>;
}
export interface StockSession { authenticate(): Promise<void>; repository: StockRepository }
export type StockSessionFactory = (env: StockRuntimeEnv, token: string) => StockSession;
