import { createClient } from '@supabase/supabase-js';
import { isRecord,isWithdrawal,isWithdrawalPanel } from '@erp/contracts';
import type { Withdrawal,WithdrawalPanel } from '@erp/contracts';
import type { WithdrawalFactory } from './withdrawal-repository.ts';
import { ApiError } from '../errors.ts';
function unavailable():never{throw new ApiError(503,'SERVICE_UNAVAILABLE','Requisições temporariamente indisponíveis.');}
export const createWithdrawalSession:WithdrawalFactory=(env,token)=>withdrawalSession(env,token);
export function withdrawalSession(env:Parameters<WithdrawalFactory>[0],token:string,fetcher:typeof fetch=fetch):ReturnType<WithdrawalFactory>{
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))unavailable();
 let url:URL;try{url=new URL(env.SUPABASE_URL);}catch{unavailable();}
 if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)unavailable();
 const client=createClient(url.origin,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetcher(input,{...init,signal:AbortSignal.timeout(15000)})}});
 async function call(unit:string,action:string,data:object):Promise<Withdrawal|WithdrawalPanel>{
  const result=action==='ler'?await client.schema('erp').rpc('requisicao_painel',{p_unidade:unit}):await client.schema('erp').rpc('requisicao_operacao',{p_unidade:unit,p_acao:action,p_dados:data});
  if(result.error){const code=result.error.code;const status=result.status===401?401:['PT403','42501'].includes(code)?403:code==='PT404'?404:code==='PT412'?412:code==='PT409'?409:code==='PT422'?422:503;
   throw new ApiError(status,'WITHDRAWAL_ERROR',status===503?'Requisições temporariamente indisponíveis.':'Não foi possível concluir a requisição.');}
  if(action==='ler'){if(!isWithdrawalPanel(result.data,unit))unavailable();return result.data;}
  if(!isRecord(result.data)||!isWithdrawal(result.data.requisicao,unit))unavailable();return result.data.requisicao;
 }
 return{async authenticate(){const{data,error}=await client.auth.getUser(token);if(error&&(!error.status||error.status>=500))unavailable();if(error||!data.user||data.user.is_anonymous||data.user.aud!=='authenticated')throw new ApiError(401,'UNAUTHORIZED','Entre novamente.');},repository:{read:async u=>await call(u,'ler',{}) as WithdrawalPanel,register:async(u,i)=>await call(u,'registrar',i) as Withdrawal,review:async(u,id,i)=>await call(u,'conferir',{...i,id}) as Withdrawal}};
}
