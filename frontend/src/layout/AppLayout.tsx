import { ReactNode } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  ContactsOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  ProjectOutlined,
  SettingOutlined,
  TeamOutlined,
  LogoutOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const { Header, Sider, Content } = Layout;

// Only menu items for modules that actually exist are listed here. Add an entry once the
// corresponding feature module (Kontakte, Projekte, Angebote, ...) is implemented — see
// /.claude/memory/project_roadmap.md for the planned order.
// `officeOnly` entries are shown to OWNER/ADMIN only (documents contain prices and customer data).
const MENU_ITEMS: { key: string; icon: ReactNode; label: ReactNode; officeOnly?: boolean }[] = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Übersicht</Link> },
  { key: '/projects', icon: <ProjectOutlined />, label: <Link to="/projects">Projekte</Link> },
  { key: '/quotes', icon: <FileDoneOutlined />, label: <Link to="/quotes">Angebote</Link>, officeOnly: true },
  { key: '/reports', icon: <FileTextOutlined />, label: <Link to="/reports">Berichte</Link> },
  { key: '/contacts', icon: <ContactsOutlined />, label: <Link to="/contacts">Kontakte</Link> },
  { key: '/catalog', icon: <ToolOutlined />, label: <Link to="/catalog">Leistungen &amp; Artikel</Link> },
  { key: '/company', icon: <SettingOutlined />, label: <Link to="/company">Firmenprofil</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Nutzer &amp; Rollen</Link> },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isOffice = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const menuItems = MENU_ITEMS.filter((item) => !item.officeOnly || isOffice);
  // The document editor belongs to the quotes menu entry.
  const path = location.pathname.startsWith('/documents') ? '/quotes' : location.pathname;

  function handleLogout() {
    signOut();
    navigate('/login');
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{ color: 'white', padding: 16, fontWeight: 'bold', fontSize: 18 }}>Meisterwerk</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[
            menuItems
              .map((item) => item.key)
              .filter((key) => key !== '/')
              .find((key) => path.startsWith(key)) ?? path,
          ]}
          // Only pass what Menu understands: our own officeOnly flag must not reach the DOM element
          items={menuItems.map(({ key, icon, label }) => ({ key, icon, label }))}
        />
      </Sider>
      <Layout>
        <Header
          style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
        >
          <Typography.Text style={{ marginRight: 16 }}>
            {user?.firstName} {user?.lastName}
          </Typography.Text>
          <LogoutOutlined onClick={handleLogout} style={{ cursor: 'pointer' }} title="Abmelden" />
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
