import {useEffect,useState} from 'react';
import type {ImportedProduct,ImportedProducts} from '@erp/contracts';
import {StockApi,stockError} from '../services/stock-api.ts';
import {PaginationArrow} from './PaginationArrow.tsx';
import {Skeleton} from './Skeleton.tsx';
export function ImportedProductsPanel({api,unit,onOpen}:{api:StockApi;unit:string;onOpen:(item:ImportedProduct)=>void}){
 const [result,setResult]=useState<ImportedProducts>(),[search,setSearch]=useState(''),[q,setQ]=useState(''),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let active=true;setResult(undefined);setError('');void api.importedProducts(unit,q,offset).then(data=>{if(active)setResult(data);}).catch(e=>{if(active)setError(stockError(e));});return()=>{active=false;};},[api,unit,q,offset,retry]);
 return <section className="card" aria-label="Produtos importados para completar"><h2>Produtos importados</h2><p>Os nomes da planilha foram preservados. Complete os dados para liberar cada produto para uso. Quantidades, preços e saldos não foram importados.</p>
 <form className="stock-filters" onSubmit={e=>{e.preventDefault();setOffset(0);setQ(search.trim());setRetry(v=>v+1);}}><label className="field">Buscar nome importado<input type="search" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></label><button>Buscar</button></form>
 {error?<><p role="alert">{error}</p><button onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button></>:!result?<Skeleton label="Carregando nomes importados…"/>: <>
 <p className="hint">{result.total} cadastros pendentes. Cadastre as medidas e categorias necessárias antes de completar os produtos.</p>
 {result.itens.length?<div className="table-wrap" role="region" tabIndex={0} aria-label="Nomes importados"><table><thead><tr><th>Produto</th><th>Referências da planilha</th><th>Ação</th></tr></thead><tbody>{result.itens.map(item=><tr key={item.id}><th scope="row">{item.descricao}</th><td>{item.origens.map((o,i)=><p className="hint" key={i}>{o.aba} · linha {o.linha}{o.apresentacao?` · apresentação informada: ${o.apresentacao}`:''}{o.observacao?` · descrição original: ${o.observacao}`:''}</p>)}</td><td><button onClick={()=>onOpen(item)}>Completar cadastro<span className="sr-only"> {item.descricao}</span></button></td></tr>)}</tbody></table></div>:<p>Nenhum cadastro pendente nesta pesquisa.</p>}
 <div className="pagination"><p className="hint">Página {offset/50+1}</p><div className="actions"><PaginationArrow direction="previous" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-50))}/><PaginationArrow direction="next" disabled={offset+50>=result.total} onClick={()=>setOffset(v=>v+50)}/></div></div></>}
 </section>;
}
