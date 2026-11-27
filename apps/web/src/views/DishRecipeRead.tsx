import { dishTypes } from '@erp/contracts';
import type { DishRecipe } from '@erp/contracts';
import { decimalLabel } from '../services/stock-api.ts';

export function DishRecipeRead({ recipe, action, onAction, created = false }: {
  recipe: DishRecipe; action: string; onAction: () => void; created?: boolean;
}) {
  const details = [
    ['Peso por porção', recipe.peso_porcao_g && `${decimalLabel(recipe.peso_porcao_g)} g`],
    ['Unidade da porção', recipe.unidade_porcao],
    ['Porções por unidade de compra', recipe.porcoes_por_unidade_compra && decimalLabel(recipe.porcoes_por_unidade_compra)],
    ['Quilocalorias por porção', recipe.kcal_porcao && decimalLabel(recipe.kcal_porcao)],
    ['Modo de preparo', recipe.modo_preparo],
  ];
  return <section className="card" aria-label={created ? 'Ficha cadastrada' : 'Ficha técnica'}>
    <div className="section-heading"><h2>{recipe.descricao}</h2><button type="button" onClick={onAction}>{action}</button></div>
    {created && <p className="notice" role="status">Ficha técnica cadastrada. Versão {recipe.numero}.</p>}
    <p>{dishTypes[recipe.tipo_prato]} · {recipe.status === 'ATIVO' ? 'Ativo' : 'Inativo'} · Versão {recipe.numero} · Rendimento de {recipe.rendimento_porcoes} porções</p>
    {details.some(([, value]) => value !== null) && <dl>
      {details.map(([label, value]) => value !== null && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>}
    <div className="table-wrap" role="region" tabIndex={0} aria-label="Insumos da ficha">
      <table><thead><tr><th>Insumo</th><th>Receita inteira</th><th>Por porção</th><th>Fator de correção</th></tr></thead>
        <tbody>{recipe.itens.map(row => <tr key={row.produto_id}><td>{row.produto}
          {row.custo_indireto && <p className="hint">Custo indireto</p>}{row.observacao && <p>{row.observacao}</p>}</td>
          <td>{decimalLabel(row.quantidade_receita)} {row.unidade}</td>
          <td>{decimalLabel(row.quantidade_porcao)} {row.unidade}</td><td>{decimalLabel(row.fator_correcao)}</td>
        </tr>)}</tbody></table>
    </div>
  </section>;
}
