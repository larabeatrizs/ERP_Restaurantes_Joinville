import type { WithdrawalInput,WithdrawalReview } from '@erp/contracts';
import type { WithdrawalRepository } from '../repositories/withdrawal-repository.ts';
export class WithdrawalService {
 private repository:WithdrawalRepository;
 constructor(repository:WithdrawalRepository){this.repository=repository;}
 read(unit:string){return this.repository.read(unit);}
 register(unit:string,input:WithdrawalInput){return this.repository.register(unit,input);}
 review(unit:string,id:string,input:WithdrawalReview){return this.repository.review(unit,id,input);}
}
