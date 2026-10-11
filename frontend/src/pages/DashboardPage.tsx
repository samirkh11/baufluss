import { Typography } from 'antd';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <Typography.Title level={3}>Willkommen, {user?.firstName}!</Typography.Title>
      <Typography.Paragraph>
        Weitere Module (Kontakte, Projekte, Angebote, Rechnungen, Eingangsrechnungen, E-Rechnung) folgen in
        den nächsten Ausbaustufen.
      </Typography.Paragraph>
    </div>
  );
}
