import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { apiErrorMessage } from '../utils/assets';
import { formatDate, formatMoney } from '../utils/labels';
import { AdminInvoice, downloadInvoicePdf, listInvoices, payInvoice, runInvoices, voidInvoice } from './adminApi';
import { INVOICE_STATUS } from './adminLabels';

const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));
const defaultMonth = () => new Date().toISOString().slice(0, 7);

// Invoices of the operator to its customers: monthly run, payment booking, PDF.
export function AdminInvoicesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | undefined>();
  const [month, setMonth] = useState(defaultMonth());
  const [runResult, setRunResult] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'invoices', status], queryFn: () => listInvoices({ status }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const run = useMutation({
    mutationFn: () => runInvoices(month),
    onSuccess: (result) => {
      setRunResult(`${result.created.length} Rechnung(en) erstellt${result.created.length ? ` (${result.created.join(', ')})` : ''}, ${result.skipped} übersprungen (kein zahlender Kunde, schon abgerechnet oder Testphase).`);
      refresh();
    },
    onError,
  });
  const pay = useMutation({ mutationFn: (id: string) => payInvoice(id), onSuccess: refresh, onError });
  const cancel = useMutation({ mutationFn: voidInvoice, onSuccess: refresh, onError });
  const pdf = useMutation({ mutationFn: (invoice: AdminInvoice) => downloadInvoicePdf(invoice.id, invoice.number), onError });

  const open = (data ?? []).filter((invoice) => invoice.status === 'OPEN');
  const openSum = open.reduce((sum, invoice) => sum + Number(invoice.gross), 0);

  return (
    <div>
      <Typography.Title level={3}>Rechnungen an Kunden</Typography.Title>
      <Card size="small" title="Rechnungslauf" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Abrechnungsmonat" style={{ width: 170 }} />
          <Button type="primary" loading={run.isPending} onClick={() => run.mutate()} data-testid="invoice-run">Rechnungen erstellen</Button>
        </Space>
        {runResult && <Alert style={{ marginTop: 12 }} type="success" showIcon message={runResult} data-testid="invoice-run-result" />}
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Es werden alle aktiven Kunden mit Tarif abgerechnet, die für den Monat noch keine Rechnung haben. Mandanten in der Testphase werden erst danach berechnet.</Typography.Paragraph>
      </Card>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="Alle Status" value={status} onChange={setStatus} style={{ width: 160 }} options={Object.entries(INVOICE_STATUS).map(([value, entry]) => ({ value, label: entry.label }))} />
        {open.length > 0 && <Tag color="gold">Offen: {open.length} · {formatMoney(openSum)}</Tag>}
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Keine Rechnungen' }}
        columns={[
          { title: 'Nr.', dataIndex: 'number' },
          { title: 'Kunde', render: (_, invoice: AdminInvoice) => invoice.company?.name },
          { title: 'Zeitraum', responsive: ['md'], render: (_, invoice) => formatDate(invoice.periodStart) },
          { title: 'Brutto', align: 'right', render: (_, invoice) => formatMoney(invoice.gross) },
          { title: 'Fällig', render: (_, invoice) => <span style={{ color: invoice.overdue ? '#cf1322' : undefined }}>{formatDate(invoice.dueDate)}</span> },
          { title: 'Status', render: (_, invoice) => <Tag color={invoice.overdue ? 'red' : INVOICE_STATUS[invoice.status].color}>{invoice.overdue ? 'Überfällig' : INVOICE_STATUS[invoice.status].label}</Tag> },
          {
            title: '',
            render: (_, invoice) => (
              <Space>
                <Button size="small" onClick={() => pdf.mutate(invoice)}>PDF</Button>
                {invoice.status === 'OPEN' && <Button size="small" type="primary" onClick={() => pay.mutate(invoice.id)}>Bezahlt</Button>}
                {invoice.status === 'OPEN' && <Popconfirm title="Rechnung stornieren?" okText="Stornieren" cancelText="Abbrechen" onConfirm={() => cancel.mutate(invoice.id)}><Button size="small" danger>Storno</Button></Popconfirm>}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
