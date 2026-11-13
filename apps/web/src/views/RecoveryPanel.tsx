import { useState } from 'react';
import type { FormEvent } from 'react';
import { auth } from '../services/auth.ts';
export function RecoveryPanel({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const email = String(new FormData(event.currentTarget).get('email')).trim();
    setBusy(true); setError(''); setSent(false);
    try {
      if (!auth) throw Error('Unavailable');
      const { error: failed } = await auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (failed) throw Error('Recovery unavailable');
      setSent(true);
    } catch { setError('Não foi possível solicitar o link agora. Aguarde e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className="login-form"><form onSubmit={event => void send(event)}>
    <h1>Recuperar senha</h1><p>Informe o e-mail cadastrado para receber um link e definir uma nova senha.</p>
    {error && <p role="alert">{error}</p>}{sent && <p role="status">Se houver uma conta apta para este e-mail, você receberá as instruções. Confira também o spam.</p>}
    <label className="field">E-mail de recuperação<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
    <button className="primary" disabled={busy || !auth}>{busy ? 'Solicitando…' : 'Enviar link de recuperação'}</button>
    <button type="button" disabled={busy} onClick={onBack}>Voltar ao login</button>
  </form></main>;
}
