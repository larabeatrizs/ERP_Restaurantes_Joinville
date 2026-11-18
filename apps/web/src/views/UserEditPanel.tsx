import { Skeleton } from './Skeleton.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { adminProfileLabels, validateAdminUserEdit } from '@erp/contracts';
import type { AdminUserDetail, AdminUsersSnapshot } from '@erp/contracts';
import { RequestError, SettingsApi } from '../services/api.ts';
export function UserEditPanel({api,id,options,onClose,onSaved,onDirty,onBusy}:{api:SettingsApi;id:string;options:AdminUsersSnapshot;onClose:()=>void;onSaved:()=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}){
 const [data,setData]=useState<AdminUserDetail>(),[error,setError]=useState(''),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
 const [dirty,setDirty]=useState(false);const form=useRef<HTMLFormElement>(null);
 useEffect(()=>{let active=true;setData(undefined);setError('');void api.userDetail(id).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('Não foi possível abrir este cadastro. Tente novamente.');});return()=>{active=false;};},[api,id,retry]);
 useEffect(()=>{if(data)form.current?.querySelector<HTMLInputElement>('input[name="nome"]')?.focus();},[data]);
 useEffect(()=>{onBusy(saving);},[saving,onBusy]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!data||saving)return;const fields=new FormData(event.currentTarget);const input=validateAdminUserEdit({nome:fields.get('nome'),perfil:data.proprio?data.perfil:fields.get('perfil'),unidades:data.proprio?data.unidades:fields.getAll('unidades'),revisao:data.revisao,motivo:fields.get('motivo')});
  if(!input.ok){setError(input.message);if(input.field!=='formulario')form.current?.querySelector<HTMLElement>(`[name="${input.field}"]`)?.focus();return;}
  if(!window.confirm('Salvar as alterações? Mudanças de perfil e unidades passam a valer nos próximos acessos às rotinas, inclusive nas sessões já abertas.'))return;
  setSaving(true);setError('');try{await api.editUser(id,input.value);onDirty(false);onSaved();}catch(error){setError(error instanceof RequestError&&error.status===412?'Este cadastro foi alterado. Seus campos foram preservados. Recarregue o cadastro antes de tentar novamente.':error instanceof RequestError&&error.status===403?'Você não pode fazer esta alteração. Seu próprio perfil e unidades exigem outro administrador.':error instanceof RequestError&&error.status===409?'A alteração foi bloqueada para preservar o acesso administrativo.':'Não foi possível salvar. Seus campos foram preservados; tente novamente.');}finally{setSaving(false);onBusy(false);}
 }
 function close(){if(!dirty||window.confirm('Descartar as alterações ainda não salvas?')){onDirty(false);onClose();}}
 return <section className="card" aria-label="Detalhes do usuário" aria-busy={saving}>
  <h2>{data?.pode_editar?'Editar usuário':'Detalhes do usuário'}</h2>
  {error&&<p role="alert" className="notice error">{error}</p>}{!data&&!error&&<Skeleton label="Consultando cadastro…" />}
  {!data&&error&&<button onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button>}
  {data&&<form key={`${data.id}-${data.revisao}`} ref={form} onSubmit={event=>void save(event)} onChange={()=>{setDirty(true);onDirty(true);}}>
   <p>Login, email, senha e situação não são alterados nesta tela.</p>{data.proprio&&data.pode_editar&&<p className="notice">Você pode corrigir seu nome. Seu perfil e suas unidades devem ser alterados por outro administrador.</p>}
   <fieldset disabled={saving||!data.pode_editar} className="user-fields">
    <label className="field">Nome de identificação *<input name="nome" defaultValue={data.nome} required maxLength={200}/></label>
    <div className="field"><label htmlFor="edit-user-profile">Perfil *</label><select id="edit-user-profile" name="perfil" defaultValue={data.perfil} disabled={data.proprio}>{options.perfis.map(profile=><option key={profile} value={profile}>{adminProfileLabels[profile]}</option>)}</select></div>
    <fieldset disabled={data.proprio} className="user-units"><legend>Unidades permitidas *</legend>{options.unidades.map(unit=><label key={unit.id}><input name="unidades" type="checkbox" value={unit.id} defaultChecked={data.unidades.includes(unit.id)}/>{unit.codigo} — {unit.nome}</label>)}</fieldset>
    {data.pode_editar&&<><label className="field">Motivo da alteração *<textarea name="motivo" required minLength={3} maxLength={500}/></label><button className="primary">{saving?'Salvando…':'Salvar alterações'}</button></>}
   </fieldset>
  </form>}
  <div className="actions"><button disabled={saving} onClick={close}>Fechar detalhes</button>{data&&error&&<button disabled={saving} onClick={()=>{if(!dirty||window.confirm('Recarregar o cadastro e descartar seus campos?')){setDirty(false);onDirty(false);setRetry(value=>value+1);}}}>Recarregar cadastro</button>}</div>
 </section>;
}
