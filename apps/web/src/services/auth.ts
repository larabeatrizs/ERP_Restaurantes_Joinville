import { createClient } from '@supabase/supabase-js';
const url: unknown = import.meta.env.VITE_SUPABASE_URL;
const key: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === '/'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}
const endpoint = publicUrl(url);
// O fragmento não é enviado ao servidor; removê-lo antes de renderizar a tela.
const link = new URLSearchParams(window.location.hash.slice(1));
export const initialPasswordToken = link.get('definir-senha');
export const initialPasswordError = link.has('error') || link.has('error_code');
export function passwordPending(): boolean {
  try { return sessionStorage.getItem('erp-password-pending') === '1'; } catch { return false; }
}
export function markPasswordPending(pending: boolean): void {
  try {
    if (pending) sessionStorage.setItem('erp-password-pending', '1');
    else sessionStorage.removeItem('erp-password-pending');
  } catch { /* Navegadores sem armazenamento ainda podem concluir nesta página. */ }
}
if (initialPasswordToken !== null || initialPasswordError) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  markPasswordPending(true);
}
// O SDK consome o fragmento padrão de convite/recovery. Não remover seus tokens antes disso.
if (['invite', 'recovery'].includes(link.get('type') ?? '')) markPasswordPending(true);
export const auth =
  endpoint && typeof key === 'string' && key.startsWith('sb_publishable_')
    ? createClient(endpoint, key).auth
    : null;

let activation: Promise<boolean> | undefined;
export function activatePasswordLink(): Promise<boolean> {
  // Reutilizar a promessa evita consumir o mesmo link duas vezes no ciclo da View.
  return activation ??= (async () => {
    if (!auth || !initialPasswordToken || !/^[a-zA-Z0-9_-]{20,512}$/.test(initialPasswordToken)) return false;
    try {
      const { data, error } = await auth.verifyOtp({ token_hash: initialPasswordToken, type: 'recovery' });
      return !error && !!data.session;
    } catch { return false; }
  })();
}
