export function csvDocument(rows: string[][], numericColumns: readonly number[] = []): string {
  const cell = (value: string, index: number) => {
    const numeric = numericColumns.includes(index) && /^-?\d+(?:\.\d+)?$/.test(value);
    const formula = /^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value);
    return '"' + (!numeric && formula ? "'" + value : value).replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
