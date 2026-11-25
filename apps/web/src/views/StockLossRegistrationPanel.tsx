import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isStockLossAttachment, isStockLossRegistration, stockLossAttachmentMaxBytes, valueStockLoss } from '@erp/contracts';
import type { StockLossRegistration, StockLossRegistrationContext } from '@erp/contracts';
import { RequestError } from '../services/api.ts';
import { decimalLabel } from '../services/stock-api.ts';
import type { StockApi } from '../services/stock-api.ts';
import { Skeleton } from './Skeleton.tsx';
import { StockLossReviewPanel } from './StockLossReviewPanel.tsx';

function readPhoto(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve({ mime: file.type, base64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}

export function StockLossRegistrationPanel({ api, unit, onBusy, onDirty }: {
  api: StockApi;
  unit: string;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [context, setContext] = useState<StockLossRegistrationContext>();
  const [reviewOnly, setReviewOnly] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [positionKey, setPositionKey] = useState('');
  const [date, setDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File>();
  const photoInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<StockLossRegistration>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState('');

  useEffect(() => {
    let active = true;
    void api.lossRegistrationContext(unit).then(result => {
      if (active) {
        setContext(result);
        setDate(result.data_referencia);
      }
    }).catch(err => {
      if (!active) return;
      if (err instanceof RequestError && err.status === 403) setReviewOnly(true);
      else setLoadFailed(true);
    });
    return () => { active = false; };
  }, [api, unit, reload]);

  const position = context?.posicoes.find(row => `${row.lote_id}:${row.camara_id}` === positionKey);
  const normalized = quantity.trim().replace(',', '.');
  const estimate = position && valueStockLoss(normalized, position.quantidade, position.valor_unitario);
  const locked = saving || !!pending;
  const requiresPhoto = context?.motivos.find(row => row.id === reason)?.exige_anexo === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const draft = pending ?? {
      lote_id: position?.lote_id ?? '', camara_id: position?.camara_id ?? '',
      data_registro: date, quantidade: normalized, motivo_id: reason,
      justificativa: notes.trim(), chave: crypto.randomUUID(),
    };
    if (!isStockLossRegistration(draft) || (!pending && (!estimate?.ok || date > (context?.data_referencia ?? '')))) {
      setError(estimate && !estimate.ok && estimate.motivo === 'SALDO_INSUFICIENTE'
        ? 'A quantidade excede o saldo do lote neste local.'
        : 'Confira o lote, a data, a quantidade e o motivo.');
      return;
    }
    if (!pending && ((requiresPhoto && !photo) || (photo && (photo.size > stockLossAttachmentMaxBytes
      || !['image/jpeg', 'image/png'].includes(photo.type))))) {
      setError('Selecione uma foto JPEG ou PNG de até 2 MiB.');
      return;
    }

    setSaving(true);
    onBusy(true);
    setRegistered('');
    setError('');
    let input: StockLossRegistration = draft;
    try {
      if (photo && !pending) {
        const attachment = await readPhoto(photo).catch(() => undefined);
        if (!isStockLossAttachment(attachment)) {
          setError('Não foi possível ler a foto. Selecione o arquivo novamente.');
          return;
        }
        input = { ...draft, anexo: attachment };
      }
      setRegistered(await api.registerLoss(unit, input));
      setPending(undefined);
      setPositionKey('');
      setDate(context?.data_referencia ?? '');
      setQuantity('');
      setReason('');
      setNotes('');
      setPhoto(undefined);
      if (photoInput.current) photoInput.current.value = '';
      onDirty(false);
    } catch (err) {
      if (pending || !(err instanceof RequestError) || err.status >= 500) {
        setPending(input);
        setError('O envio ficou sem confirmação. Reenvie a mesma perda para obter o resultado.');
      } else if (err.status === 409) {
        setError('Confira o saldo do lote e se a competência continua aberta.');
      } else {
        setError('O registro foi recusado. Confira sua sessão, os campos e o motivo selecionado.');
      }
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  if (reviewOnly) return <StockLossReviewPanel api={api} unit={unit} onBusy={onBusy} />;
  if (loadFailed) return <section className="card">
    <p role="alert" className="notice error">Não foi possível carregar as opções para registrar perdas.</p>
    <button type="button" onClick={() => { setLoadFailed(false); setReload(value => value + 1); }}>Tentar novamente</button>
  </section>;
  if (!context) return <Skeleton label="Carregando opções de perdas…" />;

  return <section className="card" aria-label="Registrar perda por lote">
    <h2>Registrar perda por lote</h2>
    {registered && <p role="status" className="notice">Perda #{registered} registrada. Aguarda revisão para movimentar o estoque.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {!context.posicoes.length && <p>Nenhum lote com saldo disponível nesta unidade.</p>}
    {!context.motivos.length && <p>Nenhum motivo ativo disponível para registro.</p>}
    {!!context.posicoes.length && !!context.motivos.length && <form onSubmit={event => void submit(event)} onChange={() => onDirty(true)}>
      <fieldset disabled={locked}>
        <label className="field"><span id="perda-lote-label">Lote e local</span>
          <select aria-labelledby="perda-lote-label" required value={positionKey} onChange={event => setPositionKey(event.target.value)}>
            <option value="">Selecione</option>
            {context.posicoes.map(row => <option key={`${row.lote_id}:${row.camara_id}`} value={`${row.lote_id}:${row.camara_id}`}>{row.produto} · {row.lote} · {row.local}</option>)}
          </select>
        </label>
        <label className="field">Data da perda<input type="date" required max={context.data_referencia} value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="field">Quantidade<input required inputMode="decimal" maxLength={19} value={quantity} onChange={event => setQuantity(event.target.value)} />
          {position && <span className="hint">Saldo disponível de {decimalLabel(position.quantidade)} {position.unidade_medida}</span>}
        </label>
        <label className="field"><span id="perda-motivo-label">Motivo</span><select aria-labelledby="perda-motivo-label" required value={reason} onChange={event => setReason(event.target.value)}>
          <option value="">Selecione</option>
          {context.motivos.map(row => <option key={row.id} value={row.id}>{row.descricao}</option>)}
        </select></label>
        <label className="field">Justificativa<textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <label className="field">{requiresPhoto ? 'Foto obrigatória' : 'Foto'}
          <input ref={photoInput} type="file" accept="image/jpeg,image/png" required={requiresPhoto}
            onChange={event => setPhoto(event.target.files?.[0])} />
          <span className="hint">JPEG ou PNG, até 2 MiB.</span>
        </label>
      </fieldset>
      {estimate?.ok && <p>Prejuízo estimado de R$ {decimalLabel(estimate.valor_prejuizo, 2)}</p>}
      <div className="actions footer-actions">
        <button className="primary" disabled={saving}>{saving ? 'Registrando…' : pending ? 'Reenviar a mesma perda' : 'Registrar perda'}</button>
      </div>
    </form>}
  </section>;
}
