import type { WithdrawalInput, WithdrawalReview, Withdrawal, WithdrawalPanel } from '@erp/contracts';
import type { StockRuntimeEnv } from './stock-repository.ts';
export interface WithdrawalRepository {
 read(unit:string):Promise<WithdrawalPanel>;
 register(unit:string,input:WithdrawalInput):Promise<Withdrawal>;
 review(unit:string,id:string,input:WithdrawalReview):Promise<Withdrawal>;
}
export type WithdrawalFactory=(env:StockRuntimeEnv,token:string)=>{authenticate():Promise<void>;repository:WithdrawalRepository};
