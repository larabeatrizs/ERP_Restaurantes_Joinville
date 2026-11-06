import { getLiveness } from '../services/health-service.ts';

export function healthController(request: Request): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(getLiveness()), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
