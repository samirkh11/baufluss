import { useQuery } from '@tanstack/react-query';
import { Card, Progress, Space, Statistic, Table, Typography } from 'antd';
import { getTimeSummary, listTimeEntries } from '../api/timeEntries';
import { TimeEntry } from '../types';
import { formatDateDe, formatDuration, formatHours } from '../utils/dates';
import { formatMoney } from '../utils/labels';

// Working time booked on one project: total hours (and for OWNER/ADMIN planned hours and costs),
// hours per employee and the single entries. Employees only see their own times (enforced by the API).
export function ProjectTimePanel({ projectId }: { projectId: string }) {
  const { data: summary } = useQuery({
    queryKey: ['time-entries', 'summary', 'project', projectId],
    queryFn: () => getTimeSummary({ from: '2000-01-01', to: '2100-12-31', projectId }),
  });
  const { data: entries, isLoading } = useQuery({
    queryKey: ['time-entries', 'project', projectId],
    queryFn: () => listTimeEntries({ projectId, pageSize: 100 }),
  });

  const project = summary?.byProject[0];
  const planned = project?.plannedHours ?? null;

  return (
    <div>
      <Space wrap size="large" style={{ marginBottom: 16 }}>
        <Statistic
          title="Gebuchte Arbeitszeit"
          value={formatHours(summary?.totalMinutes ?? 0)}
          suffix="Std."
        />
        {planned !== null && (
          <Statistic title="Plan (Angebot/Auftrag)" value={planned.toLocaleString('de-DE')} suffix="Std." />
        )}
        {summary?.totalCost !== undefined && (
          <Statistic title="Personalkosten (intern)" value={formatMoney(summary.totalCost)} />
        )}
      </Space>
      {planned !== null && project && (
        <Progress
          percent={Math.round((project.minutes / 60 / planned) * 100)}
          status={project.minutes / 60 > planned ? 'exception' : 'normal'}
          style={{ maxWidth: 480, marginBottom: 16 }}
        />
      )}

      <Card size="small" title="Je Mitarbeiter" style={{ marginBottom: 16 }}>
        <Table
          rowKey="userId"
          size="small"
          pagination={false}
          dataSource={project?.byUser ?? []}
          locale={{ emptyText: 'Noch keine Zeiten gebucht' }}
          columns={[
            { title: 'Mitarbeiter', render: (_, row) => `${row.user.firstName} ${row.user.lastName}` },
            { title: 'Stunden', align: 'right', render: (_, row) => formatHours(row.minutes) },
            {
              title: 'Kosten',
              align: 'right',
              responsive: ['md'],
              render: (_, row) => (row.cost !== undefined ? formatMoney(row.cost) : ''),
            },
          ]}
        />
      </Card>

      <Card size="small" title="Einträge">
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={entries?.items}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Datum', dataIndex: 'date', render: (value: string) => formatDateDe(value) },
            {
              title: 'Mitarbeiter',
              responsive: ['md'],
              render: (_, row: TimeEntry) => `${row.user.firstName} ${row.user.lastName}`,
            },
            {
              title: 'Zeit',
              render: (_, row: TimeEntry) => (row.startTime ? `${row.startTime}–${row.endTime ?? '…'}` : ''),
            },
            { title: 'Tätigkeit', dataIndex: 'activity' },
            {
              title: 'Dauer',
              align: 'right',
              render: (_, row: TimeEntry) => formatDuration(row.durationMinutes),
            },
          ]}
        />
        <Typography.Text type="secondary">Erfassen und korrigieren unter „Zeiten".</Typography.Text>
      </Card>
    </div>
  );
}
