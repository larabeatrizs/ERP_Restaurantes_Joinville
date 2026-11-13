export function csvDocument(rows: string[][]): string {
  const cell = (value: string) => '"' + (/^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
