import api from './index.ts';
import type { RuntimeEnv } from './repositories/settings-repository.ts';

export interface StagingEnv extends RuntimeEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// A publicação reúne View e API na mesma origem; regras e autorização ficam na API.
export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const response = path === '/api' || path.startsWith('/api/')
      ? await api.fetch(request, env)
      : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status, statusText: response.statusText, headers,
    });
  },
};
