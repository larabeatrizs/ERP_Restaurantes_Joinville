import type { AvailableProductList, ProductLinkInput, EntradaInput, ProductList, ProductQuery, ProductResult, ProdutoInput, ReceiptList, ReceiptResult, StockBalances, StockContext } from '@erp/contracts';
import type { StockAlerts, StockExpiry, StockLedger, StockLedgerQuery } from '@erp/contracts';
import type { StockLossReviewState, StockLossPanel, StockLossRegistration, StockLossRegistrationContext } from '@erp/contracts';

export interface StockRuntimeEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string }
export interface StockRepository {
  dishIngredients?(unit: string, query: string): Promise<{ insumos: import('@erp/contracts').DishIngredientOption[] }>;
  createDishRecipe?(unit: string, input: import('@erp/contracts').DishRecipeInput): Promise<import('@erp/contracts').DishRecipe>;
  dishRecipe?(unit: string, id: string, version?: string): Promise<import('@erp/contracts').DishRecipe>;
  menuGrade?(unit: string, period: import('@erp/contracts').MenuPeriod): Promise<import('@erp/contracts').MenuGrade>;
  createMenuDraft?(unit: string, input: import('@erp/contracts').MenuDraft): Promise<import('@erp/contracts').MenuDraftResult>;
  menuDrafts?(unit: string, cursor?: string): Promise<import('@erp/contracts').MenuDraftPage>;
  menuDraft?(unit: string, version: string): Promise<import('@erp/contracts').MenuDraftDetail>;
  editMenuEstimates?(unit: string, version: string, changes: import('@erp/contracts').MenuEstimateChanges): Promise<import('@erp/contracts').MenuDraftDetail>;
  lossReport?(unit: string, query: import('@erp/contracts').StockLossReportQuery): Promise<import('@erp/contracts').StockLossReport>;
  registerLossBatch?(unit: string, input: import('@erp/contracts').StockLossBatchRegistration): Promise<{ ids: string[] }>;
  lossAttachment?(unit: string, id: string): Promise<import('@erp/contracts').StockLossAttachment>;
  lossConfiguration?(change?: import('@erp/contracts').LossConfigurationChange): Promise<import('@erp/contracts').LossConfiguration>;
  lossRegistrationContext?(unit: string): Promise<StockLossRegistrationContext>;
  registerLoss?(unit: string, input: StockLossRegistration): Promise<{ id: string }>;
  pendingLosses?(unit: string): Promise<StockLossPanel>;
  reviewLoss?(unit: string, id: string, decision: StockLossReviewState): Promise<{ id: string; estado: StockLossReviewState }>;
  importedProducts?(unit:string,query:Pick<ProductQuery,'q'|'offset'>):Promise<import('@erp/contracts').ImportedProducts>;
  completeImportedProduct?(unit:string,id:string,input:ProdutoInput):Promise<ProductResult>;
  context(unit: string): Promise<StockContext>;
  products(unit: string, query: ProductQuery): Promise<ProductList>;
  availableProducts(unit: string, query: Pick<ProductQuery, 'q' | 'offset'>): Promise<AvailableProductList>;
  linkProduct(unit: string, id: string, input: ProductLinkInput): Promise<ProductResult>;
  saveProduct(unit: string, input: ProdutoInput, id?: string, revision?: string): Promise<ProductResult>;
  setProductStatus(unit: string, id: string, revision: string, status: 'ATIVO' | 'INATIVO'): Promise<ProductResult>;
  deleteProduct(unit: string, id: string, revision: string): Promise<{ excluida: true }>;
  receipts(unit: string): Promise<ReceiptList>;
  createReceipt(unit: string, input: EntradaInput): Promise<ReceiptResult>;
  confirmReceipt(unit: string, id: string, key: string): Promise<ReceiptResult>;
  approveReceipt(unit: string, id: string, reason: string): Promise<ReceiptResult>;
  balances(unit: string): Promise<StockBalances>;
  ledger(unit: string, query: StockLedgerQuery): Promise<StockLedger>;
  expiry(unit: string): Promise<StockExpiry>;
  alerts(unit: string): Promise<StockAlerts>;
}
export interface StockSession { authenticate(): Promise<void>; repository: StockRepository }
export type StockSessionFactory = (env: StockRuntimeEnv, token: string) => StockSession;
