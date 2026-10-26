import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { AuthShell } from '../components/AuthShell';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from './adminApi';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell title="Betreiber-Anmeldung" subtitle="Nur für Mitarbeiter des Plattformbetreibers.">
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
    </AuthShell>
  );
}
