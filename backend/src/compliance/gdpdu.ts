// Index file for the GoBD "Datenträgerüberlassung" (Z3 access): index.xml in the format of the
// Beschreibungsstandard (gdpdu-01-09-2002) that audit software (e.g. IDEA) reads to import the CSV tables.

export interface GdpduColumn {
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date';
}
export interface GdpduTable {
  file: string;
  name: string;
  description: string;
  columns: GdpduColumn[];
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function gdpduIndex(meta: { company: string; location: string; comment: string }, tables: GdpduTable[]): string {
  const column = (col: GdpduColumn) =>
    `        <VariableColumn>\n          <Name>${escapeXml(col.name)}</Name>\n` +
    (col.description ? `          <Description>${escapeXml(col.description)}</Description>\n` : '') +
    (col.type === 'number' ? '          <Numeric>\n            <Accuracy>2</Accuracy>\n          </Numeric>\n'
      : col.type === 'date' ? '          <Date>\n            <Format>DD.MM.YYYY</Format>\n          </Date>\n'
      : '          <AlphaNumeric/>\n') +
    '        </VariableColumn>\n';
  const table = (entry: GdpduTable) =>
    '    <Table>\n' +
    `      <URL>${escapeXml(entry.file)}</URL>\n      <Name>${escapeXml(entry.name)}</Name>\n      <Description>${escapeXml(entry.description)}</Description>\n` +
    '      <UTF8/>\n      <DecimalSymbol>,</DecimalSymbol>\n      <DigitGroupingSymbol>.</DigitGroupingSymbol>\n' +
    '      <Range>\n        <From>2</From>\n      </Range>\n' + // line 1 holds the column names
    '      <VariableLength>\n        <ColumnDelimiter>;</ColumnDelimiter>\n        <RecordDelimiter>&#13;&#10;</RecordDelimiter>\n        <TextEncapsulator>"</TextEncapsulator>\n' +
    entry.columns.map(column).join('') +
    '      </VariableLength>\n    </Table>\n';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2002.dtd">\n<DataSet>\n  <Version>1.0</Version>\n' +
    `  <DataSupplier>\n    <Name>${escapeXml(meta.company)}</Name>\n    <Location>${escapeXml(meta.location)}</Location>\n    <Comment>${escapeXml(meta.comment)}</Comment>\n  </DataSupplier>\n` +
    '  <Media>\n    <Name>Meisterwerk Export</Name>\n' +
    tables.map(table).join('') +
    '  </Media>\n</DataSet>\n'
  );
}
