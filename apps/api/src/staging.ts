import api from './index.ts';
import type { RuntimeEnv } from './repositories/settings-repository.ts';
import { missingRoute, publication } from './publication.ts';

export interface StagingEnv extends RuntimeEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// A publicação reúne View e API na mesma origem; regras e autorização ficam na API.
export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    // Não deixar uma segunda entrada administrativa contornar o Configurador.
    if (path === '/api/admin' || path.startsWith('/api/admin/')) return publication(missingRoute(request));
    const response = path === '/api' || path.startsWith('/api/')
      ? await api.fetch(request, env)
      : await env.ASSETS.fetch(request);
    return publication(response);
  },
};
