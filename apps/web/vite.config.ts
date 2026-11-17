import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: { 'import.meta.env.VITE_APP_AREA': JSON.stringify(mode === 'configurador' ? 'configurador' : 'erp') },
  build: { outDir: mode === 'configurador' ? 'dist-configurador' : 'dist' },
  plugins: [{ name: 'identificar-area', transformIndexHtml(html) {
    return html.replace('<title>Restaurantes Populares de Joinville</title>', `<title>${mode === 'configurador' ? 'Configurador — ' : ''}Restaurantes Populares de Joinville</title><meta name="robots" content="noindex, nofollow" />`);
  } }],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
}));
