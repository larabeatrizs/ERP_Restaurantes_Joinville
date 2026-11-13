import { healthController } from './controllers/health-controller.ts';
import { identityController, settingsController, unitsController } from './controllers/settings-controller.ts';
import { createSupabaseSession } from './repositories/supabase-settings.ts';
import type { RuntimeEnv, SessionFactory } from './repositories/settings-repository.ts';
import { ApiError } from './errors.ts';
import { stockController } from './controllers/stock-controller.ts';
import { createSupabaseStockSession } from './repositories/supabase-stock.ts';
import type { StockSessionFactory } from './repositories/stock-repository.ts';
import { categoryController } from './controllers/category-controller.ts';
import { createSupabaseCategorySession } from './repositories/supabase-categories.ts';
import type { CategorySessionFactory } from './repositories/category-repository.ts';
import { loginController } from './controllers/login-controller.ts';
import { createLoginRepository } from './repositories/supabase-login.ts';
import type { LoginFactory } from './repositories/login-repository.ts';

export function createApp(factory: SessionFactory = createSupabaseSession, stockFactory: StockSessionFactory = createSupabaseStockSession, categoryFactory: CategorySessionFactory = createSupabaseCategorySession, loginFactory: LoginFactory = createLoginRepository) {
  return {
    async fetch(request: Request, env: RuntimeEnv = {}): Promise<Response> {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/api/auth/login') {
          if (request.method !== 'POST') return methodNotAllowed('POST', request.method === 'HEAD');
          return await loginController(request, env, loginFactory);
        }
        if (path === '/api/me') {
          if (request.method !== 'GET') return methodNotAllowed('GET', request.method === 'HEAD');
          return await identityController(request, env, factory);
        }
        const category = /^\/api\/unidades\/([^/]+)\/categorias(?:\/(exportar|[^/]+(?:\/status)?))?$/.exec(path);
        if (category?.[1]) return await categoryController(request, env, category[1], category[2] ?? '', categoryFactory);
        if (path === '/api/unidades') {
          if (request.method !== 'GET') return methodNotAllowed('GET', request.method === 'HEAD');
          return await unitsController(request, env, factory);
        }
        if (path === '/api/health') {
          if (request.method === 'GET' || request.method === 'HEAD') return healthController(request);
          return methodNotAllowed('GET, HEAD', request.method === 'HEAD');
        }
        const stock = /^\/api\/unidades\/([^/]+)\/(estoque\/(?:contexto|saldos)|produtos(?:\/[^/]+(?:\/vinculo)?)?|entradas(?:\/[^/]+\/(?:confirmar|aprovar-divergencia))?)$/.exec(path);
        if (stock?.[1] && stock[2]) return await stockController(request, env, stock[1], stock[2], stockFactory);
        const match = /^\/api\/unidades\/([^/]+)\/configuracoes$/.exec(path);
        if (match?.[1]) {
          if (request.method !== 'GET' && request.method !== 'PATCH') return methodNotAllowed('GET, PATCH', request.method === 'HEAD');
          return await settingsController(request, env, match[1], factory);
        }
        throw new ApiError(404, 'NOT_FOUND', 'Rota não encontrada.');
      } catch (error) {
        const problem = error instanceof ApiError ? error : new ApiError(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.');
        const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
        if (problem.status === 401) headers['WWW-Authenticate'] = 'Bearer';
        const response = Response.json({ error: { code: problem.code, message: problem.message, ...(problem.fields ? { fields: problem.fields } : {}) } }, { status: problem.status, headers });
        return request.method === 'HEAD' ? new Response(null, response) : response;
      }
    },
  };
}
function methodNotAllowed(allow: string, head = false): Response {
  const response = Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, {
    status: 405, headers: { Allow: allow, 'Cache-Control': 'no-store' },
  });
  return head ? new Response(null, response) : response;
}
export default createApp();
