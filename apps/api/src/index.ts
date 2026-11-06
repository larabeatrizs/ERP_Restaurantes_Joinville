import type { ErrorResponse } from '@erp/contracts';
import { healthController } from './controllers/health-controller.ts';

function errorResponse(status: number, code: ErrorResponse['error']['code'], message: string): Response {
  return Response.json({ error: { code, message } } satisfies ErrorResponse, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export default {
  fetch(request: Request): Response {
    if (new URL(request.url).pathname !== '/api/health') {
      const response = errorResponse(404, 'NOT_FOUND', 'Rota não encontrada.');
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    }
    return healthController(request);
  },
};
