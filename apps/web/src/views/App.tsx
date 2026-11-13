import { CategoryApi } from '../services/category-api.ts';
import { MeasureApi } from '../services/measure-api.ts';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { auth, initialPasswordToken, initialPasswordError, passwordPending, markPasswordPending, activatePasswordLink } from '../services/auth.ts';
import { SettingsApi } from '../services/api.ts';
import { Workspace } from './Workspace.tsx';
import { StockApi } from '../services/stock-api.ts';
import { PasswordPanel } from './PasswordPanel.tsx';
import './styles.css';
import type { UnitSummary } from '@erp/contracts';
import { PasswordField } from './PasswordField.tsx';
import { RecoveryPanel } from './RecoveryPanel.tsx';
import { UnitAccess } from './UnitAccess.tsx';
import { signIn } from '../services/login-api.ts';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!auth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(passwordPending);
  const [linkState, setLinkState] = useState(initialPasswordError ? 'invalid' : initialPasswordToken !== null ? 'verifying' : 'none');
  const [notice, setNotice] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [unit, setUnit] = useState<UnitSummary>();
  const [userName, setUserName] = useState('');
  const api = useMemo(
    () =>
      new SettingsApi(
        async () => (await auth?.getSession())?.data.session?.access_token,
      ),
    [],
  );
  const categories = useMemo(() => new CategoryApi(async () => (await auth?.getSession())?.data.session?.access_token), []);
  const measures = useMemo(() => new MeasureApi(async () => (await auth?.getSession())?.data.session?.access_token), []);
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
      if (event === 'SIGNED_OUT') { markPasswordPending(false); setPasswordMode(false); setUnit(undefined); setUserName(''); }
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
    setNotice(saved ? 'Senha definida. Entre com seu nome de usuário e a nova senha.' : '');
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (!auth) throw Error('Unavailable');
      const tokens = await signIn(String(fields.get('login')), String(fields.get('password')));
      const result = await auth.setSession(tokens);
      if (result.error) throw Error('Invalid session');
    } catch {
      setError('Não foi possível entrar. Verifique seus dados ou procure a administração.');
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
  if (session && !unit) return <UnitAccess api={api} onEnter={(value, name) => { setUnit(value); setUserName(name); }} onSignOut={async () => { const result = await auth!.signOut(); if (result.error) throw result.error; }} />;
  if (!session && recovering) return <RecoveryPanel onBack={() => setRecovering(false)} />;
  if (session)
    return (
      <Workspace
        measures={measures}
        initialUnit={unit!.id}
        userName={userName}
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
            <p className="muted">Use seu nome de usuário e senha para acessar.</p>
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
            Nome de usuário
            <input
              name="login"
              type="text"
              maxLength={40}
              placeholder="Seu nome de login"
              autoComplete="username"
              required
              disabled={!auth || busy}
            />
          </label>
          <PasswordField id="password" name="password" label="Senha" autoComplete="current-password" disabled={!auth || busy} />
          <button type="button" disabled={busy || !auth} onClick={() => setRecovering(true)}>Esqueci minha senha</button>
          <button className="primary" disabled={!auth || busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
