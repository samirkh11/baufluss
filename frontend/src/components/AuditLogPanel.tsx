import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Input, Select, Space, Table, Typography } from 'antd';
import { listAuditLog } from '../api/compliance';

const ENTITIES: Record<string, string> = {
  documents: 'Belege', dunning: 'Mahnwesen', dunnings: 'Mahnungen', payments: 'Zahlungen', 'incoming-invoices': 'Eingangsrechnungen',
  contacts: 'Kontakte', projects: 'Projekte', reports: 'Berichte', catalog: 'Artikel/Leistungen', users: 'Nutzer', companies: 'Firma',
  'time-entries': 'Zeiten', compliance: 'Compliance', 'number-sequences': 'Nummernkreise',
};
const METHODS: Record<string, string> = { POST: 'Anlegen/Aktion', PUT: 'Ändern', PATCH: 'Ändern', DELETE: 'Löschen', GET: 'Export/Auskunft' };

// Read-only audit trail: who changed what and when (GoBD Nachvollziehbarkeit).
export function AuditLogPanel() {
  const [entityType, setEntityType] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['compliance', 'audit', entityType, q, page],
    queryFn: () => listAuditLog({ entityType, q: q || undefined, page, pageSize: 25 }),
  });

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Das Änderungsprotokoll ist unveränderlich: Einträge können weder bearbeitet noch gelöscht werden." />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Nutzer, Beleg, Vorgang" allowClear onSearch={(value) => { setQ(value); setPage(1); }} style={{ width: 260, maxWidth: '100%' }} />
        <Select allowClear placeholder="Alle Bereiche" value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} style={{ width: 200 }} options={Object.entries(ENTITIES).map(([value, label]) => ({ value, label }))} />
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
        expandable={{ expandedRowRender: (row) => <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{row.details ? JSON.stringify(row.details, null, 2) : 'Keine Details'}</pre>, rowExpandable: (row) => !!row.details }}
        columns={[
          { title: 'Zeitpunkt', render: (_, row) => new Date(row.createdAt).toLocaleString('de-DE') },
          { title: 'Nutzer', dataIndex: 'userName' },
          { title: 'Bereich', render: (_, row) => ENTITIES[row.entityType] ?? row.entityType },
          { title: 'Vorgang', render: (_, row) => <span>{METHODS[row.method] ?? row.method} <Typography.Text type="secondary">{row.route}</Typography.Text></span> },
          { title: 'Objekt', dataIndex: 'entityLabel' },
        ]}
      />
    </div>
  );
}
