import { useState } from 'react';
import type { FormEvent } from 'react';
import { dishTypes, isDishRecipeInput } from '@erp/contracts';
import type { DishIngredientOption, DishRecipe, DishRecipeInput, DishType } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import { decimalLabel } from '../services/stock-api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { DishRecipeRead } from './DishRecipeRead.tsx';
import { DishSavedPanel } from './DishSavedPanel.tsx';

const optionalFields = [
  { key: 'peso_porcao_g', label: 'Peso por porção (g)', numeric: true, max: 19 },
  { key: 'unidade_porcao', label: 'Unidade da porção', numeric: false, max: 100 },
  { key: 'porcoes_por_unidade_compra', label: 'Porções por unidade de compra', numeric: true, max: 19 },
  { key: 'kcal_porcao', label: 'Quilocalorias por porção', numeric: true, max: 19 },
] as const;
const decimal = (value: string) => value.trim().replace(',', '.');
type Details = Partial<Record<typeof optionalFields[number]['key'], string>>;
type Ingredient = DishIngredientOption & { quantity: string; factor: string; notes: string };

export function DishRecipePanel({ api, unit, onDirty, onBusy }: {
  api: StockApi; unit: string; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DishType | ''>('');
  const [servings, setServings] = useState('');
  const [details, setDetails] = useState<Details>({});
  const [preparation, setPreparation] = useState('');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DishIngredientOption[]>();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<DishRecipeInput>();
  const [recipe, setRecipe] = useState<DishRecipe>();
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState('');
  const locked = saving || !!pending;

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setError('');
    try { setOptions(await api.dishIngredients(unit, query.trim())); }
    catch (err) {
      setOptions(undefined);
      setError(err instanceof RequestError && err.status === 403
        ? 'O cadastro exige perfil de nutricionista com vínculo ativo nesta unidade.'
        : 'Não foi possível buscar os insumos.');
    } finally { setSearching(false); }
  }

  function editIngredient(id: string, field: 'quantity' | 'factor' | 'notes', value: string) {
    setIngredients(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
    onDirty(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const fields = Object.fromEntries(optionalFields.flatMap(field => {
      const value = details[field.key]?.trim();
      return value ? [[field.key, field.numeric ? decimal(value) : value]] : [];
    }));
    const input = pending ?? {
      descricao: name.trim(), tipo_prato: type, rendimento_porcoes: /^\d+$/.test(servings) ? Number(servings) : Number.NaN,
      chave: crypto.randomUUID(), ...fields, ...(preparation.trim() ? { modo_preparo: preparation.trim() } : {}),
      itens: ingredients.map(row => ({
        produto_id: row.id, quantidade_receita: decimal(row.quantity), custo_indireto: row.custo_indireto,
        ...(row.factor.trim() ? { fator_correcao: decimal(row.factor) } : {}),
        ...(row.notes.trim() ? { observacao: row.notes.trim() } : {}),
      })),
    };
    if (!isDishRecipeInput(input)) {
      setError('Confira o nome, o tipo, o rendimento e as quantidades. Inclua pelo menos um insumo.');
      return;
    }
    setSaving(true);
    setError('');
    onBusy(true);
    try {
      setRecipe(await api.createDishRecipe(unit, input));
      setPending(undefined);
      onDirty(false);
    } catch (err) {
      if (pending || !(err instanceof RequestError) || err.status >= 500) {
        setPending(input);
        setError('O envio ficou sem confirmação. Reenvie a mesma ficha para obter o resultado.');
      } else if (err.status === 409) setError('Já existe um prato com esse nome ou a chave foi reutilizada.');
      else setError('O cadastro foi recusado. Confira o acesso e os dados da ficha.');
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  const savedAction = <div className="actions"><button type="button" disabled={locked} aria-expanded={showSaved}
    onClick={() => setShowSaved(value => !value)}>{showSaved ? 'Voltar ao cadastro' : 'Consultar fichas salvas'}</button></div>;
  if (showSaved) return <>{savedAction}<DishSavedPanel api={api} unit={unit} /></>;
  if (recipe) return <>{savedAction}<DishRecipeRead recipe={recipe} created action="Novo prato" onAction={() => {
      setRecipe(undefined); setName(''); setType(''); setServings(''); setDetails({}); setPreparation('');
      setIngredients([]); setQuery(''); setOptions(undefined);
    }} /></>;

  return <>
    {savedAction}
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="card" aria-label="Buscar insumos">
      <form className="filters" onSubmit={event => void search(event)}>
        <label className="field">Buscar insumos<input value={query} maxLength={200} disabled={locked || searching}
          onChange={event => setQuery(event.target.value)} /></label>
        <button disabled={locked || searching}>{searching ? 'Buscando…' : 'Buscar insumos'}</button>
      </form>
      {options && (options.length ? <div className="actions">{options.map(row => <button type="button" key={row.id}
        disabled={locked || ingredients.some(item => item.id === row.id) || ingredients.length >= 100}
        onClick={() => { setIngredients(current => [...current, { ...row, quantity: '', factor: '', notes: '' }]); onDirty(true); }}>
        Adicionar {row.descricao}{row.complemento ? ` · ${row.complemento}` : ''}
      </button>)}</div> : <p>Nenhum insumo ativo encontrado.</p>)}
    </section>
    <section className="card" aria-label="Nova ficha técnica">
      <h2>Nova ficha técnica</h2>
      <form onSubmit={event => void save(event)} onChange={() => onDirty(true)}>
        <fieldset disabled={locked}>
          <label className="field">Nome do prato<input required value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label>
          <label className="field"><span id="prato-tipo-label">Tipo de prato</span>
            <select required aria-labelledby="prato-tipo-label" value={type} onChange={event => setType(event.target.value as DishType | '')}>
              <option value="">Selecione</option>{Object.entries(dishTypes).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <label className="field">Rendimento em porções<input required inputMode="numeric" maxLength={10} value={servings}
            onChange={event => setServings(event.target.value)} /></label>
          <details>
            <summary>Porção e modo de preparo</summary>
            <div className="filters">{optionalFields.map(field => <label className="field" key={field.key}>{field.label}
              <input value={details[field.key] ?? ''} inputMode={field.numeric ? 'decimal' : undefined} maxLength={field.max}
                onChange={event => setDetails(current => ({ ...current, [field.key]: event.target.value }))} />
            </label>)}</div>
            <label className="field">Modo de preparo<textarea maxLength={10000} value={preparation} onChange={event => setPreparation(event.target.value)} /></label>
          </details>
          {ingredients.map(row => <fieldset className="receipt-item" key={row.id}>
            <legend>{row.descricao}{row.complemento ? ` · ${row.complemento}` : ''}</legend>
            <div className="filters">
              <label className="field">Quantidade da receita ({row.unidade})<input required inputMode="decimal" maxLength={19}
                value={row.quantity} onChange={event => editIngredient(row.id, 'quantity', event.target.value)} /></label>
              <label className="field">Fator de correção<input inputMode="decimal" maxLength={19} placeholder={decimalLabel(row.fator_correcao)}
                value={row.factor} onChange={event => editIngredient(row.id, 'factor', event.target.value)} /></label>
              <label className="field">Observação<input maxLength={2000} value={row.notes}
                onChange={event => editIngredient(row.id, 'notes', event.target.value)} /></label>
            </div>
            <div className="actions">{row.custo_indireto && <span>Custo indireto</span>}
              <button type="button" onClick={() => { setIngredients(current => current.filter(item => item.id !== row.id)); onDirty(true); }}>Remover insumo</button></div>
          </fieldset>)}
        </fieldset>
        <div className="actions footer-actions"><button className="primary" disabled={saving}>
          {saving ? 'Salvando…' : pending ? 'Reenviar ficha' : 'Salvar ficha técnica'}
        </button></div>
      </form>
    </section>
  </>;
}
