import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { createIncomingInvoice, listIncomingInvoices, uploadIncomingInvoice } from '../api/incomingInvoices';
import { IncomingInvoiceModal } from '../components/IncomingInvoiceModal';
import { IncomingInvoice, IncomingInvoiceStatus } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { formatDate, formatMoney, INCOMING_STATUS, optionsOf } from '../utils/labels';

// Incoming invoices (Eingangsrechnungen): upload the supplier's original, capture the data,
// assign a project, approve, and mark as paid.
export function IncomingInvoicesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IncomingInvoiceStatus | undefined>();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['incoming', 'list', status, q],
    queryFn: () => listIncomingInvoices({ status, q: q || undefined }),
  });

  const opened = (invoice: IncomingInvoice) => {
    queryClient.invalidateQueries({ queryKey: ['incoming'] });
    setOpenId(invoice.id);
  };
  const uploadMutation = useMutation({
    mutationFn: uploadIncomingInvoice,
    onSuccess: (invoice) => {
      message.success(invoice.eInvoice ? `E-Rechnung gelesen und als ${invoice.number} gespeichert.` : `Beleg gespeichert als ${invoice.number}.`);
      opened(invoice);
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Upload fehlgeschlagen.')),
  });
  const manualMutation = useMutation({
    mutationFn: () => createIncomingInvoice({}),
    onSuccess: opened,
    onError: (error) => void message.error(apiErrorMessage(error, 'Anlegen fehlgeschlagen.')),
  });

  const totals = data?.totals ?? {};

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Eingangsrechnungen</Typography.Title>
        <Space wrap>
          <Upload accept=".pdf,.png,.jpg,.jpeg,.webp,.xml" showUploadList={false} customRequest={({ file, onSuccess, onError }) =>
              uploadMutation.mutate(file as File, { onSuccess: () => onSuccess?.('ok'), onError: (error) => onError?.(error as Error) })
            }>
            <Button type="primary" icon={<UploadOutlined />} loading={uploadMutation.isPending}>Beleg hochladen</Button>
          </Upload>
          <Button loading={manualMutation.isPending} onClick={() => manualMutation.mutate()}>Manuell erfassen</Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Zu prüfen" value={totals.RECEIVED?.count ?? 0} suffix={totals.RECEIVED ? `· ${formatMoney(totals.RECEIVED.gross)}` : ''} valueStyle={{ fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Freigegeben, zu bezahlen" value={totals.APPROVED ? formatMoney(totals.APPROVED.gross) : '–'} valueStyle={{ fontSize: 20 }} data-testid="incoming-to-pay" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Bezahlt" value={totals.PAID ? formatMoney(totals.PAID.gross) : '–'} valueStyle={{ fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Abgelehnt" value={totals.REJECTED?.count ?? 0} valueStyle={{ fontSize: 20 }} /></Card></Col>
      </Row>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Lieferant oder Rechnungsnummer" allowClear onSearch={setQ} style={{ width: 280, maxWidth: '100%' }} />
        <Select allowClear placeholder="Alle Status" value={status} onChange={setStatus} options={optionsOf(INCOMING_STATUS).map((o) => ({ ...o }))} style={{ width: 180 }} />
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Noch keine Eingangsrechnungen' }}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Nr.', dataIndex: 'number' },
          {
            title: 'Lieferant',
            render: (_, row: IncomingInvoice) => row.supplier?.organizationName || [row.supplier?.firstName, row.supplier?.lastName].filter(Boolean).join(' ') || row.supplierName || <em>noch nicht erfasst</em>,
          },
          { title: 'Rechnungs-Nr.', responsive: ['md'], dataIndex: 'invoiceNumber' },
          { title: 'Datum', responsive: ['md'], render: (_, row) => formatDate(row.invoiceDate) },
          { title: 'Fällig', render: (_, row) => formatDate(row.dueDate) },
          { title: 'Projekt', responsive: ['md'], render: (_, row) => row.project?.number ?? '' },
          { title: 'Brutto', align: 'right', render: (_, row) => formatMoney(row.grossAmount) },
          { title: 'Status', render: (_, row) => <Tag color={INCOMING_STATUS[row.status].color}>{INCOMING_STATUS[row.status].label}</Tag> },
        ]}
      />
      <IncomingInvoiceModal id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
