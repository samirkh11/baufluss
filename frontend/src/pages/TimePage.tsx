import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Popconfirm, Select, Space, Tabs, Tag, Typography, message } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  LockOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { deleteTimeEntry, listTimeEntries } from '../api/timeEntries';
import { listUsers } from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { TimeEntryModal } from '../components/TimeEntryModal';
import { TimerCard } from '../components/TimerCard';
import { TimeReport } from '../components/TimeReport';
import { TimeEntry } from '../types';
import { apiErrorMessage } from '../utils/assets';
import {
  addDays,
  berlinNow,
  formatDateDe,
  formatDayLabel,
  formatDuration,
  isoWeek,
  mondayOf,
} from '../utils/dates';

// A day with more than 10 working hours violates the Working Hours Act (ArbZG § 3) unless an
// exception applies, so it is flagged for the employee and the office.
const MAX_DAILY_MINUTES = 10 * 60;

// "My times": stopwatch, week view with all entries and manual entry. OWNER/ADMIN can also look at
// (and correct) other employees' times and see the evaluation tab.
function MyTimes() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const office = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const today = berlinNow().date;

  // Deep link: /time?week=2026-10-05 opens the week containing that day.
  const [searchParams] = useSearchParams();
  const requestedWeek = searchParams.get('week');
  const [weekStart, setWeekStart] = useState(
    mondayOf(requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? requestedWeek : today),
  );
  const [employee, setEmployee] = useState<string>('me'); // 'me' | 'all' | user id (office only)
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const userFilter = !office || employee === 'me' ? undefined : employee === 'all' ? undefined : employee;
  const ownOnly = !office || employee === 'me';

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: office });
  const { data, isLoading } = useQuery({
    queryKey: ['time-entries', 'week', weekStart, employee],
    queryFn: () =>
      listTimeEntries({
        from: weekStart,
        to: weekEnd,
        userId: office && employee === 'me' ? user?.id : userFilter,
        pageSize: 200,
      }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['time-entries'] });
  const deleteMutation = useMutation({
    mutationFn: deleteTimeEntry,
    onSuccess: refresh,
    onError: (error) => void message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  // Entries grouped by day, Monday to Sunday.
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const entries = (data?.items ?? [])
        .filter((entry) => entry.date.slice(0, 10) === date)
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
      return { date, entries, minutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0) };
    });
  }, [data, weekStart]);
  const weekMinutes = days.reduce((sum, day) => sum + day.minutes, 0);

  const canModify = (entry: TimeEntry) => office || entry.status === 'OPEN';

  function openModal(entry: TimeEntry | null, date?: string) {
    setEditing(entry);
    setModalDate(date ?? (today < weekStart || today > weekEnd ? weekEnd : today));
    setModalOpen(true);
  }
  const [modalDate, setModalDate] = useState(today);

  return (
    <div>
      {ownOnly && <TimerCard />}

      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button
            icon={<LeftOutlined />}
            aria-label="Vorherige Woche"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          />
          <Typography.Text strong style={{ minWidth: 200, display: 'inline-block', textAlign: 'center' }}>
            KW {isoWeek(weekStart)} · {formatDateDe(weekStart)} – {formatDateDe(weekEnd)}
          </Typography.Text>
          <Button
            icon={<RightOutlined />}
            aria-label="Nächste Woche"
            disabled={addDays(weekStart, 7) > today}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          />
          <Button onClick={() => setWeekStart(mondayOf(today))}>Heute</Button>
        </Space>
        <Space wrap>
          {office && (
            <Select
              value={employee}
              onChange={setEmployee}
              style={{ minWidth: 200 }}
              options={[
                { value: 'me', label: 'Meine Zeiten' },
                { value: 'all', label: 'Alle Mitarbeiter' },
                ...(users ?? [])
                  .filter((candidate) => candidate.id !== user?.id)
                  .map((candidate) => ({
                    value: candidate.id,
                    label: `${candidate.firstName} ${candidate.lastName}`,
                  })),
              ]}
            />
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
            Zeit erfassen
          </Button>
        </Space>
      </Space>

      <Typography.Paragraph>
        Woche gesamt: <strong data-testid="week-total">{formatDuration(weekMinutes)}</strong>
      </Typography.Paragraph>

      {isLoading ? null : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {days.map((day) => (
            <Card
              key={day.date}
              size="small"
              title={
                <Space>
                  <span>{formatDayLabel(day.date)}</span>
                  {day.minutes > MAX_DAILY_MINUTES && <Tag color="orange">über 10 Std.</Tag>}
                </Space>
              }
              extra={<strong>{day.minutes > 0 ? formatDuration(day.minutes) : ''}</strong>}
              styles={{ body: { padding: day.entries.length === 0 ? 0 : undefined } }}
            >
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                  data-testid="time-entry"
                >
                  <div style={{ minWidth: 0 }}>
                    <div>
                      <strong>
                        {entry.startTime ? `${entry.startTime}–${entry.endTime ?? '…'}` : 'Dauer'}
                      </strong>{' '}
                      {entry.project ? <Tag>{entry.project.number}</Tag> : <Tag color="default">Intern</Tag>}
                      {entry.isRunning && <Tag color="green">läuft</Tag>}
                      {entry.status === 'APPROVED' && (
                        <Tag icon={<LockOutlined />} color="blue">
                          freigegeben
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {!ownOnly && `${entry.user.firstName} ${entry.user.lastName} · `}
                      {entry.project?.name}
                      {entry.activity ? ` · ${entry.activity}` : ''}
                      {entry.breakMinutes > 0 ? ` · Pause ${entry.breakMinutes} Min.` : ''}
                    </div>
                  </div>
                  <Space size={4} style={{ flexShrink: 0 }}>
                    <strong>{entry.isRunning ? '' : formatDuration(entry.durationMinutes)}</strong>
                    {canModify(entry) && !entry.isRunning && (
                      <>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          aria-label="Bearbeiten"
                          onClick={() => openModal(entry)}
                        />
                        <Popconfirm
                          title="Eintrag löschen?"
                          onConfirm={() => deleteMutation.mutate(entry.id)}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} aria-label="Löschen" />
                        </Popconfirm>
                      </>
                    )}
                  </Space>
                </div>
              ))}
              {day.entries.length === 0 && <div style={{ padding: '6px 12px', color: '#aaa' }}>—</div>}
            </Card>
          ))}
        </Space>
      )}
      {!isLoading && weekMinutes === 0 && (
        <Empty style={{ marginTop: 16 }} description="Keine Zeiten in dieser Woche" />
      )}

      <TimeEntryModal
        open={modalOpen}
        entry={editing}
        defaultDate={modalDate}
        defaultUserId={office && employee !== 'me' && employee !== 'all' ? employee : undefined}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

export function TimePage() {
  const { user } = useAuth();
  const office = user?.role === 'OWNER' || user?.role === 'ADMIN';
  return (
    <Tabs
      items={[
        { key: 'mine', label: 'Zeiten', children: <MyTimes /> },
        ...(office ? [{ key: 'report', label: 'Auswertung', children: <TimeReport /> }] : []),
      ]}
    />
  );
}
