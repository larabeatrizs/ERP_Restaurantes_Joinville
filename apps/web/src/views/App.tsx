import { MeasureApi } from '../services/measure-api.ts';
import { CategoryApi } from '../services/category-api.ts';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { auth, initialPasswordToken, passwordPending, markPasswordPending, activatePasswordLink } from '../services/auth.ts';
import { SettingsApi } from '../services/api.ts';
import { Workspace } from './Workspace.tsx';
import { StockApi } from '../services/stock-api.ts';
import { PasswordPanel } from './PasswordPanel.tsx';
import './styles.css';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!auth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(passwordPending);
  const [linkState, setLinkState] = useState(initialPasswordToken !== null ? 'verifying' : 'none');
  const [notice, setNotice] = useState('');
  const api = useMemo(
    () =>
      new SettingsApi(
        async () => (await auth?.getSession())?.data.session?.access_token,
      ),
    [],
  );
  const measures = useMemo(() => new MeasureApi(async () => (await auth?.getSession())?.data.session?.access_token), []);
  const categories = useMemo(() => new CategoryApi(async () => (await auth?.getSession())?.data.session?.access_token), []);
  const stock = useMemo(() => new StockApi(async () => (await auth?.getSession())?.data.session?.access_token), []);
  useEffect(() => {
    if (!auth) return;
    function passwordNavigation() {
      // Abrir um link no mesmo tab pode mudar só o fragmento, sem remontar a View.
      if (new URLSearchParams(window.location.hash.slice(1)).has('definir-senha')) window.location.reload();
    }
    window.addEventListener('hashchange', passwordNavigation);
    const { data } = auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') { markPasswordPending(true); setPasswordMode(true); }
      if (event === 'SIGNED_OUT') { markPasswordPending(false); setPasswordMode(false); }
    });
    let active = true;
    if (initialPasswordToken !== null) void activatePasswordLink().then((ok) => {
      if (active) setLinkState(ok ? 'valid' : 'invalid');
    });
    return () => { active = false; data.subscription.unsubscribe(); window.removeEventListener('hashchange', passwordNavigation); };
  }, []);
  async function endPasswordSession(saved = false) {
    const result = await auth?.signOut({ scope: 'local' });
    if (result?.error) throw result.error;
    markPasswordPending(false); setPasswordMode(false); setLinkState('none'); setSession(null);
    setNotice(saved ? 'Senha definida. Entre com seu e-mail e a nova senha.' : '');
  }
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
  if (!ready || linkState === 'verifying')
    return (
      <main className="login-form" role="status">
        Carregando sessão…
      </main>
    );
  if (linkState === 'invalid') return <main className="login-form"><h1>Link indisponível</h1><p role="alert">Este link expirou, já foi utilizado ou é inválido. Solicite um novo link à administração.</p><button onClick={() => { void endPasswordSession().catch(() => setError('Não foi possível sair. Tente novamente.')); }}>Voltar ao login</button>{error && <p role="alert">{error}</p>}</main>;
  if (session && passwordMode) return <PasswordPanel onDone={() => endPasswordSession(true)} onCancel={() => endPasswordSession()} />;
  if (session)
    return (
      <Workspace
        measures={measures}
        categories={categories}
        api={api}
        stock={stock}
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
          {notice && <p role="status" className="notice">{notice}</p>}
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
