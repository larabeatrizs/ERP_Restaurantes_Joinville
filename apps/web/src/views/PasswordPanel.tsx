import { useState } from 'react';
import type { FormEvent } from 'react';
import { auth } from '../services/auth.ts';

export function PasswordPanel({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password'));
    if (password !== fields.get('confirmation')) { setError('As senhas precisam ser iguais.'); return; }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError('Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.'); return;
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
      <p>Escolha sua senha de acesso. Após salvar, entre com seu e-mail e a nova senha.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <label className="field">Nova senha<input name="password" type="password" autoComplete="new-password" required disabled={busy} aria-describedby="new-password-hint" /></label>
      <p id="new-password-hint" className="hint">Pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>
      <label className="field">Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" required disabled={busy} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
      <button type="button" disabled={busy} onClick={() => { void onCancel().catch(() => setError('Não foi possível sair. Tente novamente.')); }}>Sair</button>
    </form>
  </main>;
}
