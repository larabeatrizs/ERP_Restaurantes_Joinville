import { useEffect,useRef,useState } from 'react';
import { isWithdrawalInput } from '@erp/contracts';
import type { Withdrawal,WithdrawalInput,WithdrawalPanel as Snapshot } from '@erp/contracts';
import { StockApi,decimalInput,decimalLabel,stockError } from '../services/stock-api.ts';
import { RequestError } from '../services/api.ts';
const labels={REGISTRADA:'A conferir',CONFERIDA:'Conferida',CONTESTADA:'Contestada'};
function errorLabel(error:unknown){return error instanceof RequestError&&error.status===409?'Saldo válido insuficiente ou unidade fora do modo Posterior. Atualize e confira as condições.':error instanceof RequestError&&error.status===412?'Esta retirada já foi alterada. Atualize a lista antes de conferir novamente.':stockError(error);}
export function WithdrawalPanel({api,unit,onDirty,onBusy}:{api:StockApi;unit:string;onDirty:(v:boolean)=>void;onBusy:(v:boolean)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot>();const [error,setError]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(true);const [reload,setReload]=useState(0);
 const [product,setProduct]=useState('');const [quantity,setQuantity]=useState('');const [name,setName]=useState('');const [busy,setBusy]=useState(false);const flight=useRef(false);
 const [pending,setPending]=useState<WithdrawalInput>();const [selected,setSelected]=useState<Withdrawal>();const [reason,setReason]=useState('');
 const dirty=!!(product||quantity||name||reason||pending);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 useEffect(()=>{onBusy(busy||!!pending);return()=>onBusy(false);},[busy,pending,onBusy]);
 useEffect(()=>{let active=true;setLoading(true);setSnapshot(undefined);void api.withdrawals(unit).then(s=>{if(active){setSnapshot(s);setLoading(false);}}).catch(e=>{if(active){setError(errorLabel(e));setLoading(false);}});return()=>{active=false;};},[api,unit,reload]);
 async function register(){
  if(flight.current||!snapshot?.pode_registrar||snapshot.modo_saida!=='POSTERIOR')return;
  let input:WithdrawalInput;try{input=pending??{produto_id:product,quantidade:decimalInput(quantity),retirado_por:name.trim(),chave:crypto.randomUUID()};}catch{setError('Informe uma quantidade válida com até seis casas decimais.');return;}
  if(!isWithdrawalInput(input)){setError('Selecione o produto, uma quantidade positiva (até seis casas decimais) e quem retirou.');return;}
  if(!pending&&!window.confirm('Registrar a retirada e baixar o estoque agora?'))return;
  flight.current=true;setBusy(true);setError('');setMessage('');setPending(input);
  try{await api.registerWithdrawal(unit,input);setPending(undefined);setProduct('');setQuantity('');setName('');setMessage('Retirada registrada. O estoque foi atualizado uma única vez.');setReload(v=>v+1);}
  catch(e){setError(errorLabel(e));if(e instanceof RequestError&&e.status>=400&&e.status<500)setPending(undefined);}
  finally{flight.current=false;setBusy(false);}
 }
 async function review(state:'CONFERIDA'|'CONTESTADA'){
  if(!selected||flight.current||!snapshot?.pode_conferir)return;
  if(state==='CONTESTADA'&&reason.trim().length<3){setError('Informe o motivo da contestação (3–500 caracteres).');return;}
  if(!window.confirm(state==='CONFERIDA'?'Confirmar a conferência sem alterar o saldo?':'Contestar esta retirada sem devolver estoque automaticamente?'))return;
  flight.current=true;setBusy(true);setError('');
  try{await api.reviewWithdrawal(unit,selected.id,{revisao:selected.revisao,estado:state,motivo:reason.trim()});setSelected(undefined);setReason('');setMessage('Análise registrada. Nenhuma nova baixa foi feita.');setReload(v=>v+1);}
  catch(e){setError(errorLabel(e));}finally{flight.current=false;setBusy(false);}
 }
 return <>
  {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
  <button disabled={busy||loading||!!pending} onClick={()=>{if(!dirty||window.confirm('Descartar os campos preenchidos e atualizar?')){setSelected(undefined);setReason('');setProduct('');setQuantity('');setName('');setError('');setReload(v=>v+1);}}}>Atualizar requisições</button>
  {loading&&<p role="status">Carregando requisições…</p>}
  {snapshot?.pode_registrar&&<section className="card" aria-label="Registrar retirada"><h2>Registrar retirada</h2><p className="hint">A baixa acontece agora, pelos lotes válidos que vencem primeiro. A conferência vem depois.</p>
   {snapshot.modo_saida!=='POSTERIOR'&&<p className="notice">Esta unidade precisa estar configurada no modo Posterior para usar a requisição rápida.</p>}
   <form onSubmit={e=>{e.preventDefault();void register();}}><fieldset disabled={busy||!!pending||snapshot.modo_saida!=='POSTERIOR'}>
    <label className="field">Produto<select required value={product} onChange={e=>setProduct(e.target.value)}><option value="">Selecione</option>{snapshot.produtos.map(p=><option key={p.id} value={p.id}>{p.descricao} ({p.unidade})</option>)}</select></label>
    <label className="field">Quantidade<input required inputMode="decimal" value={quantity} maxLength={20} onChange={e=>setQuantity(e.target.value)}/></label>
    <label className="field">Quem retirou<input required value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
   </fieldset>{pending&&<p className="notice">Não foi possível confirmar a resposta. Repita o mesmo envio para consultar o resultado com segurança. Os dados estão preservados.</p>}
   <button className="primary" disabled={busy||snapshot.modo_saida!=='POSTERIOR'}>{busy?'Registrando…':pending?'Repetir envio com segurança':'Registrar retirada'}</button></form></section>}
  {selected&&<section className="card" aria-label="Conferir retirada"><h2>Conferir retirada #{selected.id}</h2><label className="field">Motivo / observação<textarea disabled={busy} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="actions"><button disabled={busy} onClick={()=>void review('CONFERIDA')}>Marcar como conferida</button><button disabled={busy} onClick={()=>void review('CONTESTADA')}>Contestar retirada</button><button disabled={busy} onClick={()=>{setSelected(undefined);setReason('');}}>Cancelar</button></div></section>}
  {snapshot&&<section className="card" aria-label="Retiradas recentes"><h2>Retiradas recentes</h2><p className="hint">Até 50 registros recentes desta unidade. Conferir ou contestar não desconta estoque novamente.</p>{!snapshot.requisicoes.length?<p>Nenhuma retirada registrada.</p>:<div className="table-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th>Quantidade</th><th>Quem retirou</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{snapshot.requisicoes.map(r=><tr key={r.id}><td>{r.data_movimento.split('-').reverse().join('/')}</td><td>{snapshot.produtos.find(p=>p.id===r.produto_id)?.descricao??`Produto #${r.produto_id}`}</td><td>{decimalLabel(r.quantidade)}</td><td>{r.retirado_por}</td><td>{labels[r.estado]}{r.motivo&&<p>{r.motivo}</p>}</td><td>{r.estado==='REGISTRADA'&&snapshot.pode_conferir&&r.solicitante_id!==snapshot.usuario_id?<button disabled={busy||!!pending} onClick={()=>{if(!reason||window.confirm('Descartar o motivo preenchido?')){setSelected(r);setReason('');setError('');}}}>Conferir #{r.id}</button>:'—'}</td></tr>)}</tbody></table></div>}</section>}
 </>;
}
