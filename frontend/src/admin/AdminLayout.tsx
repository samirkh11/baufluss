import { Suspense } from 'react';
import { Button, Layout, Menu, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageFallback } from '../components/PageFallback';
import { adminName, adminSignOut, hasAdminToken } from './adminApi';
import { APP_NAME } from '../config/app';
import { color } from '../theme/tokens';

const { Header, Content } = Layout;

const ITEMS = [
  { key: '/admin', label: <Link to="/admin">Übersicht</Link> },
  { key: '/admin/companies', label: <Link to="/admin/companies">Mandanten</Link> },
  { key: '/admin/invoices', label: <Link to="/admin/invoices">Rechnungen</Link> },
  { key: '/admin/plans', label: <Link to="/admin/plans">Tarife</Link> },
  { key: '/admin/log', label: <Link to="/admin/log">Protokoll</Link> },
  { key: '/admin/system', label: <Link to="/admin/system">System</Link> },
];

// Shell of the operator back office: dark top bar with a horizontal menu (scrolls on phones).
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (!hasAdminToken()) return <Navigate to="/admin/login" replace />;
  const selected = ITEMS.map((item) => item.key).filter((key) => key !== '/admin').find((key) => location.pathname.startsWith(key)) ?? '/admin';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: color.adminHeader, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <Typography.Text strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>{APP_NAME} Betreiber</Typography.Text>
        <Menu theme="dark" mode="horizontal" className="mw-admin-nav" selectedKeys={[selected]} items={ITEMS} style={{ flex: 1, minWidth: 0 }} />
        <Typography.Text style={{ color: '#ccc' }} className="admin-name">{adminName()}</Typography.Text>
        <Button
          type="text"
          style={{ color: '#fff' }}
          aria-label="Abmelden"
          icon={<LogoutOutlined />}
          onClick={() => {
            adminSignOut();
            queryClient.clear();
            navigate('/admin/login');
          }}
        />
      </Header>
      <Content style={{ padding: 16, maxWidth: 1400, width: '100%', margin: '0 auto', minWidth: 0 }}>
        <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
      </Content>
    </Layout>
  );
}
