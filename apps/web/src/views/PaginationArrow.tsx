export function PaginationArrow({ direction, disabled, onClick }: { direction: 'previous' | 'next'; disabled?: boolean; onClick: () => void }) {
  const previous = direction === 'previous';
  return <button type="button" className="pagination-arrow" disabled={disabled} onClick={onClick} aria-label={previous ? 'Anterior' : 'Próxima'} title={previous ? 'Página anterior' : 'Próxima página'}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={previous ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} /></svg>
  </button>;
}
