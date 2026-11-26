import { healthController } from './controllers/health-controller.ts';
import { identityController, settingsController, unitsController } from './controllers/settings-controller.ts';
import { createSupabaseSession } from './repositories/supabase-settings.ts';
import type { RuntimeEnv, SessionFactory } from './repositories/settings-repository.ts';
import { ApiError } from './errors.ts';
import { isLossConfigurationChange } from '@erp/contracts';
import { readJson } from './controllers/read-json.ts';
import { stockController } from './controllers/stock-controller.ts';
import { createSupabaseStockSession } from './repositories/supabase-stock.ts';
import type { StockSessionFactory } from './repositories/stock-repository.ts';
import { categoryController } from './controllers/category-controller.ts';
import { createSupabaseCategorySession } from './repositories/supabase-categories.ts';
import type { CategorySessionFactory } from './repositories/category-repository.ts';
import { loginController } from './controllers/login-controller.ts';
import { createLoginRepository } from './repositories/supabase-login.ts';
import type { LoginFactory } from './repositories/login-repository.ts';
import { measureController } from './controllers/measure-controller.ts';
import { createSupabaseMeasureSession } from './repositories/supabase-measures.ts';
import type { MeasureSessionFactory } from './repositories/measure-repository.ts';
import { supplierController } from './controllers/supplier-controller.ts';
import { createSupabaseSupplierSession } from './repositories/supabase-suppliers.ts';
import type { SupplierSessionFactory } from './repositories/supplier-repository.ts';
import { calendarController } from './controllers/calendar-controller.ts';
import { createCalendarSession } from './repositories/supabase-calendar.ts';
import type { CalendarSessionFactory } from './repositories/calendar-repository.ts';
import { withdrawalController } from './controllers/withdrawal-controller.ts';
import { createWithdrawalSession } from './repositories/supabase-withdrawals.ts';
import type { WithdrawalFactory } from './repositories/withdrawal-repository.ts';

export function createApp(factory: SessionFactory = createSupabaseSession, stockFactory: StockSessionFactory = createSupabaseStockSession, categoryFactory: CategorySessionFactory = createSupabaseCategorySession, loginFactory: LoginFactory = createLoginRepository, measureFactory: MeasureSessionFactory = createSupabaseMeasureSession, supplierFactory: SupplierSessionFactory = createSupabaseSupplierSession, calendarFactory: CalendarSessionFactory = createCalendarSession, withdrawalFactory: WithdrawalFactory = createWithdrawalSession) {
  return {
    async fetch(request: Request, env: RuntimeEnv = {}): Promise<Response> {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/api/admin/perdas') {
          if (request.method !== 'GET' && request.method !== 'PATCH') return methodNotAllowed('GET, PATCH', request.method === 'HEAD');
          const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
          if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Entre novamente.');
          const session = stockFactory(env, token);
          await session.authenticate();
          if (new URL(request.url).search) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
          const configuration = session.repository.lossConfiguration;
          if (!configuration) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Configuração de perdas indisponível.');
          const input = request.method === 'PATCH' ? await readJson(request) : undefined;
          if (request.method === 'PATCH' && !isLossConfigurationChange(input)) throw new ApiError(422, 'INVALID_STOCK_INPUT', 'Revise os campos informados.');
          const result = await configuration(isLossConfigurationChange(input) ? input : undefined);
          return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
        }
        const withdrawal = /^\/api\/unidades\/([^/]+)\/requisicoes(?:\/([^/]+)\/conferencia)?$/.exec(path);
        if(withdrawal?.[1])return await withdrawalController(request,env,withdrawal[1],withdrawal[2],withdrawalFactory);
        if (path === '/api/admin/usuarios' || /^\/api\/admin\/usuarios\/[a-f0-9-]{36}(?:\/(?:primeiro-acesso|situacao))?$/i.test(path)) {
          const allowed = path === '/api/admin/usuarios' ? ['GET','POST'] : path.endsWith('/primeiro-acesso') ? ['POST'] : ['GET','PATCH'];
          if (!allowed.includes(request.method)) return methodNotAllowed(allowed.join(', '), request.method === 'HEAD');
          if (!request.headers.get('Authorization')?.startsWith('Bearer ')) throw new ApiError(401, 'UNAUTHORIZED', 'Entre novamente.');
          if (!env.IDENTITY_SERVICE) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Administração temporariamente indisponível.');
          const url = new URL(request.url); url.protocol = 'https:'; url.host = 'identity.internal'; url.pathname = path.slice(4);
          return await env.IDENTITY_SERVICE.fetch(new Request(url, request));
        }
        const calendar = /^\/api\/unidades\/([^/]+)\/calendario(?:\/(funcionamento))?$/.exec(path);
        if (calendar?.[1]) return await calendarController(request, env, calendar[1], !!calendar[2], calendarFactory);
        const supplier = /^\/api\/unidades\/([^/]+)\/fornecedores(?:\/(exportar|[^/]+(?:\/status)?))?$/.exec(path);
        if (supplier?.[1]) return await supplierController(request, env, supplier[1], supplier[2] ?? '', supplierFactory);
        const measure = /^\/api\/unidades\/([^/]+)\/medidas(?:\/(exportar|[^/]+(?:\/status)?))?$/.exec(path);
        if (measure?.[1]) return await measureController(request, env, measure[1], measure[2] ?? '', measureFactory);
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
        const stock = /^\/api\/unidades\/([^/]+)\/(estoque\/(?:contexto|saldos|extrato|vencimentos|alertas|relatorio-perdas|perdas(?:\/(?:registro|lote|[^/]+\/(?:revisao|anexo)))?)|cardapios\/rascunho|produtos-importados(?:\/[^/]+\/concluir)?|produtos(?:\/[^/]+(?:\/(?:vinculo|status))?)?|entradas(?:\/[^/]+\/(?:confirmar|aprovar-divergencia))?)$/.exec(path);
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
