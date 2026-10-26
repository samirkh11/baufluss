import { useQuery } from '@tanstack/react-query';
import { Empty, Statistic, Typography } from 'antd';
import { StatusTag } from '../StatusTag';
import { Link } from 'react-router-dom';
import { listProjects } from '../../api/projects';
import { listReports } from '../../api/reports';
import { listTimeEntries } from '../../api/timeEntries';
import { berlinNow, formatDuration } from '../../utils/dates';
import { customerName, formatDate, PROJECT_STATUS, REPORT_TYPE, siteAddress } from '../../utils/labels';
import { TimerCard } from '../TimerCard';
import { WidgetCard } from './WidgetCard';

// Stopwatch for everybody; scrolls inside the cell when the cell is small.
export function TimerWidget() {
  return <div style={{ height: '100%', overflow: 'auto' }}><TimerCard /></div>;
}

function mondayOfToday(): { from: string; to: string } {
  const [y, m, d] = berlinNow().date.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}

export function WeekHoursWidget() {
  const { from, to } = mondayOfToday();
  const { data, isLoading } = useQuery({
    queryKey: ['time-entries', 'dashboard-week', from],
    queryFn: () => listTimeEntries({ from, to, pageSize: 200 }),
  });
  const today = berlinNow().date;
  const week = data?.items.reduce((sum, entry) => sum + entry.durationMinutes, 0) ?? 0;
  const day = data?.items.filter((entry) => entry.date.slice(0, 10) === today).reduce((sum, entry) => sum + entry.durationMinutes, 0) ?? 0;
  return (
    <WidgetCard title="Meine Stunden" link="/time" loading={isLoading}>
      <Statistic title="Heute" value={formatDuration(day)} valueStyle={{ fontSize: 22 }} />
      <Statistic title="Diese Woche" value={formatDuration(week)} valueStyle={{ fontSize: 22 }} style={{ marginTop: 8 }} />
    </WidgetCard>
  );
}

// Active projects; members only get the projects the API lets them see.
export function ProjectsWidget() {
  const { data, isLoading } = useQuery({ queryKey: ['projects', 'dashboard'], queryFn: () => listProjects({ pageSize: 100 }) });
  const projects = data?.items ?? [];
  const active = projects.filter((project) => project.status === 'IN_PROGRESS' || project.status === 'PLANNING');
  return (
    <WidgetCard title="Projekte" link="/projects" loading={isLoading}>
      <Typography.Text type="secondary">
        {(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const).map((status) => (
          <StatusTag key={status} tone={PROJECT_STATUS[status].tone}>
            {PROJECT_STATUS[status].label}: {projects.filter((project) => project.status === status).length}
          </StatusTag>
        ))}
      </Typography.Text>
      {active.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Keine laufenden Projekte" />}
      {active.slice(0, 8).map((project) => (
        <div key={project.id} style={{ marginTop: 8 }}>
          <Link to={`/projects/${project.id}`}><strong>{project.number}</strong> {project.name}</Link>
          <br />
          <small style={{ color: '#888' }}>
            {customerName(project.customer)}
            {siteAddress(project) ? ` · ${siteAddress(project)}` : ''}
          </small>
        </div>
      ))}
    </WidgetCard>
  );
}

export function ReportsWidget() {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'dashboard'], queryFn: () => listReports({ pageSize: 5 }) });
  return (
    <WidgetCard title="Letzte Berichte" link="/reports" loading={isLoading}>
      {data?.items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Noch keine Berichte" />}
      {data?.items.map((report) => (
        <div key={report.id} style={{ marginTop: 6 }}>
          <StatusTag tone={REPORT_TYPE[report.type].tone}>{REPORT_TYPE[report.type].label}</StatusTag>
          {report.title}
          <br />
          <small style={{ color: '#888' }}>{formatDate(report.reportDate)} · {report.project.number} · {report.authorName}</small>
        </div>
      ))}
    </WidgetCard>
  );
}
