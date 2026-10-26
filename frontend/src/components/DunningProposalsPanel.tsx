import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Space, Statistic, Table, Tag } from 'antd';
import { StatusTag } from './StatusTag';
import { Link } from 'react-router-dom';
import { getDunningProposals } from '../api/dunning';
import { DunningProposal } from '../types';
import { DUNNING_LEVEL, formatDate, formatMoney } from '../utils/labels';
import { DunningModal } from './DunningModal';

// Dunning proposals ("Mahnvorschlag"): overdue invoices whose next letter is due, oldest first.
export function DunningProposalsPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DunningProposal | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['dunning', 'proposals'], queryFn: getDunningProposals });

  return (
    <div>
      <Space wrap size="large" style={{ marginBottom: 16, display: 'flex' }}>
        <Statistic title="Rechnungen zu mahnen" value={data?.totals.count ?? 0} />
        <Statistic title="Offener Betrag" value={data ? formatMoney(data.totals.open) : '–'} />
      </Space>
      <Table
        rowKey="documentId"
        loading={isLoading}
        dataSource={data?.items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Keine Mahnung fällig' }}
        columns={[
          { title: 'Rechnung', render: (_, row: DunningProposal) => <Link to={`/invoices/${row.documentId}`}>{row.number}</Link> },
          { title: 'Kunde', dataIndex: 'recipientName' },
          { title: 'Fällig seit', responsive: ['md'], render: (_, row) => formatDate(row.dueDate) },
          { title: 'Überfällig', render: (_, row) => <Tag color="red">{row.overdueDays} Tage</Tag> },
          { title: 'Bisher', responsive: ['md'], render: (_, row) => (row.lastLevel ? DUNNING_LEVEL[row.lastLevel].label : '–') },
          { title: 'Nächster Schritt', render: (_, row) => (row.suggestedLevel ? <StatusTag tone={DUNNING_LEVEL[row.suggestedLevel].tone}>{DUNNING_LEVEL[row.suggestedLevel].label}</StatusTag> : <Tag>Inkasso/Anwalt</Tag>) },
          { title: 'Gesamtforderung', align: 'right', render: (_, row) => (row.amounts ? <strong>{formatMoney(row.amounts.total)}</strong> : formatMoney(row.open)) },
          {
            title: '',
            render: (_, row) =>
              row.suggestedLevel ? (
                <Button size="small" type="primary" onClick={() => setSelected(row)}>
                  Mahnung erstellen
                </Button>
              ) : null,
          },
        ]}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="Mahnstufen und Fristen stellst du im Firmenprofil unter „Mahnwesen“ ein. Nach der letzten Mahnung sind weitere Schritte (Inkasso, Rechtsanwalt) nötig, die hier nicht abgebildet sind."
      />
      <DunningModal
        open={!!selected}
        documentId={selected?.documentId ?? ''}
        invoiceNumber={selected?.number}
        onClose={() => setSelected(null)}
        onCreated={() => {
          setSelected(null);
          queryClient.invalidateQueries({ queryKey: ['dunning'] });
          queryClient.invalidateQueries({ queryKey: ['receivables'] });
        }}
      />
    </div>
  );
}
