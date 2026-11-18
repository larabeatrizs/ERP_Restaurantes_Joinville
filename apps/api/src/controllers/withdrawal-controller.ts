import { isStockId,isWithdrawalInput,isWithdrawalReview } from '@erp/contracts';
import type { WithdrawalFactory } from '../repositories/withdrawal-repository.ts';
import type { StockRuntimeEnv } from '../repositories/stock-repository.ts';
import { WithdrawalService } from '../services/withdrawal-service.ts';
import { ApiError } from '../errors.ts';
import { readJson } from './read-json.ts';
export async function withdrawalController(request:Request,env:StockRuntimeEnv,unit:string,id:string|undefined,factory:WithdrawalFactory){
 const allow=id?'POST':'GET, POST';
 if(!allow.split(', ').includes(request.method))return new Response(request.method==='HEAD'?null:JSON.stringify({error:{code:'METHOD_NOT_ALLOWED',message:'Método não permitido.'}}),{status:405,headers:{Allow:allow,'Content-Type':'application/json','Cache-Control':'no-store'}});
 const token=/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization')??'')?.[1];
 if(!token)throw new ApiError(401,'UNAUTHORIZED','Entre novamente.');
 if(!isStockId(unit)||(id!==undefined&&!isStockId(id)))throw new ApiError(400,'INVALID_ID','Identificador inválido.');
 if(new URL(request.url).search)throw new ApiError(400,'INVALID_QUERY','Filtros não disponíveis neste recurso.');
 const session=factory(env,token);await session.authenticate();const service=new WithdrawalService(session.repository);
 let result:unknown;
 if(request.method==='GET')result=await service.read(unit);
 else{const input=await readJson(request);if(id){if(!isWithdrawalReview(input))throw new ApiError(422,'INVALID_INPUT','Revise a conferência e seu motivo.');result={requisicao:await service.review(unit,id,input)};}
 else{if(!isWithdrawalInput(input))throw new ApiError(422,'INVALID_INPUT','Revise produto, quantidade e quem retirou.');result={requisicao:await service.register(unit,input)};}}
 return Response.json(result,{headers:{'Cache-Control':'no-store, no-transform'}});
}
