import { useEffect, useRef, useState } from 'react';
import { isSupplierInput, supplierErrors, supplierFields, supplierTextLimits } from '@erp/contracts';
import type { Supplier, SupplierInput, SupplierList, SupplierQuery } from '@erp/contracts';
import { decimalInput, decimalLabel } from '../services/stock-api.ts';
import { SupplierApi, SupplierRequestError, supplierError } from '../services/supplier-api.ts';
type Draft=Record<keyof SupplierInput,string>;
const labels:Record<keyof SupplierInput,string>={razao_social:'Razão social *',cnpj_cpf:'CPF/CNPJ *',nome_fantasia:'Nome fantasia',contato:'Contato',telefone:'Telefone',email:'Email',endereco:'Endereço',observacoes:'Observações',tipo_fornecedor:'Tipo de fornecedor',condicao_pagamento:'Condição de pagamento',prazo_entrega_dias:'Prazo de entrega (dias)',pedido_minimo:'Pedido mínimo',agricultura_familiar:'Agricultura familiar *',canal_preferido:'Canal preferido'};
function draftOf(row?:Supplier):Draft {
  const values=Object.fromEntries(supplierFields.map(key=>[key,row?.[key as keyof Supplier]??'']));
  values.agricultura_familiar=row?.agricultura_familiar===true?'SIM':row?.agricultura_familiar===false?'NAO':'';
  values.pedido_minimo=row?.pedido_minimo?.replace('.',',')??'';
  values.prazo_entrega_dias=row?.prazo_entrega_dias===null||row?.prazo_entrega_dias===undefined?'':String(row.prazo_entrega_dias);
  return values as Draft;
}
export function SupplierPanel({api,unit,onDirty,onBusy}:{api:SupplierApi;unit:string;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}) {
  const [data,setData]=useState<SupplierList>(),[search,setSearch]=useState(''),[query,setQuery]=useState<SupplierQuery>({q:'',status:'ATIVO',ordem:'asc',offset:0});
  const [reload,setReload]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [draft,setDraft]=useState<Draft>(),[selected,setSelected]=useState<Supplier>(),[view,setView]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[fields,setFields]=useState<Record<string,string>>({});
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  useEffect(()=>{onBusy(busy);return()=>onBusy(false);},[busy,onBusy]);
  useEffect(()=>{let active=true;setLoading(true);setData(undefined);setError('');void api.list(unit,query).then(value=>{if(active){setData(value);setLoading(false);}}).catch(err=>{if(active){setError(supplierError(err));setLoading(false);}});return()=>{active=false;};},[api,unit,query,reload]);
  useEffect(()=>{if(draft)heading.current?.focus();},[draft===undefined]);
  const discard=()=>!dirty||window.confirm('Descartar as alterações ainda não salvas?');
  function open(row?:Supplier,readonly=false) {if(!discard())return;setSelected(row);setDraft(draftOf(row));setView(readonly);setDirty(false);setError('');setMessage('');setFields({});}
  function close(){if(discard()){setDraft(undefined);setSelected(undefined);setDirty(false);setError('');setFields({});}}
  function edit(key:keyof Draft,value:string){setDraft(current=>current?{...current,[key]:value}:current);setDirty(true);setMessage('');}
  async function save(){
    if(!draft||busy||!data?.capacidades.editar)return;
    let minimum:string|null=null;
    try {minimum=draft.pedido_minimo.trim()?decimalInput(draft.pedido_minimo):null;} catch {setFields({pedido_minimo:'Informe um valor não negativo com até seis casas decimais.'});setError('Revise os campos indicados.');return;}
    const input={...Object.fromEntries(Object.keys(supplierTextLimits).map(key=>[key,draft[key as keyof Draft].trim()||null])),razao_social:draft.razao_social.trim(),cnpj_cpf:draft.cnpj_cpf.trim(),prazo_entrega_dias:draft.prazo_entrega_dias.trim()?Number(draft.prazo_entrega_dias):null,pedido_minimo:minimum,agricultura_familiar:draft.agricultura_familiar==='SIM'?true:draft.agricultura_familiar==='NAO'?false:null,canal_preferido:draft.canal_preferido||null};
    const invalid=supplierErrors(input);setFields(invalid);if(!isSupplierInput(input)){setError('Revise os campos indicados.');return;}
    setBusy(true);setError('');setMessage('');
    try {await api.save(unit,input,selected);setDraft(undefined);setSelected(undefined);setDirty(false);setMessage('Fornecedor salvo com sucesso.');setReload(value=>value+1);} catch(err){setError(supplierError(err));if(err instanceof SupplierRequestError)setFields(err.fields);}finally{setBusy(false);}
  }
  async function lifecycle(row:Supplier,remove=false){
    if(busy||!data?.capacidades.ciclo_vida||!discard())return;
    if(!window.confirm(remove?`Excluir o fornecedor ${row.razao_social}? Permitido somente sem vínculos.`:`${row.status==='ATIVO'?'Inativar':'Ativar'} o fornecedor ${row.razao_social} no catálogo compartilhado? O histórico será preservado.`))return;
    setBusy(true);setError('');setMessage('');
    try {if(remove)await api.remove(unit,row);else await api.status(unit,row);setDraft(undefined);setDirty(false);setMessage(remove?'Fornecedor excluído; auditoria preservada.':'Status do fornecedor atualizado.');setReload(value=>value+1);}catch(err){setError(supplierError(err));}finally{setBusy(false);}
  }
  async function exportCsv(){setBusy(true);setError('');try{const blob=await api.exportCsv(unit,query),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='fornecedores.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){setError(supplierError(err));}finally{setBusy(false);}}
  function field(key:keyof SupplierInput){if(!draft)return null;const limit=key==='razao_social'?200:key==='cnpj_cpf'?24:supplierTextLimits[key as keyof typeof supplierTextLimits];
    return <label className="field" key={key}>{labels[key]}<input aria-label={labels[key]} value={draft[key]} maxLength={limit} inputMode={key==='pedido_minimo'?'decimal':key==='prazo_entrega_dias'?'numeric':undefined} required={key==='razao_social'||key==='cnpj_cpf'} aria-invalid={!!fields[key]} aria-describedby={`fornecedor-${key}-erro`} onChange={event=>edit(key,event.target.value)}/><span id={`fornecedor-${key}-erro`}>{fields[key]}</span></label>;
  }
  return <section className="card" aria-label="Cadastro de fornecedores"><p className="notice">Cadastro compartilhado pelas unidades. Inativar preserva o histórico e retira o fornecedor de novos recebimentos.</p>
    {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status" className="notice success">{message}</p>}
    {draft?<form onSubmit={event=>{event.preventDefault();void save();}}><h2 ref={heading} tabIndex={-1}>{view?'Visualizar fornecedor':selected?'Editar fornecedor':'Novo fornecedor'}</h2>
      <fieldset disabled={busy||view||!data?.capacidades.editar} className="form-grid"><legend>Identificação</legend>{field('razao_social')}{field('cnpj_cpf')}{field('nome_fantasia')}{field('tipo_fornecedor')}
        <label className="field">Agricultura familiar *<select aria-label="Agricultura familiar *" required value={draft.agricultura_familiar} aria-invalid={!!fields.agricultura_familiar} aria-describedby="fornecedor-agricultura-erro" onChange={event=>edit('agricultura_familiar',event.target.value)}><option value="">Não informado — selecione</option><option value="SIM">Sim</option><option value="NAO">Não</option></select><span id="fornecedor-agricultura-erro">{fields.agricultura_familiar}</span></label>
      </fieldset>
      <fieldset disabled={busy||view||!data?.capacidades.editar} className="form-grid"><legend>Contato</legend>{field('contato')}{field('telefone')}{field('email')}{field('endereco')}
        <label className="field">Canal preferido<select aria-label="Canal preferido" value={draft.canal_preferido} onChange={event=>edit('canal_preferido',event.target.value)}><option value="">Não informado</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option></select>{fields.canal_preferido&&<span>{fields.canal_preferido}</span>}</label>
      </fieldset>
      <fieldset disabled={busy||view||!data?.capacidades.editar} className="form-grid"><legend>Condições</legend>{field('prazo_entrega_dias')}{field('pedido_minimo')}{field('condicao_pagamento')}{field('observacoes')}</fieldset>
      {selected?.agricultura_familiar===null&&<p className="hint">Agricultura familiar ainda não informada neste cadastro anterior. Escolha Sim ou Não ao editar.</p>}
      {selected&&<p>Status: {selected.status==='ATIVO'?'Ativo':'Inativo'}</p>}<div className="actions"><button type="button" disabled={busy} onClick={close}>Voltar à lista</button>{!view&&<button className="primary" disabled={busy||loading||!data?.capacidades.editar}>{busy?'Salvando…':'Salvar fornecedor'}</button>}</div>
    </form>:<><div className="section-heading"><h2>Fornecedores</h2><button className="primary" disabled={busy||loading||!data?.capacidades.editar} onClick={()=>open()}>Incluir fornecedor</button></div>
      <form className="filters" onSubmit={event=>{event.preventDefault();setQuery(current=>({...current,q:search,offset:0}));}}><label className="field">Buscar fornecedor<input value={search} maxLength={200} disabled={busy} placeholder="Razão social, nome fantasia ou documento" onChange={event=>setSearch(event.target.value)}/></label><label className="field">Status<select value={query.status} disabled={busy} onChange={event=>setQuery(current=>({...current,status:event.target.value as SupplierQuery['status'],offset:0}))}><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></label><label className="field">Ordenação<select value={query.ordem} disabled={busy} onChange={event=>setQuery(current=>({...current,ordem:event.target.value as SupplierQuery['ordem'],offset:0}))}><option value="asc">Razão social A–Z</option><option value="desc">Razão social Z–A</option></select></label><button disabled={busy}>Buscar</button><button type="button" disabled={busy||loading||!data} onClick={()=>void exportCsv()}>Exportar CSV</button></form><p className="hint">O CSV inclui todos os resultados filtrados, até 10000 fornecedores.</p>
      {loading?<p role="status">Carregando fornecedores…</p>:!data?<button disabled={busy} onClick={()=>setReload(value=>value+1)}>Tentar novamente</button>:!data.fornecedores.length?<p className="empty">Nenhum fornecedor encontrado.</p>:<div className="table-wrap" role="region" tabIndex={0} aria-label="Fornecedores"><table><thead><tr><th>Razão social</th><th>CPF/CNPJ</th><th>Nome fantasia</th><th>Agricultura familiar</th><th>Pedido mínimo</th><th>Ações</th></tr></thead><tbody>{data.fornecedores.map(row=><tr key={row.id}><th scope="row">{row.razao_social}</th><td>{row.cnpj_cpf}</td><td>{row.nome_fantasia??'Não informado'}</td><td>{row.agricultura_familiar===null?'Não informado':row.agricultura_familiar?'Sim':'Não'}</td><td>{row.pedido_minimo===null?'Não informado':decimalLabel(row.pedido_minimo)}</td><td><div className="actions"><button disabled={busy} aria-label={`Visualizar ${row.razao_social}`} onClick={()=>open(row,true)}>Visualizar</button><button disabled={busy||!data.capacidades.editar} aria-label={`Editar ${row.razao_social}`} onClick={()=>open(row)}>Editar</button><button disabled={busy||!data.capacidades.ciclo_vida} aria-label={`${row.status==='ATIVO'?'Inativar':'Ativar'} ${row.razao_social}`} onClick={()=>void lifecycle(row)}>{row.status==='ATIVO'?'Inativar':'Ativar'}</button><button disabled={busy||!data.capacidades.ciclo_vida||!row.pode_excluir} title={row.pode_excluir?undefined:'Possui vínculos; use a inativação.'} aria-label={`Excluir ${row.razao_social}`} onClick={()=>void lifecycle(row,true)}>Excluir</button></div>{!row.pode_excluir&&<p className="hint">Possui vínculos; exclusão bloqueada.</p>}</td></tr>)}</tbody></table></div>}
      {data&&<div className="actions"><button disabled={busy||loading||query.offset===0} onClick={()=>setQuery(current=>({...current,offset:Math.max(0,current.offset-50)}))}>Anterior</button><span>{data.total} fornecedores · página {Math.floor(query.offset/50)+1}</span><button disabled={busy||loading||query.offset+50>=data.total} onClick={()=>setQuery(current=>({...current,offset:current.offset+50}))}>Próxima</button></div>}
    </>}
  </section>;
}
