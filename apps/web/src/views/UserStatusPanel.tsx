import { Skeleton } from './Skeleton.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { validateAdminUserSituation } from '@erp/contracts';
import type { AdminUserSituation } from '@erp/contracts';
import { RequestError, SettingsApi } from '../services/api.ts';
export function UserStatusPanel({api,id,onClose,onSaved,onDirty,onBusy}:{api:SettingsApi;id:string;onClose:()=>void;onSaved:()=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}){
 const [data,setData]=useState<AdminUserSituation>(),[error,setError]=useState(''),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0),[dirty,setDirty]=useState(false);
 const form=useRef<HTMLFormElement>(null);const target=data?.status==='ATIVO'?'INATIVO':'ATIVO';
 useEffect(()=>{let active=true;setData(undefined);setError('');void api.userSituation(id).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('Não foi possível consultar a situação. Tente novamente.');});return()=>{active=false;};},[api,id,retry]);
 useEffect(()=>{onBusy(saving);},[saving,onBusy]);
 useEffect(()=>{if(data?.pode_alterar)form.current?.querySelector('textarea')?.focus();},[data]);
 function discard(){return !dirty||window.confirm('Descartar o motivo ainda não salvo?');}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!data||saving||!data.pode_alterar)return;const input=validateAdminUserSituation({status:target,revisao:data.revisao,motivo:new FormData(event.currentTarget).get('motivo')});
  if(!input.ok){setError(input.message);form.current?.querySelector<HTMLElement>(`[name="${input.field}"]`)?.focus();return;}
  if(!window.confirm(target==='INATIVO'?`Inativar ${data.nome}? Novos acessos e operações serão negados, inclusive nas sessões já abertas.`:`Reativar ${data.nome} com o perfil e vínculos atuais?`))return;
  setSaving(true);setError('');try{await api.userSituation(id,input.value);onDirty(false);onSaved();}
  catch(error){setError(error instanceof RequestError&&error.status===412?'A situação mudou. Seu motivo foi preservado. Recarregue antes de continuar.':error instanceof RequestError&&error.status===403?'Você não pode alterar esta situação. A própria conta exige outro administrador.':error instanceof RequestError&&error.status===409?'Primeiro acesso, bloqueio ou proteção administrativa impedem esta alteração.':'Não foi possível alterar. Seu motivo foi preservado; tente novamente.');}
  finally{setSaving(false);onBusy(false);}
 }
 return <section className="card user-form" aria-label="Situação do usuário" aria-busy={saving}>
  <h2>Situação do usuário</h2>{error&&<p className="notice error" role="alert">{error}</p>}{!data&&!error&&<Skeleton label="Consultando situação…" />}
  {data&&<><p>{data.nome}</p><p>Situação atual: <strong>{data.primeiro_acesso?'Aguardando primeiro acesso':data.status==='ATIVO'?'Ativo':data.status==='INATIVO'?'Inativo':'Bloqueado'}</strong></p>
   {data.proprio?<p className="notice">Outro administrador deve alterar a situação da sua conta.</p>:data.primeiro_acesso||data.status==='BLOQUEADO'?<p className="notice">Primeiro acesso e desbloqueio exigem um fluxo próprio. Esta ação não libera uma conta pendente ou bloqueada.</p>:!data.pode_alterar?<p className="notice">Seu acesso permite apenas consultar esta situação.</p>:<form ref={form} onSubmit={event=>void save(event)} onChange={()=>{setDirty(true);onDirty(true);}}>
    <fieldset disabled={saving} className="user-fields"><p>Nome, perfil, unidades, login, email e senha serão preservados.</p><label className="field">Motivo da alteração de situação *<textarea name="motivo" required minLength={3} maxLength={500}/></label><button className="primary">{saving?'Salvando…':target==='INATIVO'?'Inativar usuário':'Reativar usuário'}</button></fieldset>
   </form>}
  </>}
  <div className="actions"><button disabled={saving} onClick={()=>{if(discard()){onDirty(false);onClose();}}}>Fechar situação</button>{error&&<button disabled={saving} onClick={()=>{if(discard()){setDirty(false);onDirty(false);setRetry(value=>value+1);}}}>Recarregar situação</button>}</div>
 </section>;
}
