import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Drawer, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone } from '../hooks/useMediaQuery';
import { apiErrorMessage } from '../utils/assets';
import { formatDate, formatMoney } from '../utils/labels';
import { AdminCompanyRow, CompanyStatus, getCompany, impersonate, listCompanies, listPlans, updateCompany } from './adminApi';
import { COMPANY_STATUS, INVOICE_STATUS } from './adminLabels';

const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));

// Customers (tenants): list with usage figures; detail drawer with status, plan, trial, notes, users and support access.
export function AdminCompaniesPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const openId = params.get('open');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'companies', status, q], queryFn: () => listCompanies({ status, q: q || undefined }) });

  return (
    <div>
      <Typography.Title level={3}>Mandanten</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Name, Ort oder E-Mail" allowClear onSearch={setQ} style={{ width: 260, maxWidth: '100%' }} />
        <Select allowClear placeholder="Alle Status" value={status} onChange={setStatus} style={{ width: 170 }} options={Object.entries(COMPANY_STATUS).map(([value, entry]) => ({ value, label: entry.label }))} />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        onRow={(row) => ({ onClick: () => setParams({ open: row.id }), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Mandant', render: (_, row: AdminCompanyRow) => <strong>{row.name}</strong> },
          { title: 'Ort', responsive: ['md'], dataIndex: 'city' },
          { title: 'Status', render: (_, row) => <Tag color={COMPANY_STATUS[row.status].color}>{COMPANY_STATUS[row.status].label}</Tag> },
          { title: 'Tarif', render: (_, row) => row.plan?.name ?? '–' },
          { title: 'Testphase bis', responsive: ['md'], render: (_, row) => (row.status === 'TRIAL' ? formatDate(row.trialEndsAt) : '') },
          { title: 'Nutzer', responsive: ['md'], dataIndex: 'users', align: 'right' },
          { title: 'Belege', responsive: ['lg'], dataIndex: 'documents', align: 'right' },
          { title: 'Zuletzt aktiv', responsive: ['lg'], render: (_, row) => formatDate(row.lastActivity) },
          { title: 'Offen', align: 'right', render: (_, row) => (Number(row.openInvoiceAmount) > 0 ? <span style={{ color: '#cf1322' }}>{formatMoney(row.openInvoiceAmount)}</span> : '') },
        ]}
      />
      <CompanyDrawer id={openId} onClose={() => setParams({})} />
    </div>
  );
}

function CompanyDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const phone = useIsPhone();
  const [reasonModal, setReasonModal] = useState<'SUSPENDED' | 'CANCELLED' | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data: company } = useQuery({ queryKey: ['admin', 'company', id], queryFn: () => getCompany(id!), enabled: !!id });
  const { data: plans } = useQuery({ queryKey: ['admin', 'plans'], queryFn: listPlans });
  useEffect(() => setNotes(company?.operatorNotes ?? ''), [company?.operatorNotes, company?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
  };
  const update = useMutation({
    mutationFn: (payload: Parameters<typeof updateCompany>[1]) => updateCompany(id!, payload),
    onSuccess: () => {
      message.success('Gespeichert.');
      setReasonModal(null);
      setReason('');
      refresh();
    },
    onError,
  });
  const support = useMutation({
    mutationFn: (userId?: string) => impersonate(id!, userId),
    onSuccess: (result) => {
      // Switch to the customer app as this user; the banner there ends the support session.
      signIn(result.accessToken, result.user);
      navigate('/');
    },
    onError,
  });

  const setStatus = (next: CompanyStatus) => update.mutate({ status: next });
  const extendTrial = () => {
    const base = company?.trialEndsAt && new Date(company.trialEndsAt) > new Date() ? new Date(company.trialEndsAt) : new Date();
    base.setDate(base.getDate() + 14);
    update.mutate({ status: 'TRIAL', trialEndsAt: base.toISOString() });
  };

  return (
    <Drawer open={!!id} onClose={onClose} width={phone ? '100%' : 720} title={company?.name ?? 'Mandant'} destroyOnHidden>
      {company && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {company.status === 'SUSPENDED' && <Alert type="error" showIcon message={`Gesperrt${company.statusReason ? `: ${company.statusReason}` : ''}`} />}
          <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label="Status"><Tag color={COMPANY_STATUS[company.status].color}>{COMPANY_STATUS[company.status].label}</Tag></Descriptions.Item>
            <Descriptions.Item label="Angelegt">{formatDate(company.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Testphase bis">{formatDate(company.trialEndsAt) || '–'}</Descriptions.Item>
            <Descriptions.Item label="Zuletzt aktiv">{formatDate(company.lastActivity) || '–'}</Descriptions.Item>
            <Descriptions.Item label="Anschrift">{[company.street, [company.zipCode, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}</Descriptions.Item>
            <Descriptions.Item label="Kontakt">{[company.email, company.phone].filter(Boolean).join(' · ') || '–'}</Descriptions.Item>
            <Descriptions.Item label="Belege / Projekte">{company._count.documents} / {company._count.projects}</Descriptions.Item>
            <Descriptions.Item label="Kontakte / Zeiten">{company._count.contacts} / {company._count.timeEntries}</Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Text strong>Tarif</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={company.plan?.id}
              placeholder="Kein Tarif"
              data-testid="company-plan"
              onChange={(planId) => update.mutate({ planId })}
              options={(plans ?? []).filter((plan) => plan.isActive || plan.id === company.plan?.id).map((plan) => ({ value: plan.id, label: `${plan.name} – ${formatMoney(plan.priceMonthly)}/Monat${plan.maxUsers ? `, bis ${plan.maxUsers} Nutzer` : ', unbegrenzt'}` }))}
            />
          </div>

          <Space wrap>
            {(company.status === 'SUSPENDED' || company.status === 'CANCELLED' || company.status === 'TRIAL') && (
              <Button type="primary" loading={update.isPending} onClick={() => setStatus('ACTIVE')} data-testid="company-activate">{company.status === 'TRIAL' ? 'Als zahlenden Kunden aktivieren' : 'Entsperren / aktivieren'}</Button>
            )}
            {company.status !== 'SUSPENDED' && company.status !== 'CANCELLED' && <Button danger onClick={() => setReasonModal('SUSPENDED')} data-testid="company-suspend">Sperren</Button>}
            {company.status !== 'CANCELLED' && <Button danger onClick={() => setReasonModal('CANCELLED')}>Kündigen</Button>}
            {(company.status === 'TRIAL' || company.status === 'ACTIVE') && company.status === 'TRIAL' && <Button onClick={extendTrial}>Testphase +14 Tage</Button>}
            <Button loading={support.isPending} onClick={() => support.mutate(undefined)} data-testid="company-support">Support-Zugriff (als Inhaber)</Button>
          </Space>

          <div>
            <Typography.Text strong>Interne Notizen</Typography.Text>
            <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 4 }} placeholder="Nur für den Betreiber sichtbar" />
            <Button style={{ marginTop: 8 }} disabled={notes === (company.operatorNotes ?? '')} onClick={() => update.mutate({ operatorNotes: notes })}>Notiz speichern</Button>
          </div>

          <div>
            <Typography.Text strong>Nutzer ({company.users.length})</Typography.Text>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={company.users}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Name', render: (_, user) => `${user.firstName} ${user.lastName}` },
                { title: 'E-Mail', dataIndex: 'email' },
                { title: 'Rolle', dataIndex: 'role' },
                { title: 'Aktiv', render: (_, user) => (user.isActive ? 'ja' : 'nein') },
                { title: '', render: (_, user) => user.isActive && <Button size="small" onClick={() => support.mutate(user.id)}>Support als …</Button> },
              ]}
            />
          </div>

          <div>
            <Typography.Text strong>Rechnungen</Typography.Text>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={company.platformInvoices}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Noch keine Rechnungen' }}
              columns={[
                { title: 'Nr.', dataIndex: 'number' },
                { title: 'Zeitraum', render: (_, invoice) => formatDate(invoice.periodStart) },
                { title: 'Brutto', align: 'right', render: (_, invoice) => formatMoney(invoice.gross) },
                { title: 'Status', render: (_, invoice) => <Tag color={INVOICE_STATUS[invoice.status].color}>{INVOICE_STATUS[invoice.status].label}</Tag> },
              ]}
            />
          </div>
        </Space>
      )}
      <Modal
        open={!!reasonModal}
        title={reasonModal === 'SUSPENDED' ? 'Mandant sperren' : 'Mandant kündigen'}
        okText={reasonModal === 'SUSPENDED' ? 'Sperren' : 'Kündigen'}
        okButtonProps={{ danger: true, 'data-testid': 'company-reason-ok' } as never}
        cancelText="Abbrechen"
        confirmLoading={update.isPending}
        onCancel={() => setReasonModal(null)}
        onOk={() => update.mutate({ status: reasonModal!, statusReason: reason })}
      >
        <Typography.Paragraph>Die Nutzer können sich danach nicht mehr anmelden; laufende Sitzungen enden sofort. Der Grund wird dem Kunden beim Anmelden angezeigt.</Typography.Paragraph>
        <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund (z. B. Rechnung offen)" data-testid="company-reason" />
      </Modal>
    </Drawer>
  );
}
