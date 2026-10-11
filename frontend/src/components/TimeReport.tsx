import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { approveTimeEntries, downloadTimeCsv, getTimeSummary, reopenTimeEntries } from '../api/timeEntries';
import { listUsers } from '../api/users';
import { TimeSummary } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { addDays, berlinNow, formatHours } from '../utils/dates';
import { formatMoney } from '../utils/labels';

// Evaluation for OWNER/ADMIN: hours per project (with planned hours and costs) and per employee
// for a period, CSV export and release of the period for payroll.
export function TimeReport() {
  const queryClient = useQueryClient();
  const today = berlinNow().date;
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [employee, setEmployee] = useState<string | undefined>();

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const params = { from, to, userId: employee };
  const { data: summary, isLoading } = useQuery({
    queryKey: ['time-entries', 'summary', params],
    queryFn: () => getTimeSummary(params),
    enabled: !!from && !!to,
  });

  const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));
  const approveMutation = useMutation({
    mutationFn: () => approveTimeEntries({ from, to, userId: employee }),
    onSuccess: (result) => {
      message.success(`${result.count} Einträge freigegeben.`);
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
    onError,
  });
  const reopenMutation = useMutation({
    mutationFn: () => reopenTimeEntries({ from, to, userId: employee }),
    onSuccess: (result) => {
      message.success(`Freigabe für ${result.count} Einträge aufgehoben.`);
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
    onError,
  });
  const csvMutation = useMutation({ mutationFn: () => downloadTimeCsv(params), onError });

  const setMonth = (offset: number) => {
    const base = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10) > today ? today : end.toISOString().slice(0, 10));
  };

  const name = (entry: { user: { firstName: string; lastName: string } }) =>
    `${entry.user.firstName} ${entry.user.lastName}`;
  const rows = summary?.byProject ?? [];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button onClick={() => setMonth(-1)}>‹ Vormonat</Button>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(event) => setFrom(event.target.value)}
          style={{ width: 160 }}
          aria-label="Von"
        />
        <Input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(event) => setTo(event.target.value)}
          style={{ width: 160 }}
          aria-label="Bis"
        />
        <Button
          onClick={() => {
            setFrom(`${today.slice(0, 8)}01`);
            setTo(today);
          }}
        >
          Dieser Monat
        </Button>
        <Button
          onClick={() => {
            setFrom(addDays(today, -6));
            setTo(today);
          }}
        >
          Letzte 7 Tage
        </Button>
        <Select
          allowClear
          placeholder="Alle Mitarbeiter"
          value={employee}
          onChange={setEmployee}
          style={{ minWidth: 200 }}
          options={(users ?? []).map((user) => ({
            value: user.id,
            label: `${user.firstName} ${user.lastName}`,
          }))}
        />
      </Space>

      <Space wrap size="large" style={{ marginBottom: 16, display: 'flex' }}>
        <Statistic
          title="Arbeitszeit gesamt"
          value={summary ? formatHours(summary.totalMinutes) : '–'}
          suffix="Std."
        />
        <Statistic
          title="Personalkosten (intern)"
          value={summary?.totalCost !== undefined ? formatMoney(summary.totalCost) : '–'}
        />
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          icon={<DownloadOutlined />}
          loading={csvMutation.isPending}
          onClick={() => csvMutation.mutate()}
        >
          CSV-Export
        </Button>
        <Popconfirm
          title="Zeitraum freigeben?"
          description="Die Mitarbeiter können freigegebene Zeiten nicht mehr ändern."
          okText="Freigeben"
          onConfirm={() => approveMutation.mutate()}
        >
          <Button type="primary" loading={approveMutation.isPending}>
            Zeitraum freigeben
          </Button>
        </Popconfirm>
        <Popconfirm title="Freigabe aufheben?" onConfirm={() => reopenMutation.mutate()}>
          <Button loading={reopenMutation.isPending}>Freigabe aufheben</Button>
        </Popconfirm>
      </Space>

      <Card title="Stunden je Projekt" style={{ marginBottom: 16 }}>
        <Table
          rowKey={(row) => row.projectId ?? 'internal'}
          loading={isLoading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowRender: (row) => (
              <Table
                size="small"
                rowKey="userId"
                pagination={false}
                dataSource={row.byUser}
                columns={[
                  { title: 'Mitarbeiter', render: (_, entry) => name(entry) },
                  { title: 'Stunden', align: 'right', render: (_, entry) => formatHours(entry.minutes) },
                  {
                    title: 'Kosten',
                    align: 'right',
                    responsive: ['md'],
                    render: (_, entry) => (entry.cost !== undefined ? formatMoney(entry.cost) : ''),
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: 'Projekt',
              render: (_, row: TimeSummary['byProject'][number]) =>
                row.project ? `${row.project.number} · ${row.project.name}` : 'Intern (ohne Projekt)',
            },
            { title: 'Ist (Std.)', align: 'right', render: (_, row) => formatHours(row.minutes) },
            {
              title: 'Plan (Std.)',
              align: 'right',
              responsive: ['md'],
              render: (_, row) => (row.plannedHours ? row.plannedHours.toLocaleString('de-DE') : ''),
            },
            {
              title: 'Auslastung',
              responsive: ['md'],
              width: 160,
              render: (_, row) =>
                row.plannedHours ? (
                  <Progress
                    percent={Math.round((row.minutes / 60 / row.plannedHours) * 100)}
                    size="small"
                    status={row.minutes / 60 > row.plannedHours ? 'exception' : 'normal'}
                  />
                ) : (
                  ''
                ),
            },
            {
              title: 'Kosten',
              align: 'right',
              responsive: ['md'],
              render: (_, row) => (row.cost !== undefined ? formatMoney(row.cost) : ''),
            },
          ]}
        />
        <Typography.Text type="secondary">
          Plan = Stunden-Positionen (Einheit „h") der Aufträge, sonst der angenommenen Angebote. Kosten =
          Stunden × interner Stundensatz.
        </Typography.Text>
      </Card>

      <Card title="Stunden je Mitarbeiter">
        <Table
          rowKey="userId"
          loading={isLoading}
          dataSource={summary?.byUser}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Mitarbeiter', render: (_, entry) => name(entry) },
            { title: 'Stunden', align: 'right', render: (_, entry) => formatHours(entry.minutes) },
            {
              title: 'Kosten',
              align: 'right',
              responsive: ['md'],
              render: (_, entry) => (entry.cost !== undefined ? formatMoney(entry.cost) : ''),
            },
          ]}
        />
      </Card>
    </div>
  );
}
