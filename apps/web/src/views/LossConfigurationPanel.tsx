import { useEffect, useState } from 'react';
import type { LossConfiguration, LossConfigurationChange, LossReason } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import type { SettingsApi } from '../services/api.ts';
import { Skeleton } from './Skeleton.tsx';

const newReason = { id: '', descricao: '', exige_anexo: false, ativo: true };

export function LossConfigurationPanel({ api, onDirty, onBusy }: {
  api: SettingsApi;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<LossConfiguration>();
  const [reason, setReason] = useState<LossReason>();
  const [substitute, setSubstitute] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void api.lossConfiguration().then(value => {
      if (!active) return;
      setSnapshot(value);
      setSubstitute(value.substituto ?? '');
    }).catch(err => {
      if (active) setError(err instanceof RequestError && err.status === 403
        ? 'Esta configuração exige permissão de gestão administrativa.'
        : 'Não foi possível consultar a configuração de perdas.');
    });
    return () => { active = false; };
  }, [api, reload]);

  function refresh() {
    if ((reason || (snapshot?.substituto ?? '') !== substitute) && !window.confirm('Descartar as alterações ainda não salvas?')) return;
    setReason(undefined);
    setSnapshot(undefined);
    setError('');
    setMessage('');
    onDirty(false);
    setReload(value => value + 1);
  }

  async function save(change: LossConfigurationChange) {
    setBusy(true);
    onBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await api.lossConfiguration(change);
      setSnapshot(value);
      setSubstitute(value.substituto ?? '');
      setReason(undefined);
      onDirty(false);
      setMessage(change.acao === 'motivo' ? 'Motivo salvo.' : 'Substituto atualizado.');
    } catch (err) {
      setError(err instanceof RequestError && err.status === 409
        ? 'A configuração mudou ou já existe um motivo com essa descrição. Confira os dados antes de salvar.'
        : 'Não foi possível salvar. Confira os dados e suas permissões.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  if (!snapshot && !error) return <Skeleton label="Carregando configuração de perdas…" />;
  const substituteChanged = (snapshot?.substituto ?? '') !== substitute;
  return <>
    {message && <p role="status" className="notice">{message}</p>}
    {error && <div><p role="alert" className="notice error">{error}</p><button type="button" disabled={busy} onClick={refresh}>Atualizar consulta</button></div>}
    {snapshot && <>
      <section className="card">
        <div className="section-heading"><h2>Motivos de perda</h2>
          <button type="button" disabled={busy || !!reason || substituteChanged} onClick={() => { setReason(newReason); onDirty(true); }}>Novo motivo</button>
        </div>
        {reason ? <form onSubmit={event => {
          event.preventDefault();
          if (reason.descricao.trim()) void save({ ...reason, acao: 'motivo', revisao: snapshot.revisao, descricao: reason.descricao.trim(), id: reason.id || null });
        }}>
          <fieldset disabled={busy}>
            <label className="field">Descrição<input required maxLength={200} value={reason.descricao} onChange={event => setReason({ ...reason, descricao: event.target.value })} /></label>
            <label><input type="checkbox" checked={reason.exige_anexo} onChange={event => setReason({ ...reason, exige_anexo: event.target.checked })} /> Exige anexo</label>
            <label><input type="checkbox" checked={reason.ativo} onChange={event => setReason({ ...reason, ativo: event.target.checked })} /> Ativo</label>
          </fieldset>
          <div className="actions footer-actions">
            <button type="button" disabled={busy} onClick={() => { setReason(undefined); onDirty(false); }}>Cancelar</button>
            <button className="primary" disabled={busy}>Salvar motivo</button>
          </div>
        </form> : snapshot.motivos.length ? <div className="table-wrap"><table>
          <thead><tr><th>Descrição</th><th>Anexo</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{snapshot.motivos.map(row => <tr key={row.id}>
            <td>{row.descricao}</td><td>{row.exige_anexo ? 'Obrigatório' : 'Dispensado'}</td><td>{row.ativo ? 'Ativo' : 'Inativo'}</td>
            <td><button type="button" disabled={busy || substituteChanged} onClick={() => { setReason(row); onDirty(true); }}>Editar {row.descricao}</button></td>
          </tr>)}</tbody>
        </table></div> : <p>Nenhum motivo cadastrado.</p>}
      </section>
      <section className="card">
        <h2>Gestor substituto em Bucarein</h2>
        {snapshot.bucarein ? <form onSubmit={event => {
          event.preventDefault();
          if (substituteChanged) void save({ acao: 'substituto', revisao: snapshot.revisao, usuario_id: substitute || null });
        }}>
          <label className="field"><span id="perda-substituto-label">Gestor substituto</span>
            <select aria-labelledby="perda-substituto-label" disabled={busy || !!reason} value={substitute}
              onChange={event => { setSubstitute(event.target.value); onDirty(event.target.value !== (snapshot.substituto ?? '')); }}>
              <option value="">Sem substituto</option>
              {snapshot.substituto && !snapshot.gestores.some(row => row.id === snapshot.substituto)
                && <option value={snapshot.substituto} disabled>Gestor indisponível</option>}
              {snapshot.gestores.map(row => <option key={row.id} value={row.id}>{row.nome}</option>)}
            </select>
          </label>
          <div className="actions footer-actions"><button className="primary" disabled={busy || !!reason || !substituteChanged}>Salvar substituto</button></div>
        </form> : <p>Bucarein está indisponível.</p>}
      </section>
    </>}
  </>;
}
