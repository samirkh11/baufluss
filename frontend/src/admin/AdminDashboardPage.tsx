import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, List, Row, Statistic, Typography } from 'antd';
import { StatusTag } from '../components/StatusTag';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney } from '../utils/labels';
import { getStats } from './adminApi';
import { COMPANY_STATUS } from './adminLabels';

// Operator dashboard: customers by status, recurring revenue, open invoices, trials ending, signups.
export function AdminDashboardPage() {
  const { data } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats });
  if (!data) return null;
  const maxSignups = Math.max(1, ...data.signups.map((s) => s.count));

  return (
    <div>
      <Typography.Title level={3}>Übersicht</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Mandanten" value={data.companies} data-testid="stat-companies" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Monatlicher Umsatz (MRR)" value={formatMoney(data.mrr)} data-testid="stat-mrr" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Jahresumsatz (ARR)" value={formatMoney(data.arr)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Offene Rechnungen" value={formatMoney(data.openInvoices.gross)} suffix={data.openInvoices.overdue ? `· ${data.openInvoices.overdue} überfällig` : ''} valueStyle={{ color: data.openInvoices.overdue ? '#cf1322' : undefined }} /></Card></Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Mandanten nach Status">
            {(Object.keys(COMPANY_STATUS) as (keyof typeof COMPANY_STATUS)[]).map((status) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <StatusTag tone={COMPANY_STATUS[status].tone}>{COMPANY_STATUS[status].label}</StatusTag>
                <strong>{data.byStatus[status] ?? 0}</strong>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Neuanmeldungen (6 Monate)">
            {data.signups.map((entry) => (
              <div key={entry.month} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 64 }}>{entry.month}</span>
                <div style={{ background: '#1677ff', height: 10, borderRadius: 2, width: `${(entry.count / maxSignups) * 60}%`, minWidth: entry.count ? 4 : 0 }} />
                <span>{entry.count}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Testphase endet bald / abgelaufen">
            {data.trialsEnding.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Keine" /> : (
              <List size="small" dataSource={data.trialsEnding} renderItem={(item) => <List.Item><Link to={`/admin/companies?open=${item.id}`}>{item.name}</Link><span>{formatDate(item.trialEndsAt)}</span></List.Item>} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="Meiste Belege">
            <List size="small" dataSource={data.topCompanies} renderItem={(item) => <List.Item><Link to={`/admin/companies?open=${item.id}`}>{item.name}</Link><span>{item.documents} Belege · {item.users} Nutzer</span></List.Item>} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="Neueste Mandanten">
            <List size="small" dataSource={data.newest} renderItem={(item) => <List.Item><Link to={`/admin/companies?open=${item.id}`}>{item.name}</Link><StatusTag tone={COMPANY_STATUS[item.status].tone}>{COMPANY_STATUS[item.status].label}</StatusTag></List.Item>} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
