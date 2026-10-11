import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { registerCompany, RegisterPayload } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../utils/assets';

export function RegisterCompanyPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish(values: RegisterPayload) {
    setError(null);
    setLoading(true);
    try {
      const response = await registerCompany(values);
      signIn(response.accessToken, response.user);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err, 'Registrierung fehlgeschlagen.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <Card style={{ width: 440, maxWidth: '100%' }}>
        <Typography.Title level={3}>Firma registrieren</Typography.Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="companyName" label="Firmenname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="firstName" label="Vorname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Nachname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="E-Mail" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Passwort"
            rules={[{ required: true, min: 8, message: 'Mindestens 8 Zeichen' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Konto erstellen
          </Button>
        </Form>
        <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
          Bereits registriert? <Link to="/login">Anmelden</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
