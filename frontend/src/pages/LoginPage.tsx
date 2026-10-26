import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { AuthShell } from '../components/AuthShell';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish(values: { email: string; password: string }) {
    setError(null);
    setLoading(true);
    try {
      const response = await login(values);
      signIn(response.accessToken, response.user);
      navigate('/');
    } catch (caught) {
      // 403 carries the reason (suspended account, expired trial); everything else is a plain credentials error
      const response = (caught as { response?: { status?: number; data?: { message?: string } } }).response;
      setError(response?.status === 403 && response.data?.message ? response.data.message : 'E-Mail oder Passwort ist falsch.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Anmelden" subtitle="Willkommen zurück – bitte melden Sie sich an.">
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={handleFinish}>
        <Form.Item name="email" label="E-Mail" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item name="password" label="Passwort" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          Anmelden
        </Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
        Noch kein Konto? <Link to="/register">Firma registrieren</Link>
      </Typography.Paragraph>
    </AuthShell>
  );
}
