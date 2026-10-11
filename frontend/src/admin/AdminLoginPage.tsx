import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from './adminApi';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 16, boxSizing: 'border-box' }}>
      <Card style={{ width: 400, maxWidth: '100%' }}>
        <Typography.Title level={3}>Betreiber-Anmeldung</Typography.Title>
        <Typography.Paragraph type="secondary">Nur für Mitarbeiter des Plattformbetreibers.</Typography.Paragraph>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form
          layout="vertical"
          onFinish={async (values: { email: string; password: string }) => {
            setError(null);
            setLoading(true);
            try {
              await adminLogin(values.email, values.password);
              navigate('/admin');
            } catch {
              setError('E-Mail oder Passwort ist falsch.');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="email" label="E-Mail" rules={[{ required: true, type: 'email' }]}><Input autoComplete="username" /></Form.Item>
          <Form.Item name="password" label="Passwort" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>Anmelden</Button>
        </Form>
      </Card>
    </div>
  );
}
