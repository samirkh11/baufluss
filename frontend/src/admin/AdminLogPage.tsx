import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Typography } from 'antd';
import { listAdminLog } from './adminApi';
import { ADMIN_ACTIONS } from './adminLabels';

// What the operator staff did (read-only).
export function AdminLogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'log', page], queryFn: () => listAdminLog({ page, pageSize: 25 }) });
  return (
    <div>
      <Typography.Title level={3}>Betreiber-Protokoll</Typography.Title>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
        expandable={{ expandedRowRender: (row) => <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.details, null, 2)}</pre>, rowExpandable: (row) => !!row.details }}
        columns={[
          { title: 'Zeitpunkt', render: (_, row) => new Date(row.createdAt).toLocaleString('de-DE') },
          { title: 'Mitarbeiter', dataIndex: 'adminName' },
          { title: 'Aktion', render: (_, row) => ADMIN_ACTIONS[row.action] ?? row.action },
          { title: 'Mandant', dataIndex: 'companyName' },
        ]}
      />
    </div>
  );
}
