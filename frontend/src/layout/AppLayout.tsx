import { ReactNode, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Layout, Menu, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getOwnCompany } from '../api/companies';
import {
  InboxOutlined,
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
import { PageFallback } from '../components/PageFallback';
import { useAuth } from '../auth/useAuth';
import { useIsCompact, useIsPhone } from '../hooks/useMediaQuery';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { BrandLogo } from '../components/BrandLogo';
import { layout } from '../theme/tokens';

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
  { key: '/incoming-invoices', icon: <InboxOutlined />, label: <Link to="/incoming-invoices">Eingangsrechnungen</Link>, officeOnly: true },
  { key: '/reports', icon: <FileTextOutlined />, label: <Link to="/reports">Berichte</Link> },
  { key: '/contacts', icon: <ContactsOutlined />, label: <Link to="/contacts">Kontakte</Link> },
  { key: '/catalog', icon: <ToolOutlined />, label: <Link to="/catalog">Leistungen &amp; Artikel</Link> },
  { key: '/company', icon: <SettingOutlined />, label: <Link to="/company">Firmenprofil</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Nutzer &amp; Rollen</Link> },
];

// Phone only: the four destinations used on site, always one tap away (thumb zone). Everything
// else stays reachable through the "Menü" drawer. Plain links (not menu items) on purpose.
const BOTTOM_NAV: { to: string; icon: ReactNode; label: string }[] = [
  { to: '/', icon: <DashboardOutlined />, label: 'Übersicht' },
  { to: '/projects', icon: <ProjectOutlined />, label: 'Projekte' },
  { to: '/time', icon: <ClockCircleOutlined />, label: 'Zeiten' },
  { to: '/reports', icon: <FileTextOutlined />, label: 'Berichte' },
];

// App shell. Desktop: fixed sidebar on the brand gradient (Figma). Tablet: top bar with a hamburger
// button that opens the navigation as a drawer. Phone: additionally a bottom tab bar.
export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const compact = useIsCompact();
  const phone = useIsPhone();
  const online = useOnlineStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isOffice = user?.role === 'OWNER' || user?.role === 'ADMIN';
  // Trial hint for the office: how long the free trial still runs.
  const { data: company } = useQuery({ queryKey: ['company'], queryFn: getOwnCompany, enabled: isOffice && !user?.impersonatedBy });
  const trialDaysLeft = company?.status === 'TRIAL' && company.trialEndsAt ? Math.ceil((new Date(company.trialEndsAt).getTime() - Date.now()) / 86400000) : null;
  const menuItems = MENU_ITEMS.filter((item) => !item.officeOnly || isOffice);
  // Credit notes (Stornorechnungen) live under the invoices menu entry.
  const path = location.pathname.startsWith('/credit-notes') ? '/invoices' : location.pathname;
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
      className="mw-nav"
      selectedKeys={[selectedKey]}
      // Only pass what Menu understands: our own officeOnly flag must not reach the DOM element
      items={menuItems.map(({ key, icon, label }) => ({ key, icon, label }))}
    />
  );

  const userCard = (
    <div className="mw-user-card">
      <div className="mw-user-avatar" aria-hidden="true">
        {user?.firstName?.[0]}
        {user?.lastName?.[0]}
      </div>
      <div className="mw-user-text">
        <div className="mw-user-name">
          {user?.firstName} {user?.lastName}
        </div>
        <div className="mw-user-email">{user?.email}</div>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!compact && (
        <Sider width={layout.sidebarWidth} className="mw-sider">
          <div className="mw-sider-inner">
            <div className="mw-sider-logo">
              <BrandLogo inverse />
            </div>
            <nav aria-label="Hauptnavigation" className="mw-sider-nav">
              {menu}
            </nav>
            {userCard}
          </div>
        </Sider>
      )}
      <Layout style={{ minWidth: 0 }}>
        <Header
          className="mw-header"
          style={{
            justifyContent: compact ? 'space-between' : 'flex-end',
            padding: phone ? '0 12px' : '0 24px',
            position: compact ? 'sticky' : undefined,
          }}
        >
          {compact && (
            <>
              <Button type="text" size="large" aria-label="Menü" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
              <BrandLogo size={18} />
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!compact && (
              <Typography.Text>
                {user?.firstName} {user?.lastName}
              </Typography.Text>
            )}
            <Button type="text" size="large" aria-label="Abmelden" title="Abmelden" icon={<LogoutOutlined />} onClick={handleLogout} />
          </div>
        </Header>
        {!online && (
          <Alert
            type="warning"
            banner
            data-testid="offline-banner"
            message="Keine Verbindung. Angezeigte Daten können veraltet sein; Änderungen werden erst gespeichert, wenn Sie wieder online sind."
          />
        )}
        {user?.impersonatedBy && (
          <Alert
            type="warning"
            banner
            data-testid="support-banner"
            message={`Support-Zugriff als ${user.firstName} ${user.lastName} (${user.impersonatedBy}). Alle Aktionen werden protokolliert.`}
            action={
              <Button
                size="small"
                onClick={() => {
                  signOut();
                  navigate('/admin/companies');
                }}
              >
                Beenden
              </Button>
            }
          />
        )}
        {trialDaysLeft !== null && (
          <Alert type="info" banner showIcon data-testid="trial-banner" message={trialDaysLeft > 0 ? `Testphase: noch ${trialDaysLeft} Tag(e) (bis ${new Date(company!.trialEndsAt!).toLocaleDateString('de-DE')}).` : 'Die Testphase ist abgelaufen.'} />
        )}
        <Content className={phone ? 'mw-content mw-content--phone' : 'mw-content'}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>

      {compact && (
        <Drawer
          placement="left"
          width={layout.drawerWidth}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          rootClassName="mw-nav-drawer"
          title={<BrandLogo inverse />}
        >
          <nav aria-label="Hauptnavigation">{menu}</nav>
          {userCard}
        </Drawer>
      )}

      {phone && (
        <nav className="mw-bottom-nav" aria-label="Schnellnavigation">
          {BOTTOM_NAV.map((item) => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={active ? 'mw-bottom-nav-item is-active' : 'mw-bottom-nav-item'} aria-current={active ? 'page' : undefined}>
                <span className="mw-bottom-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </Layout>
  );
}
