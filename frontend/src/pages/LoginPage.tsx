import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

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
    } catch {
      setError('E-Mail oder Passwort ist falsch.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3}>Meisterwerk Login</Typography.Title>
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
      </Card>
    </div>
  );
}
