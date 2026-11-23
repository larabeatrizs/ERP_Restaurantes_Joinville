// Recebe extração de células já feita em ambiente privado; não executa fórmulas.
export const normalizeName=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function prepareNames(book){
 if(book.file!=='LISTA INSUMOS.xlsx'||!/^[a-f0-9]{64}$/i.test(book.sha256)||!Array.isArray(book.sheets))throw Error('Fonte inesperada');
 const entries=new Map(),rejected=[];
 for(const sheet of book.sheets.filter(s=>['RP1','RP2'].includes(s.name))){
  if(!Array.isArray(sheet.rows)||!sheet.rows.length)throw Error('Aba vazia');
  const first=sheet.rows.find(r=>r.row===1);if(!first?.cells.some(c=>c.ref==='A1'&&normalizeName(c.value)==='produto'))throw Error('Cabeçalho inesperado');
  let footer=false;
  for(const row of sheet.rows){if(row.row<=1)continue;const values=Object.fromEntries(row.cells.map(c=>[c.ref.replace(/[0-9]+$/,''),c.value]));const name=String(values.A??'').trim().replace(/\s+/g,' ');
   if(['kg','valor gasto a mais:'].includes(normalizeName(name)))footer=true;
   if(footer){rejected.push({aba:sheet.name,linha:row.row,motivo:'Rodapé/nota fora da lista de produtos'});continue;}
   if(!name){if(row.cells.length)rejected.push({aba:sheet.name,linha:row.row,motivo:'Linha sem nome de produto'});continue;}
   if(name.length>200||/^[\d\W_]+$/u.test(name)){rejected.push({aba:sheet.name,linha:row.row,motivo:'Nome inválido'});continue;}
   const key=normalizeName(name);const item=entries.get(key)??{chave:key,descricao:name,origens:[]};
   item.origens.push({arquivo:book.file,sha256:book.sha256.toLowerCase(),aba:sheet.name,linha:row.row,apresentacao:String(values.O??'').trim(),observacao:String(values.N??'').trim()});entries.set(key,item);
  }
 }
 if(!book.sheets.some(s=>s.name==='RP1')||!book.sheets.some(s=>s.name==='RP2'))throw Error('Abas RP1/RP2 obrigatórias');
 return{itens:[...entries.values()].sort((a,b)=>a.chave.localeCompare(b.chave,'pt-BR')),rejeitadas:rejected,quantidadesIgnoradas:true,precosIgnorados:true};
}
