// Cabeçalhos aplicados também ao HTML e assets: noindex não é autorização.
export function publication(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export function missingRoute(request: Request): Response {
  const response = Response.json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
