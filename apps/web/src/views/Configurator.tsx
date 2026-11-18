import { Skeleton } from './Skeleton.tsx';
import { useEffect, useState } from 'react';
import { SettingsApi } from '../services/api.ts';
import { UsersPanel } from './UsersPanel.tsx';

export function Configurator({ api, onSignOut }: { api: SettingsApi; onSignOut: () => Promise<void> }) {
  const [identity, setIdentity] = useState<{ nome: string; administracao?: boolean }>();
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setIdentity(undefined); setError('');
    void api.identity().then(value => { if (active) setIdentity(value); })
      .catch(() => { if (active) setError('Não foi possível consultar seu acesso. Tente novamente ou entre com outra conta.'); });
    return () => { active = false; };
  }, [api, retry]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const allowed = identity?.administracao === true;
  return <div className="shell">
    <a className="skip" href="#conteudo">Ir para o conteúdo</a>
    <aside className="side"><div className="brand">Configurador</div><p className="unit-caption"><strong>{identity?.nome || 'Conta conectada'}</strong><br />Administração de acessos</p>
      {allowed && <nav aria-label="Administração"><a href="#conteudo" aria-current="page">Usuários</a></nav>}
      <button className="signout" disabled={busy} onClick={() => { if (!dirty || window.confirm('Descartar as alterações ainda não salvas?')) void onSignOut().catch(() => setError('Não foi possível sair. Tente novamente.')); }}>Sair</button>
    </aside>
    <main id="conteudo" tabIndex={-1} className="main stock-main">
      <header><p className="eyebrow">CONFIGURADOR</p><h1>{allowed ? 'Usuários' : identity ? 'Acesso restrito' : 'Verificando acesso'}</h1></header>
      {error && <p role="alert" className="notice error">{error}</p>}
      {!identity && !error && <Skeleton label="Consultando suas permissões…" />}
      {error && !identity && <button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
      {identity && !allowed && <p role="alert">Sua conta não tem permissão para acessar o Configurador. Use o ERP para as rotinas da sua unidade.</p>}
      {allowed && <UsersPanel api={api} unit="" onDirty={setDirty} onBusy={setBusy} />}
    </main>
  </div>;
}
