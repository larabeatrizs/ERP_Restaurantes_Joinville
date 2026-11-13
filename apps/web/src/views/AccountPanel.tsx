import { useState } from 'react';
import { auth } from '../services/auth.ts';
export function AccountPanel({ name }: { name: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function recover() {
    setBusy(true); setMessage(''); setError('');
    try {
      const user = await auth?.getUser(); const email = user?.data.user?.email;
      if (!auth || !email || user?.error) throw Error('Session unavailable');
      const result = await auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (result.error) throw Error('Recovery failed');
      setMessage('Solicitação recebida. Confira as instruções no e-mail cadastrado, incluindo o spam.');
    } catch { setError('Não foi possível solicitar o link agora. Aguarde e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <section className="card" aria-label="Meu acesso"><h2>Seu acesso</h2><p>{name || 'Identificação temporariamente indisponível.'}</p><p>Para trocar sua senha, solicite um link no e-mail cadastrado. O link permite definir a nova senha com segurança.</p>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={() => void recover()}>{busy ? 'Solicitando…' : 'Enviar link para trocar senha'}</button></section>;
}
