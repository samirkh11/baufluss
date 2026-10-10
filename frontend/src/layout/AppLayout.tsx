import { Layout, Menu, Typography } from 'antd';
import { DashboardOutlined, SettingOutlined, TeamOutlined, LogoutOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const { Header, Sider, Content } = Layout;

// Only menu items for modules that actually exist are listed here. Add an entry once the
// corresponding feature module (Kontakte, Projekte, Angebote, ...) is implemented — see
// /.claude/memory/project_roadmap.md for the planned order.
const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Übersicht</Link> },
  { key: '/company', icon: <SettingOutlined />, label: <Link to="/company">Firmenprofil</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Nutzer &amp; Rollen</Link> },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    signOut();
    navigate('/login');
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{ color: 'white', padding: 16, fontWeight: 'bold', fontSize: 18 }}>Meisterwerk</div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={MENU_ITEMS} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
