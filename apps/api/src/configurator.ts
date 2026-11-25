import api from './index.ts';
import type { StagingEnv } from './staging.ts';
import { missingRoute, publication } from './publication.ts';

export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const isApi = path === '/api' || path.startsWith('/api/');
    const allowed = path === '/api/auth/login' || path === '/api/me' || path === '/api/admin/perdas' || path === '/api/admin/usuarios' || /^\/api\/admin\/usuarios\/[a-f0-9-]{36}(?:\/(?:primeiro-acesso|situacao))?$/i.test(path);
    // A origem administrativa não disponibiliza rotas operacionais.
    return publication(isApi ? allowed ? await api.fetch(request, env) : missingRoute(request) : await env.ASSETS.fetch(request));
  },
};
