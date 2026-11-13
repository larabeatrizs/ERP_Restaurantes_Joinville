import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { downloadReport } from '../services/stock-reports.ts';
import type { ConsultationReport } from '../services/stock-reports.ts';

export function ReportPreview({ report, onClose }: { report: ConsultationReport; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => element.close();
  }, []);
  return createPortal(<div className="report-layer"><dialog ref={dialog} className="report-preview" aria-labelledby="report-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="actions report-actions"><button autoFocus onClick={onClose}>Fechar relatório</button><button onClick={() => downloadReport(report)}>Exportar relatório em CSV</button><button className="primary" onClick={() => window.print()}>Imprimir / salvar PDF</button></div>
    <h2 id="report-title">Relatório de {report.title.toLocaleLowerCase('pt-BR')}</h2>
    <p><strong>Unidade: {report.unit}</strong></p><p className="hint">Gerado em {report.generatedAt} (America/Sao_Paulo)</p><p>{report.scope}</p>
    <p className="hint">{report.rows.length} linhas. Ajuste orientação/escala nas opções de impressão para tabelas largas.</p>
    <div className="table-wrap" tabIndex={0} aria-label="Dados do relatório"><table><thead><tr>{report.headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{report.rows.map((row, index) => <tr key={index}>{row.map((cell, col) => <td key={col}>{cell}</td>)}</tr>)}</tbody></table></div>
    {!report.rows.length && <p>Nenhum registro corresponde à consulta.</p>}
  </dialog></div>, document.body);
}
