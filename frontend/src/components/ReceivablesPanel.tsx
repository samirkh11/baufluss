import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Checkbox, Space, Statistic, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { getReceivables } from '../api/payments';
import { Receivable } from '../types';
import { formatDate, formatMoney, documentPath } from '../utils/labels';
import { PaymentModal } from './PaymentModal';

const KIND_LABEL = { INVOICE: 'Rechnung', RETENTION: 'Einbehalt', REFUND: 'Erstattung' } as const;

// Open items (Offene Posten): what customers still owe (invoices, retentions) and what is owed
// back to them (refunds), oldest due date first. Payments are booked right from the list.
export function ReceivablesPanel() {
  const queryClient = useQueryClient();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [booking, setBooking] = useState<Receivable | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['receivables', overdueOnly],
    queryFn: () => getReceivables({ overdueOnly }),
  });

  return (
    <div>
      <Space wrap size="large" style={{ marginBottom: 16, display: 'flex' }}>
        <Statistic title="Offen gesamt" value={data ? formatMoney(data.totals.open) : '–'} />
        <Statistic
          title="davon überfällig"
          value={data ? formatMoney(data.totals.overdue) : '–'}
          valueStyle={{ color: data && Number(data.totals.overdue) > 0 ? '#cf1322' : undefined }}
        />
        <Statistic title="Sicherheitseinbehalte" value={data ? formatMoney(data.totals.retention) : '–'} />
        <Statistic title="Erstattungen offen" value={data ? formatMoney(data.totals.refunds) : '–'} />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Checkbox checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)}>
          Nur überfällige
        </Checkbox>
      </div>

      <Table
        rowKey={(row) => `${row.documentId}-${row.kind}`}
        loading={isLoading}
        dataSource={data?.items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Keine offenen Posten' }}
        columns={[
          {
            title: 'Beleg',
            render: (_, row: Receivable) => (
              <Link to={documentPath(row.documentType, row.documentId)}>{row.number ?? 'Entwurf'}</Link>
            ),
          },
          {
            title: 'Art',
            responsive: ['md'],
            render: (_, row) => (
              <Tag color={row.kind === 'REFUND' ? 'purple' : row.kind === 'RETENTION' ? 'cyan' : 'default'}>
                {KIND_LABEL[row.kind]}
              </Tag>
            ),
          },
          { title: 'Kunde', dataIndex: 'recipientName' },
          { title: 'Projekt', responsive: ['md'], render: (_, row) => `${row.project.number}` },
          { title: 'Fällig am', render: (_, row) => (row.dueDate ? formatDate(row.dueDate) : '') },
          {
            title: 'Überfällig',
            render: (_, row) => (row.overdueDays > 0 ? <Tag color="red">{row.overdueDays} Tage</Tag> : ''),
          },
          { title: 'Offen', align: 'right', render: (_, row) => <strong>{formatMoney(row.open)}</strong> },
          {
            title: '',
            render: (_, row) => (
              <Button size="small" onClick={() => setBooking(row)}>
                {row.kind === 'REFUND' ? 'Erstattung buchen' : 'Zahlung buchen'}
              </Button>
            ),
          },
        ]}
      />
      <Card size="small" style={{ marginTop: 16 }}>
        <small>
          Einbehalte werden erst zum Fälligkeitsdatum der Gewährleistung fällig. Erstattungen entstehen, wenn
          eine bereits bezahlte Rechnung storniert wurde.
        </small>
      </Card>

      <PaymentModal
        open={!!booking}
        documentId={booking?.documentId ?? ''}
        title={
          booking ? `${booking.kind === 'REFUND' ? 'Erstattung' : 'Zahlung'} zu ${booking.number ?? ''}` : ''
        }
        target={booking?.kind === 'RETENTION' ? 'RETENTION' : 'INVOICE'}
        defaultAmount={booking ? Math.abs(Number(booking.open)) : undefined}
        defaultReference={booking?.number ?? undefined}
        refund={booking?.kind === 'REFUND'}
        onClose={() => setBooking(null)}
        onSaved={() => {
          setBooking(null);
          queryClient.invalidateQueries({ queryKey: ['receivables'] });
          queryClient.invalidateQueries({ queryKey: ['documents'] });
        }}
      />
    </div>
  );
}
