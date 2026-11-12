import { useState } from 'react';
import type { FormEvent } from 'react';
import { auth } from '../services/auth.ts';
import { validPassword, passwordHint } from '@erp/contracts';
import { PasswordField } from './PasswordField.tsx';

export function PasswordPanel({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password'));
    if (password !== fields.get('confirmation')) { setError('As senhas precisam ser iguais.'); return; }
    if (!validPassword(password)) {
      setError(passwordHint); return;
    }
    setBusy(true); setError('');
    try {
      if (!auth) throw Error('Unavailable');
      const { error: failed } = await auth.updateUser({ password });
      if (failed) throw Error('Update failed');
      await onDone();
    } catch { setError('Não foi possível concluir. Tente novamente ou solicite um novo link à administração.'); }
    finally { setBusy(false); }
  }
  return <main className="login-form">
    <form onSubmit={(event) => void save(event)}>
      <h1>Definir senha</h1>
        <p>Escolha sua senha de acesso. Após salvar, entre com seu nome de usuário e a nova senha.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <PasswordField id="new-password" name="password" label="Nova senha" autoComplete="new-password" disabled={busy} describedBy="new-password-hint" />
      <p id="new-password-hint" className="hint">{passwordHint}</p>
      <PasswordField id="confirm-password" name="confirmation" label="Confirmar nova senha" autoComplete="new-password" disabled={busy} />
      <button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
      <button type="button" disabled={busy} onClick={() => { void onCancel().catch(() => setError('Não foi possível sair. Tente novamente.')); }}>Sair</button>
    </form>
  </main>;
}
