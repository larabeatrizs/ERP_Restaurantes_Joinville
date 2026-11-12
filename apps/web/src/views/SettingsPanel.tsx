import { useEffect, useRef, useState } from 'react';
import type {
  Configuration,
  ConfigurationFields,
  UnitSummary,
} from '@erp/contracts';
import { isConfigurationPatch } from '@erp/contracts';
import { SettingsApi, RequestError, errorMessage } from '../services/api.ts';
import type { SettingsSnapshot } from '../services/api.ts';
import { workspacePages } from './Workspace.tsx';
import type { WorkspacePage } from './Workspace.tsx';

const labels = {
  modo_saida: 'Modo de saída',
  margem_percentual: 'Margem (%)',
  dias_alerta_validade: 'Alerta de validade (dias)',
  prazo_amostra_horas: 'Prazo de amostra (horas)',
  periodicidade_inventario_dias: 'Periodicidade do inventário (dias)',
  referencia_preco: 'Referência de preço',
} as const;
type Field = keyof typeof labels;
type Draft = Record<Field, string>;
const keys = Object.keys(labels) as Field[];
function draftOf(config: Configuration): Draft {
  return Object.fromEntries(
    keys.map((key) => [key, key === 'margem_percentual' ? String(config[key]).replace('.', ',') : String(config[key])]),
  ) as Draft;
}
function changes(
  draft: Draft,
  base: Configuration,
): Partial<ConfigurationFields> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value =
      key === 'margem_percentual'
        ? draft[key].trim().replace(',', '.')
        : key.endsWith('_dias') ||
            key.endsWith('_horas') ||
            key === 'dias_alerta_validade'
          ? draft[key].trim()
            ? Number(draft[key])
            : NaN
          : draft[key];
    if (
      key === 'margem_percentual'
        ? Number(value) !== Number(base[key]) || String(value).length === 0
        : value !== base[key]
    )
      result[key] = value;
  }
  return result as Partial<ConfigurationFields>;
}
function display(value: unknown): string {
  const choices: Record<string, string> = {
    PREVIA: 'Prévia',
    POSTERIOR: 'Posterior',
    MENOR_COTACAO: 'Menor cotação',
    ULTIMO_PAGO: 'Último preço pago',
    MEDIA_LOTES: 'Média dos lotes',
  };
  return choices[String(value)] ?? String(value).replace('.', ',');
}
export function SettingsPanel({
  api,
  onSignOut,
  onNavigate,
  initialUnit = '',
  onUnitChange,
  userName = '',
}: {
  api: SettingsApi;
  onSignOut: () => Promise<void>;
  onNavigate?: (page: WorkspacePage) => void;
  initialUnit?: string;
  onUnitChange?: (unit: string) => void;
  userName?: string;
}) {
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [unit, setUnit] = useState(initialUnit);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [draft, setDraft] = useState<Draft>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<SettingsSnapshot>();
  const [stale, setStale] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const changed =
    snapshot && draft ? changes(draft, snapshot.configuracao) : {};
  const dirty = Object.keys(changed).length > 0;
  const editable = snapshot?.pode_editar ?? false;
  const valid = isConfigurationPatch({ campos: changed, motivo: 'validar' });
  const invalid = (key: Field) =>
    key in changed &&
    !isConfigurationPatch({
      campos: { [key]: changed[key] },
      motivo: 'validar',
    });
  useEffect(() => { if (unit) onUnitChange?.(unit); }, [unit, onUnitChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api
      .units()
      .then((list) => {
        if (active) {
          setUnits(list);
          setUnit((current) => current || list[0]?.id || '');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, retry]);
  useEffect(() => {
    if (!unit) return;
    generation.current += 1;
    let active = true;
    setLoading(true);
    setSnapshot(undefined);
    setDraft(undefined);
    setError('');
    setMessage('');
    setStale(false);
    setConflict(undefined);
    setReason('');
    void api
      .read(unit)
      .then((next) => {
        if (active) {
          setSnapshot(next);
          setDraft(draftOf(next.configuracao));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [api, unit, retry]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function allowDiscard() {
    return (
      !dirty || window.confirm('Descartar as alterações ainda não salvas?')
    );
  }
  function edit(key: Field, value: string) {
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
    setMessage('');
  }
  async function readConflict() {
    const version = generation.current;
    try {
      const latest = await api.read(unit);
      if (version === generation.current) setConflict(latest);
    } catch (err) {
      if (version === generation.current) setError(errorMessage(err));
    }
  }
  async function save() {
    if (!snapshot || !isConfigurationPatch({ campos: changed, motivo: reason }))
      return;
    setSaving(true);
    setError('');
    try {
      const next = await api.save(unit, snapshot.etag, {
        campos: changed,
        motivo: reason.trim(),
      });
      setSnapshot({ ...next, pode_editar: snapshot.pode_editar });
      setDraft(draftOf(next.configuracao));
      setReason('');
      setMessage('Configurações salvas com sucesso.');
      dialog.current?.close();
    } catch (err) {
      if (err instanceof RequestError && err.status === 412) {
        setStale(true);
        dialog.current?.close();
        setError(
          'Outra pessoa alterou esta configuração. Compare a versão atual antes de continuar.',
        );
        await readConflict();
      } else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  function rebase() {
    if (!conflict) return;
    const next = draftOf(conflict.configuracao);
    for (const key of keys) if (key in changed) next[key] = draft![key];
    setSnapshot(conflict);
    setDraft(next);
    setConflict(undefined);
    setStale(false);
    setError('');
    setMessage('Edição reaplicada. Revise novamente antes de salvar.');
  }
  const selected = units.find((item) => item.id === unit);
  return (
    <div className="shell">
      <a className="skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <aside className="side">
        <div className="brand">Restaurante Popular</div>
        <p className="unit-caption"><strong>{userName || 'Conta conectada'}</strong><br />{units.find(item => item.id === unit)?.nome ?? 'Consultando unidade…'}</p>
        <nav aria-label="Principal">
          {workspacePages.map(item => <a key={item.key} href={`#${item.key}`} aria-current={item.key === 'configuracoes' ? 'page' : undefined} aria-disabled={saving} onClick={event => {
            event.preventDefault();
            if (!saving && item.key !== 'configuracoes' && allowDiscard()) onNavigate?.(item.key);
          }}>{item.label}</a>)}
        </nav>
        <button
          className="signout"
          disabled={saving}
          onClick={() => {
            if (allowDiscard())
              void onSignOut().catch((err) => setError(errorMessage(err)));
          }}
        >
          Sair
        </button>
      </aside>
      <main id="conteudo" className="main">
        <header>
          <p className="eyebrow">GESTÃO DA UNIDADE</p>
          <h1>Configurações</h1>
          <p className="muted">Parâmetros para a rotina de cada restaurante.</p>
          <p className="hint">Defina regras e prazos da unidade. As alterações passam por revisão, exigem motivo e ficam registradas no histórico.</p>
        </header>
        <section className="card unit-card" aria-label="Unidade">
          <label className="field">
            Unidade
            <select
              value={unit}
              disabled={saving || loading || units.length === 0}
              onChange={(event) => {
                if (allowDiscard()) setUnit(event.target.value);
              }}
            >
              {units.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo} — {item.nome}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            As opções seguem seu vínculo e suas permissões na unidade.
          </p>
        </section>
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {error && !dialog.current?.open && (
          <p role="alert" className="error notice">
            {error}
          </p>
        )}
        {loading && <p role="status">Carregando configurações…</p>}
        {!loading && !units.length && !error && (
          <p className="notice">
            Nenhuma unidade ativa disponível para sua conta. Procure a
            administração.
          </p>
        )}
        {!loading && !snapshot && error && (
          <button onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        )}
        {snapshot && draft && !loading && (
          <>
            <div className="section-heading">
              <div>
                <h2>{selected?.nome}</h2>
                <p className="hint">
                  {editable
                    ? 'As alterações passam por revisão e ficam registradas com seu motivo.'
                    : 'Acesso somente para consulta nesta unidade.'}
                </p>
              </div>
              <span className="badge">
                {editable ? 'Edição permitida' : 'Somente leitura'}
              </span>
            </div>
            {stale && (
              <section className="card warning" aria-label="Conflito de edição">
                <h2>Configuração atualizada por outra pessoa</h2>
                {conflict ? (
                  <>
                    <p>
                      Sua edição foi preservada. Reaplicar mantém as mudanças
                      remotas dos campos que você não editou.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Campo</th>
                            <th>Versão atual</th>
                            <th>Sua edição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keys
                            .filter((key) => key in changed)
                            .map((key) => (
                              <tr key={key}>
                                <th>{labels[key]}</th>
                                <td>{display(conflict.configuracao[key])}</td>
                                <td>{display(draft[key])}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <button className="primary" onClick={rebase}>
                        Reaplicar minha edição
                      </button>
                      <button
                        onClick={() => {
                          if (allowDiscard()) {
                            setSnapshot(conflict);
                            setDraft(draftOf(conflict.configuracao));
                            setConflict(undefined);
                            setStale(false);
                            setReason('');
                            setError('');
                          }
                        }}
                      >
                        Usar versão atual
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => void readConflict()}>
                    Carregar versão atual
                  </button>
                )}
              </section>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (valid && editable && !stale) {
                  setError('');
                  dialog.current?.showModal();
                }
              }}
            >
              <fieldset disabled={!editable || saving || stale}>
                <section className="card">
                  <h2>Operação e custos</h2>
                  <p className="hint">
                    Aplique as definições aprovadas para esta unidade.
                  </p>
                  <div className="row">
                    <label className="field">
                      Modo de saída
                      <select
                        aria-label="Modo de saída"
                        aria-describedby="modo-hint"
                        value={draft.modo_saida}
                        onChange={(event) =>
                          edit('modo_saida', event.target.value)
                        }
                      >
                        <option value="PREVIA">Prévia</option>
                        <option value="POSTERIOR">Posterior</option>
                      </select>
                      <span id="modo-hint" className="hint">
                        A mudança não altera movimentações anteriores.
                      </span>
                    </label>
                    <label className="field">
                      Margem (%)
                      <input
                        aria-label="Margem (%)"
                        aria-describedby="margem-hint"
                        aria-invalid={invalid('margem_percentual')}
                        inputMode="decimal"
                        value={draft.margem_percentual}
                        onChange={(event) =>
                          edit('margem_percentual', event.target.value)
                        }
                      />
                      <span id="margem-hint" className="hint">
                        De 0 a 100, com até duas casas decimais.
                      </span>
                      {invalid('margem_percentual') && (
                        <span className="error">
                          Informe uma margem válida.
                        </span>
                      )}
                    </label>
                    <label className="field">
                      Referência de preço
                      <select
                        value={draft.referencia_preco}
                        onChange={(event) =>
                          edit('referencia_preco', event.target.value)
                        }
                      >
                        <option value="MENOR_COTACAO">Menor cotação</option>
                        <option value="ULTIMO_PAGO">Último preço pago</option>
                        <option value="MEDIA_LOTES">Média dos lotes</option>
                      </select>
                    </label>
                  </div>
                </section>
                <section className="card">
                  <h2>Alertas e planejamento</h2>
                  <div className="row">
                    {(
                      [
                        'dias_alerta_validade',
                        'prazo_amostra_horas',
                        'periodicidade_inventario_dias',
                      ] as const
                    ).map((key) => (
                      <label className="field" key={key}>
                        {labels[key]}
                        <input
                          type="number"
                          aria-invalid={invalid(key)}
                          aria-describedby={
                            invalid(key) ? `${key}-erro` : undefined
                          }
                          min={key === 'dias_alerta_validade' ? 0 : 1}
                          max="2147483647"
                          step="1"
                          value={draft[key]}
                          onChange={(event) => edit(key, event.target.value)}
                          required
                        />
                        {invalid(key) && (
                          <span id={`${key}-erro`} className="error">
                            Informe um número inteiro válido dentro do intervalo
                            indicado.
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="hint">
                    Envio de alertas por email ainda indisponível. Esta tela não
                    habilita notificações.
                  </p>
                </section>
              </fieldset>
              {dirty && !valid && (
                <p className="error" role="alert">
                  Revise os valores: margem entre 0 e 100, dias de validade a
                  partir de zero e demais prazos inteiros maiores que zero.
                </p>
              )}
              <div className="actions footer-actions">
                <button
                  type="button"
                  disabled={!editable || saving || stale}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      margem_percentual: '5',
                      dias_alerta_validade: '7',
                      prazo_amostra_horas: '72',
                      periodicidade_inventario_dias: '7',
                      referencia_preco: 'MENOR_COTACAO',
                    })
                  }
                >
                  Restaurar valores de referência
                </button>
                <div className="actions">
                  <button
                    type="button"
                    disabled={!dirty || saving || stale}
                    onClick={() => {
                      if (allowDiscard()) {
                        setDraft(draftOf(snapshot.configuracao));
                        setReason('');
                        setError('');
                      }
                    }}
                  >
                    Cancelar edição
                  </button>
                  <button
                    className="primary"
                    disabled={!dirty || !valid || !editable || saving || stale}
                  >
                    Revisar alterações
                  </button>
                </div>
              </div>
            </form>
            <dialog
              ref={dialog}
              aria-labelledby="review-title"
              onCancel={(event) => {
                if (saving) event.preventDefault();
              }}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <h2 id="review-title">Revisar alterações</h2>
                <p>Confira os valores de {selected?.nome} antes de salvar.</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Antes</th>
                        <th>Depois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys
                        .filter((key) => key in changed)
                        .map((key) => (
                          <tr key={key}>
                            <th>{labels[key]}</th>
                            <td>{display(snapshot.configuracao[key])}</td>
                            <td>{display(changed[key])}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <label className="field">
                  Motivo da alteração
                  <textarea
                    aria-label="Motivo da alteração"
                    aria-describedby="motivo-hint"
                    value={reason}
                    minLength={3}
                    maxLength={500}
                    required
                    disabled={saving}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <span id="motivo-hint" className="hint">
                    De 3 a 500 caracteres. Não inclua dados pessoais.
                  </span>
                </label>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => dialog.current?.close()}
                  >
                    Voltar à edição
                  </button>
                  <button
                    className="primary"
                    disabled={
                      saving ||
                      !isConfigurationPatch({ campos: changed, motivo: reason })
                    }
                  >
                    {saving ? 'Salvando…' : 'Confirmar e salvar'}
                  </button>
                </div>
              </form>
            </dialog>
          </>
        )}
      </main>
    </div>
  );
}
