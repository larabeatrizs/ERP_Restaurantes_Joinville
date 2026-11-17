import { createClient } from '@supabase/supabase-js';
import { hasExactFields, isAdminUserDetail, isAdminUserSituation, isRecord, normalizeLogin, validPassword, validateAdminUserEdit, validateAdminUserSave, validateAdminUserSituation } from '@erp/contracts';

export interface IdentityEnv {
  SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; SUPABASE_ADMIN_KEY: string;
  AUTH_LOGIN_DIRECTORY: string; MANUAL_INVITES_ENABLED?: string;
  SYNTHETIC_ADMIN_ID?: string;
}
class Problem extends Error { status: number; constructor(status: number) { super('Solicitação indisponível.'); this.status = status; } }
const origin = 'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev';
export function createIdentityApp(fetcher: typeof fetch = fetch) {
  return { async fetch(request: Request, env: IdentityEnv): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer' };
    try {
      if (env.SUPABASE_URL !== 'https://vpowsedoajpdbeckimuv.supabase.co' || !env.SUPABASE_ADMIN_KEY || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Problem(503);
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetcher(input, { ...init, signal: AbortSignal.timeout(15000) }) } };
      const privileged = createClient(env.SUPABASE_URL, env.SUPABASE_ADMIN_KEY, options);
      const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
      async function rpc(actor: string | null, action: string, data: object = {}): Promise<unknown> {
        const result = await privileged.schema('erp').rpc('admin_usuarios_servico', { p_ator: actor, p_acao: action, p_dados: data });
        if (result.error) throw new Problem(({ PT403: 403, PT409: 409, PT422: 422, PT412: 412 } as Record<string, number>)[result.error.code] ?? 503);
        return result.data;
      }
      async function body(): Promise<unknown> {
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Problem(422);
        if (!request.body) throw new Problem(422);
        const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 32768) { await reader.cancel(); throw new Problem(413); } chunks.push(chunk.value); }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        try { return JSON.parse(text); } catch { throw new Problem(422); }
      }
      const url = new URL(request.url);
      if (url.pathname === '/login' && request.method === 'POST') {
        const value = await body();
        if (!isRecord(value) || !hasExactFields(value, ['login', 'password']) || typeof value.login !== 'string' || typeof value.password !== 'string' || !normalizeLogin(value.login) || value.password.length < 1 || value.password.length > 1024) throw new Problem(422);
        const login = normalizeLogin(value.login)!;
        const resolved = await rpc(null, 'resolver', { login });
        const directory: unknown = JSON.parse(env.AUTH_LOGIN_DIRECTORY);
        const legacyEmail = isRecord(directory) && Object.hasOwn(directory, login) && typeof directory[login] === 'string' ? directory[login] : null;
        const email = isRecord(resolved) && typeof resolved.email === 'string' ? resolved.email : legacyEmail;
        const { data, error } = await publicClient.auth.signInWithPassword({ email: email ?? 'username-unavailable@example.invalid', password: value.password });
        if (error?.status === 429) throw new Problem(429);
        if (error || !data.session || !data.user || !email) throw new Problem(401);
        if (isRecord(resolved) && resolved.primeiro_acesso === true && !validPassword(value.password)) throw new Problem(401);
        try { await rpc(null, 'validar_login', { usuario_id: data.user.id, login, email }); } catch { throw new Problem(401); }
        return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers });
      }
      const reissue = /^\/admin\/usuarios\/([a-f0-9-]{36})\/primeiro-acesso$/i.exec(url.pathname);
      const edit = /^\/admin\/usuarios\/([a-f0-9-]{36})$/i.exec(url.pathname);
      const situation = /^\/admin\/usuarios\/([a-f0-9-]{36})\/situacao$/i.exec(url.pathname);
      if ((!reissue && !edit && !situation && url.pathname !== '/admin/usuarios') || (edit || situation ? !['GET','PATCH'].includes(request.method) : reissue ? request.method !== 'POST' : !['GET', 'POST'].includes(request.method))) throw new Problem(404);
      const authorization = request.headers.get('Authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Problem(401);
      const { data: authenticated, error: authError } = await publicClient.auth.getUser(authorization.slice(7));
      if (authError?.status && authError.status >= 500) throw new Problem(503);
      if (authError || !authenticated.user || authenticated.user.is_anonymous || authenticated.user.aud !== 'authenticated') throw new Problem(401);
      const actor = authenticated.user.id;
      if(situation?.[1]){
        let input:object|null=null;if(request.method==='PATCH'){const validated=validateAdminUserSituation(await body());if(!validated.ok)throw new Problem(422);input=validated.value;}
        const result=await privileged.schema('erp').rpc('admin_usuario_situacao',{p_ator:actor,p_alvo:situation[1],p_dados:input});
        if(result.error)throw new Problem(({PT403:403,PT404:404,PT409:409,PT412:412,PT422:422}as Record<string,number>)[result.error.code]??503);
        if(!isAdminUserSituation(result.data)||result.data.id!==situation[1])throw new Problem(503);return Response.json(result.data,{headers});
      }
      if(edit?.[1]){
        let input:object|null=null;
        if(request.method==='PATCH'){const validated=validateAdminUserEdit(await body());if(!validated.ok)throw new Problem(422);input=validated.value;}
        const result=await privileged.schema('erp').rpc('admin_usuario_edicao',{p_ator:actor,p_alvo:edit[1],p_dados:input});
        if(result.error)throw new Problem(({PT403:403,PT404:404,PT409:409,PT412:412,PT422:422}as Record<string,number>)[result.error.code]??503);
        if(!isAdminUserDetail(result.data)||result.data.id!==edit[1])throw new Problem(503);
        return Response.json(result.data,{headers});
      }
      if (request.method === 'POST') { const allowed = await rpc(actor, 'autorizar'); if (!isRecord(allowed) || allowed.permitido !== true) throw new Problem(403); }
      const syntheticOnly = env.MANUAL_INVITES_ENABLED !== 'true' && env.SYNTHETIC_ADMIN_ID === actor;
      const manualAllowed = env.MANUAL_INVITES_ENABLED === 'true' || syntheticOnly;
      if (reissue?.[1]) {
        if (!manualAllowed) throw new Problem(503);
        const eligible = await rpc(actor, 'reemitir_dados', { usuario_id: reissue[1] });
        if (!isRecord(eligible) || typeof eligible.email !== 'string') throw new Problem(503);
        if (syntheticOnly && !/^adm003-[^@]+@example\.invalid$/.test(eligible.email)) throw new Problem(403);
        const link = await privileged.auth.admin.generateLink({ type: 'recovery', email: eligible.email, options: { redirectTo: origin } });
        if (link.error || link.data.user?.id !== reissue[1] || !/^[A-Za-z0-9_-]{20,512}$/.test(link.data.properties?.hashed_token ?? '')) throw new Problem(503);
        await rpc(actor, 'reemitir_registrar', { usuario_id: reissue[1] });
        return Response.json({ criado: false, acesso: `${origin}/#definir-senha=${encodeURIComponent(link.data.properties.hashed_token)}` }, { headers });
      }
      if (request.method === 'GET') {
        const offset = Number(url.searchParams.get('offset') ?? '0');
        if (!Number.isInteger(offset) || offset < 0 || offset > 2147483647) throw new Problem(422);
        const snapshot = await rpc(actor, 'listar', { q: url.searchParams.get('q') ?? '', offset });
        if (!isRecord(snapshot)) throw new Problem(503);
        const directory: unknown = JSON.parse(env.AUTH_LOGIN_DIRECTORY);
        const ownLogin = isRecord(directory) ? Object.entries(directory).find(([, email]) => email === authenticated.user.email)?.[0] : undefined;
        const users = Array.isArray(snapshot.usuarios) ? snapshot.usuarios.map(u => isRecord(u) && u.id === actor && u.login === null && ownLogin ? { ...u, login: ownLogin } : u) : snapshot.usuarios;
        return Response.json({ ...snapshot, usuarios: users, pode_criar: snapshot.pode_criar === true && manualAllowed }, { headers });
      }
      if (!manualAllowed) throw new Problem(503);
      const validated = validateAdminUserSave(await body());
      if (!validated.ok || validated.value.revisao !== null || validated.value.status !== 'ATIVO') throw new Problem(422);
      const input = validated.value;
      if (syntheticOnly && !/^adm003-[^@]+@example\.invalid$/.test(input.email)) throw new Problem(403);
      const operation = await rpc(actor, 'preparar', input);
      if (!isRecord(operation) || typeof operation.operacao !== 'string') throw new Problem(503);
      if (operation.estado === 'CONCLUIDO') return Response.json({ criado: false, acesso: null }, { headers });
      let authId = typeof operation.auth_id === 'string' ? operation.auth_id : null;
      if (!authId) {
        const created = await privileged.auth.admin.createUser({ email: input.email, email_confirm: false });
        if (created.error || !created.data.user || created.data.user.email !== input.email) throw new Problem(created.error?.status && created.error.status < 500 ? 409 : 503);
        authId = created.data.user.id;
        await rpc(actor, 'auth_criada', { operacao: operation.operacao, auth_id: authId });
      }
      const link = await privileged.auth.admin.generateLink({ type: 'recovery', email: input.email, options: { redirectTo: origin } });
      if (link.error || link.data.user?.id !== authId || !link.data.properties?.hashed_token || !/^[A-Za-z0-9_-]{20,512}$/.test(link.data.properties.hashed_token)) throw new Problem(503);
      const result = await rpc(actor, 'concluir', { operacao: operation.operacao });
      if (!isRecord(result) || result.criado !== true) return Response.json({ criado: false, acesso: null }, { headers });
      // Fragment is consumed by the recipient browser; no email send, token logging or storage.
      return Response.json({ criado: true, acesso: `${origin}/#definir-senha=${encodeURIComponent(link.data.properties.hashed_token)}` }, { status: 201, headers });
    } catch (error) {
      const status = error instanceof Problem ? error.status : 503;
      const messages: Record<number, string> = { 401: 'Não foi possível entrar. Verifique seus dados ou procure a administração.', 403: 'Você não tem permissão para esta ação.', 409: 'Login ou email já cadastrado, ou operação em andamento. Revise os dados e tente novamente.', 422: 'Revise os dados informados.' };
      return Response.json({ error: { code: 'IDENTITY_REQUEST_FAILED', message: messages[status] ?? 'Não foi possível concluir. Tente novamente.' } }, { status, headers });
    }
  } };
}
export default createIdentityApp();
