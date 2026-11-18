import { Skeleton } from './Skeleton.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { adminProfileLabels as profiles, validateAdminUserSave } from '@erp/contracts';
import type { AdminUsersSnapshot } from '@erp/contracts';
import { RequestError, SettingsApi } from '../services/api.ts';
import { AdminUserReportError, adminUserReport, downloadAdminUserReport } from '../services/admin-user-report.ts';
import { UserEditPanel } from './UserEditPanel.tsx';
import { UserStatusPanel } from './UserStatusPanel.tsx';

function message(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente.';
    if (error.status === 403) return 'Você não tem permissão para administrar usuários.';
    if (error.status === 409) return 'Login ou email já cadastrado, ou operação em andamento. Revise os dados e tente novamente.';
    if (error.status === 422) return 'Revise os campos, o perfil e as unidades selecionadas.';
  }
  return 'Não foi possível concluir. Seus campos foram preservados; tente novamente.';
}
export function UsersPanel({ api, unit, onDirty, onBusy }: { api: SettingsApi; unit: string; onDirty: (v: boolean) => void; onBusy: (v: boolean) => void }) {
  const [data,setData]=useState<AdminUsersSnapshot>(),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const [creating,setCreating]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[access,setAccess]=useState('');
  const [exporting,setExporting]=useState(false);
  const [editing,setEditing]=useState<string>();
  const [situation,setSituation]=useState<string>();
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{let active=true;setLoading(true);setError('');void api.adminUsers(query,offset).then(next=>{if(active){setData(next);setLoading(false);}}).catch(e=>{if(active){setError(message(e));setLoading(false);}});return()=>{active=false;};},[api,query,offset,retry]);
  useEffect(()=>{onBusy(saving);},[saving,onBusy]);
  useEffect(()=>{if(creating)form.current?.querySelector('input')?.focus();},[creating]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(saving)return;const fields=new FormData(event.currentTarget);
    const result=validateAdminUserSave({login:fields.get('login'),nome:fields.get('nome'),email:fields.get('email'),perfil:fields.get('perfil'),unidades:fields.getAll('unidades'),status:'ATIVO',revisao:null,motivo:fields.get('motivo')});
    if(!result.ok){setError(result.message);if(result.field!=='formulario')form.current?.querySelector<HTMLElement>(`[name="${result.field}"]`)?.focus();return;}
    setSaving(true);setError('');setNotice('');
    try {const created=await api.createUser(result.value);setAccess(created.acesso??'');setNotice(created.criado?'Usuário incluído. Entregue o link para a pessoa definir a senha.':'Este cadastro já foi concluído. Nenhuma conta ou senha foi recriada.');setCreating(false);onDirty(!!created.acesso);setRetry(v=>v+1);}
    catch(e){setError(message(e));}finally{setSaving(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(access);setNotice('Link copiado. Entregue somente à pessoa cadastrada, em um canal privado.');onDirty(false);}catch{setError('Não foi possível copiar automaticamente. Use o campo de link para copiar manualmente.');}}
  async function exportCsv(){if(saving||creating||editing||situation||loading)return;setSaving(true);setExporting(true);setError('');setNotice('');try{const report=await adminUserReport(api,query);downloadAdminUserReport(report);setNotice(`CSV gerado com ${report.rows.length} usuário(s) da pesquisa aplicada.`);}catch(error){setError(error instanceof AdminUserReportError?error.message:'Não foi possível exportar. Nenhum arquivo parcial foi gerado. Tente novamente.');}finally{setSaving(false);setExporting(false);}}
  async function reissue(id:string,name:string){if(!window.confirm(`Gerar outro link de primeiro acesso para ${name}? O link anterior será substituído; copie qualquer link que ainda precise entregar antes de continuar.`))return;setSaving(true);setAccess('');setError('');setNotice('');onDirty(false);try{const result=await api.reissueUserAccess(id);setAccess(result.acesso??'');onDirty(!!result.acesso);setNotice('Novo link de primeiro acesso gerado. Entregue somente à pessoa cadastrada.');}catch(e){setError(message(e));}finally{setSaving(false);}}
  return <section aria-label="Gestão de usuários" aria-busy={saving}>
    <p className="hint">A gestão de acessos abrange todas as unidades. Cada pessoa verá somente suas unidades nas operações.</p>
    {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
    {loading&&<Skeleton label="Consultando usuários…" />}{!loading&&!data&&<button onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button>}
    {access&&<section className="card" aria-label="Primeiro acesso"><h2>Primeiro acesso</h2><p id="access-hint">Este link é de uso único e não foi enviado por email. Copie e entregue em canal privado. Ele não fica disponível ao sair desta tela.</p><label className="field">Link de primeiro acesso<input type="password" readOnly value={access} autoComplete="off" aria-describedby="access-hint" onFocus={e=>e.target.select()}/></label><button type="button" onClick={()=>void copy()}>Copiar link de primeiro acesso</button></section>}
    {data&&<>
      {situation&&<UserStatusPanel key={situation} api={api} id={situation} onDirty={onDirty} onBusy={setSaving} onClose={()=>setSituation(undefined)} onSaved={()=>{setSituation(undefined);setNotice('Situação atualizada. O acesso será conferido nas próximas operações.');setRetry(value=>value+1);}} />}
      {editing&&<UserEditPanel key={editing} api={api} id={editing} options={data} onDirty={onDirty} onBusy={setSaving} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);setNotice('Cadastro atualizado. As permissões serão verificadas nas próximas chamadas às rotinas.');setRetry(value=>value+1);}} />}
      {!creating&&!editing&&!situation&&data.pode_criar&&<button className="primary" disabled={loading||saving} onClick={()=>{if(access&&!window.confirm('O link anterior já foi entregue? Ao continuar ele sairá desta tela.'))return;setAccess('');setError('');setNotice('');setCreating(true);onDirty(false);}}>Novo usuário</button>}
      {creating&&<form ref={form} className="card user-form" onChange={()=>onDirty(true)} onSubmit={event=>void save(event)}><h2>Novo usuário</h2><p>Preencha a identificação e selecione as unidades permitidas. A pessoa define a própria senha pelo link de primeiro acesso.</p>
        <fieldset disabled={saving} className="user-fields"><div className="form-grid">
          <div className="field"><label htmlFor="user-login">Nome de login *</label><input id="user-login" name="login" required minLength={3} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="user-login-hint"/><span className="hint" id="user-login-hint">Sem acentos ou espaços; pode usar ponto, hífen e sublinhado.</span></div>
          <label className="field">Nome de identificação *<input name="nome" required maxLength={200} autoComplete="name"/></label>
          <label className="field">Email *<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
          <div className="field"><label htmlFor="user-profile">Perfil *</label><select id="user-profile" name="perfil" required defaultValue="ESTOQUISTA">{data.perfis.map(p=><option key={p} value={p}>{profiles[p]}</option>)}</select></div>
        </div><fieldset className="user-units"><legend>Unidades permitidas *</legend>{data.unidades.map(u=><label key={u.id}><input name="unidades" type="checkbox" value={u.id} defaultChecked={u.id===unit}/>{u.codigo} — {u.nome}</label>)}</fieldset>
          <label className="field">Motivo do cadastro *<textarea name="motivo" required minLength={3} maxLength={500}/></label>
          <div className="actions"><button className="primary" type="submit">{saving?'Incluindo usuário…':'Incluir usuário'}</button><button type="button" onClick={()=>{if(!window.confirm('Cancelar este cadastro? Os campos preenchidos serão descartados.'))return;setCreating(false);onDirty(false);setError('');}}>Cancelar</button></div>
        </fieldset></form>}
      <form className="card user-search" onSubmit={event=>{event.preventDefault();setOffset(0);setQuery(search);}}><label className="field">Pesquisar usuários<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={200} disabled={creating||(!!editing||!!situation)||saving}/></label><button disabled={loading||creating||(!!editing||!!situation)||saving}>Pesquisar</button></form>
      <div><button disabled={loading||saving||creating||(!!editing||!!situation)} onClick={()=>void exportCsv()}>{exporting?'Exportando CSV…':'Exportar CSV'}</button><p className="hint">Exporta os usuários da pesquisa aplicada, incluindo as outras páginas. Consulta durante a geração; não é um instantâneo transacional.</p></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Lista de usuários"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Unidades</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{data.usuarios.map(u=><tr key={u.id}><td>{u.nome}</td><td>{u.login??'Acesso existente'}</td><td>{profiles[u.perfil]}</td><td>{u.unidades.map(id=>data.unidades.find(item=>item.id===id)?.codigo??'Unidade inativa').join(', ')}</td><td>{u.primeiro_acesso?'Aguardando primeiro acesso':u.status==='ATIVO'?'Ativo':u.status==='INATIVO'?'Inativo':'Bloqueado'}</td><td><div className="actions table-actions"><button disabled={saving||creating||(!!editing||!!situation)} aria-label={`Abrir cadastro de ${u.nome}`} onClick={()=>{if(access&&!window.confirm('O link de primeiro acesso já foi entregue? Ao abrir outro cadastro ele sairá desta tela.'))return;setAccess('');onDirty(false);setEditing(u.id);}}>Abrir cadastro</button><button disabled={saving||creating||!!editing||!!situation} aria-label={`Situação de ${u.nome}`} onClick={()=>{if(access&&!window.confirm("O link de primeiro acesso já foi entregue? Ao continuar ele sairá desta tela."))return;setAccess("");onDirty(false);setSituation(u.id);}}>Situação</button>{u.primeiro_acesso&&data.pode_criar?<button disabled={saving||creating||(!!editing||!!situation)} aria-label={`Reemitir primeiro acesso para ${u.nome}`} onClick={()=>void reissue(u.id,u.nome)}>Reemitir link</button>:'—'}</div></td></tr>)}</tbody></table></div>
      {!loading&&data.usuarios.length===0&&<p role="status">Nenhum usuário encontrado.</p>}
      <div className="actions"><button disabled={loading||creating||(!!editing||!!situation)||saving||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-25))}>Anterior</button><span>{data.total} usuário(s) · página {Math.floor(offset/25)+1}</span><button disabled={loading||creating||(!!editing||!!situation)||saving||offset+25>=data.total} onClick={()=>setOffset(v=>v+25)}>Próxima</button></div>
    </>}
  </section>;
}
