import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { auth } from '../services/auth.ts';
import { SettingsApi } from '../services/api.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import './styles.css';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!auth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const api = useMemo(
    () =>
      new SettingsApi(
        async () => (await auth?.getSession())?.data.session?.access_token,
      ),
    [],
  );
  useEffect(() => {
    if (!auth) return;
    const { data } = auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await auth?.signInWithPassword({
        email: String(fields.get('email')),
        password: String(fields.get('password')),
      });
      if (result?.error)
        setError(
          'Não foi possível entrar. Verifique seus dados ou procure a administração.',
        );
    } catch {
      setError('Serviço indisponível. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main className="login-form" role="status">
        Carregando sessão…
      </main>
    );
  if (session)
    return (
      <SettingsPanel
        api={api}
        onSignOut={async () => {
          const result = await auth!.signOut();
          if (result.error) throw result.error;
        }}
      />
    );
  return (
    <div className="login">
      <aside className="login-brand">
        <div className="brand-image">
          <img
            src="/brand/programa.png"
            alt="Programa Restaurante Popular de Joinville"
          />
        </div>
        <p>
          Gestão de estoque e cardápio dos Restaurantes Populares de Joinville
        </p>
      </aside>
      <main className="login-form">
        <form onSubmit={(event) => void login(event)}>
          <header>
            <h1>Entrar</h1>
            <p className="muted">Use seu e-mail e senha para acessar.</p>
          </header>
          {!auth && (
            <p role="status" className="notice">
              O acesso ainda não foi configurado. Entre em contato com a
              administração.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <label className="field">
            E-mail
            <input
              name="email"
              type="email"
              placeholder="nome@exemplo.com"
              autoComplete="username"
              required
              disabled={!auth || busy}
            />
          </label>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Sua senha"
              aria-describedby="password-hint"
              autoComplete="current-password"
              required
              disabled={!auth || busy}
            />
            <p id="password-hint" className="hint">
              Esqueceu a senha? Fale com o administrador do sistema.
            </p>
          </div>
          <button className="primary" disabled={!auth || busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
