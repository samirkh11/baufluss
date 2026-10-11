import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { getRunningTimer, startTimer, stopTimer } from '../api/timeEntries';
import { listProjects } from '../api/projects';
import { apiErrorMessage } from '../utils/assets';
import { berlinNow, formatDuration, minutesOf } from '../utils/dates';

// Stopwatch: start/stop working time with one tap. The server records the times (company time
// zone), so a wrong device clock cannot distort them. Built for phones: large buttons.
export function TimerCard() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [activity, setActivity] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [, setTick] = useState(0);

  const { data: running } = useQuery({ queryKey: ['time-entries', 'running'], queryFn: getRunningTimer });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => listProjects({ pageSize: 200 }),
  });

  // Re-render every 15 s so the elapsed time advances while the timer runs.
  useEffect(() => {
    if (!running) {
      return;
    }
    const interval = setInterval(() => setTick((value) => value + 1), 15000);
    return () => clearInterval(interval);
  }, [running]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['time-entries'] });
  const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));

  const startMutation = useMutation({
    mutationFn: () => startTimer({ projectId, activity: activity || undefined }),
    onSuccess: () => {
      setActivity('');
      refresh();
    },
    onError,
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => stopTimer(id, breakMinutes),
    onSuccess: (entry) => {
      message.success(`Gestoppt: ${formatDuration(entry.durationMinutes)} erfasst.`);
      setBreakMinutes(0);
      refresh();
    },
    onError,
  });

  if (running) {
    const now = berlinNow();
    const sameDay = running.date.slice(0, 10) === now.date;
    const elapsed = sameDay ? Math.max(0, now.minute - minutesOf(running.startTime!)) : null;
    return (
      <Card style={{ marginBottom: 16, borderColor: '#52c41a' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="success" strong>
              Zeiterfassung läuft
            </Typography.Text>
            <Typography.Title level={3} style={{ margin: '4px 0' }} data-testid="timer-elapsed">
              {elapsed === null ? 'seit gestern' : formatDuration(elapsed)}
            </Typography.Title>
            <Typography.Text type="secondary">
              seit {running.startTime} Uhr ·{' '}
              {running.project ? `${running.project.number} ${running.project.name}` : 'Intern'}
              {running.activity ? ` · ${running.activity}` : ''}
            </Typography.Text>
          </div>
          <Space wrap>
            <Space>
              <InputNumber
                min={0}
                max={240}
                value={breakMinutes}
                onChange={(value) => setBreakMinutes(value ?? 0)}
                aria-label="Pause in Minuten"
              />
              <span>Min. Pause</span>
            </Space>
            <Button
              type="primary"
              danger
              size="large"
              icon={<PauseCircleOutlined />}
              loading={stopMutation.isPending}
              onClick={() => stopMutation.mutate(running.id)}
            >
              Stopp
            </Button>
          </Space>
        </Space>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Projekt wählen (leer = intern)"
          style={{ width: '100%' }}
          value={projectId}
          onChange={setProjectId}
          options={(projects?.items ?? []).map((project) => ({
            value: project.id,
            label: `${project.number} · ${project.name}`,
          }))}
        />
        <Input
          placeholder="Tätigkeit (optional)"
          value={activity}
          onChange={(event) => setActivity(event.target.value)}
        />
        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          loading={startMutation.isPending}
          onClick={() => startMutation.mutate()}
          block
        >
          Start
        </Button>
      </Space>
    </Card>
  );
}
