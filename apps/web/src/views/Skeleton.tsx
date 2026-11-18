/** Placeholder visual: anuncia o carregamento sem simular valores ou controles. */
export function Skeleton({ label = 'Carregando…', rows = 4, variant = 'lines' }: { label?: string; rows?: number; variant?: 'lines' | 'metrics' }) {
  return <div className={`loading-skeleton${variant === 'metrics' ? ' loading-metrics' : ''}`} role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    {variant === 'metrics' ? <div aria-hidden="true" className="home-metrics skeleton-metrics">{[0, 1, 2].map(index => <div className="card" key={index}><span className="skeleton-line skeleton-line-1" /><span className="skeleton-line skeleton-number" /><span className="skeleton-line skeleton-line-0" /></div>)}</div> : <div aria-hidden="true" className="skeleton-lines">{Array.from({ length: rows }, (_, index) => <span key={index} className={`skeleton-line skeleton-line-${index % 3}`} />)}</div>}
  </div>;
}
