import { ReactNode, useEffect, useState } from 'react';
import { Button, Drawer, Layout, Menu, Typography } from 'antd';
import {
  AuditOutlined,
  ClockCircleOutlined,
  ContactsOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  SolutionOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  ProjectOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIsCompact, useIsPhone } from '../hooks/useMediaQuery';

const { Header, Sider, Content } = Layout;

// Only menu items for modules that actually exist are listed here. Add an entry once the
// corresponding feature module is implemented — see /.claude/memory/project_roadmap.md.
// `officeOnly` entries are shown to OWNER/ADMIN only (documents contain prices and customer data).
const MENU_ITEMS: { key: string; icon: ReactNode; label: ReactNode; officeOnly?: boolean }[] = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Übersicht</Link> },
  { key: '/projects', icon: <ProjectOutlined />, label: <Link to="/projects">Projekte</Link> },
  { key: '/time', icon: <ClockCircleOutlined />, label: <Link to="/time">Zeiten</Link> },
  { key: '/quotes', icon: <FileDoneOutlined />, label: <Link to="/quotes">Angebote</Link>, officeOnly: true },
  { key: '/orders', icon: <SolutionOutlined />, label: <Link to="/orders">Aufträge</Link>, officeOnly: true },
  {
    key: '/invoices',
    icon: <AuditOutlined />,
    label: <Link to="/invoices">Rechnungen</Link>,
    officeOnly: true,
  },
  { key: '/reports', icon: <FileTextOutlined />, label: <Link to="/reports">Berichte</Link> },
  { key: '/contacts', icon: <ContactsOutlined />, label: <Link to="/contacts">Kontakte</Link> },
  { key: '/catalog', icon: <ToolOutlined />, label: <Link to="/catalog">Leistungen &amp; Artikel</Link> },
  { key: '/company', icon: <SettingOutlined />, label: <Link to="/company">Firmenprofil</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Nutzer &amp; Rollen</Link> },
];

// App shell. Desktop: fixed sidebar. Phone/tablet: top bar with a hamburger button that opens the
// navigation as a drawer, so the content gets the full screen width.
export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const compact = useIsCompact();
  const phone = useIsPhone();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isOffice = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const menuItems = MENU_ITEMS.filter((item) => !item.officeOnly || isOffice);
  const path = location.pathname;
  const selectedKey =
    menuItems
      .map((item) => item.key)
      .filter((key) => key !== '/')
      .find((key) => path.startsWith(key)) ?? path;

  // Close the drawer after every navigation.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  function handleLogout() {
    signOut();
    navigate('/login');
  }

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      // Only pass what Menu understands: our own officeOnly flag must not reach the DOM element
      items={menuItems.map(({ key, icon, label }) => ({ key, icon, label }))}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!compact && (
        <Sider>
          <div style={{ color: 'white', padding: 16, fontWeight: 'bold', fontSize: 18 }}>Meisterwerk</div>
          {menu}
        </Sider>
      )}
      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: compact ? 'space-between' : 'flex-end',
            alignItems: 'center',
            padding: phone ? '0 12px' : '0 24px',
            position: compact ? 'sticky' : undefined,
            top: 0,
            zIndex: 10,
          }}
        >
          {compact && (
            <Button
              type="text"
              size="large"
              aria-label="Menü"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!phone && (
              <Typography.Text>
                {user?.firstName} {user?.lastName}
              </Typography.Text>
            )}
            <Button
              type="text"
              size="large"
              aria-label="Abmelden"
              title="Abmelden"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            />
          </div>
        </Header>
        <Content style={{ margin: phone ? 12 : 24, minWidth: 0 }}>
          <Outlet />
        </Content>
      </Layout>

      {compact && (
        <Drawer
          placement="left"
          width={260}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          title={<span style={{ color: 'white' }}>Meisterwerk</span>}
          styles={{
            header: { background: '#001529', borderBottom: '1px solid #1f2d3d' },
            body: { padding: 0, background: '#001529' },
          }}
        >
          {menu}
        </Drawer>
      )}
    </Layout>
  );
}
