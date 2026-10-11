import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Form, Input, InputNumber, Row, Statistic, Tabs, Typography, message } from 'antd';
import { apiErrorMessage } from '../utils/assets';
import { getSettings, getSystem, updateSettings } from './adminApi';

const duration = (seconds: number) => (seconds >= 86400 ? `${Math.floor(seconds / 86400)} Tage` : seconds >= 3600 ? `${Math.floor(seconds / 3600)} Std.` : `${Math.floor(seconds / 60)} Min.`);

// System health of the platform and the operator settings (sender data of customer invoices, trial length, VAT).
export function AdminSystemPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { data: system } = useQuery({ queryKey: ['admin', 'system'], queryFn: getSystem, refetchInterval: 30000 });
  const { data: settings } = useQuery({ queryKey: ['admin', 'settings'], queryFn: getSettings });
  useEffect(() => {
    if (settings) form.setFieldsValue({ ...settings, vatRate: Number(settings.vatRate) });
  }, [settings, form]);
  const save = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      message.success('Einstellungen gespeichert.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  return (
    <div>
      <Typography.Title level={3}>System</Typography.Title>
      <Tabs
        items={[
          {
            key: 'health',
            label: 'Zustand',
            children: system && (
              <Row gutter={[16, 16]}>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Status" value={system.status === 'ok' ? 'OK' : system.status} valueStyle={{ color: '#389e0d' }} data-testid="system-status" /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Laufzeit" value={duration(system.uptimeSeconds)} /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Datenbank-Antwort" value={system.db.latencyMs} suffix="ms" /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Speicher (Server)" value={system.memoryMb} suffix="MB" /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Datenbankgröße" value={system.db.sizeMb} suffix="MB" /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Dateien (Uploads / Archiv)" value={`${system.files.uploadsMb} / ${system.files.storageMb}`} suffix="MB" /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Nutzer gesamt" value={system.totals.users} /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Belege / archiviert" value={`${system.totals.documents} / ${system.totals.archivedFiles}`} /></Card></Col>
                <Col span={24}><Typography.Text type="secondary">Node {system.node} · Serverzeit {new Date(system.time).toLocaleString('de-DE')}</Typography.Text></Col>
              </Row>
            ),
          },
          {
            key: 'settings',
            label: 'Betreiber-Einstellungen',
            forceRender: true, // the form must exist before the settings are loaded into it
            children: (
              <Card>
                <Form layout="vertical" form={form} onFinish={(values) => save.mutate(values)}>
                  <Row gutter={16}>
                    <Col xs={24} md={12}><Form.Item name="operatorName" label="Firmenname des Betreibers" rules={[{ required: true }]}><Input /></Form.Item></Col>
                    <Col xs={24} md={12}><Form.Item name="email" label="E-Mail für Rechnungen"><Input /></Form.Item></Col>
                    <Col xs={24} md={12}><Form.Item name="street" label="Straße"><Input /></Form.Item></Col>
                    <Col xs={8} md={4}><Form.Item name="zipCode" label="PLZ"><Input /></Form.Item></Col>
                    <Col xs={16} md={8}><Form.Item name="city" label="Ort"><Input /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="vatId" label="USt-IdNr."><Input /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="taxId" label="Steuernummer"><Input /></Form.Item></Col>
                    <Col xs={16} md={8}><Form.Item name="iban" label="IBAN"><Input /></Form.Item></Col>
                    <Col xs={8} md={4}><Form.Item name="bic" label="BIC"><Input /></Form.Item></Col>
                    <Col xs={8} md={6}><Form.Item name="trialDays" label="Testphase (Tage)"><InputNumber min={0} max={365} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={8} md={6}><Form.Item name="vatRate" label="USt-Satz (%)"><InputNumber min={0} max={30} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={8} md={6}><Form.Item name="paymentTermDays" label="Zahlungsziel (Tage)"><InputNumber min={0} max={120} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={24} md={6}><Form.Item name="defaultPlanKey" label="Standard-Tarif bei Anmeldung (Schlüssel)"><Input /></Form.Item></Col>
                  </Row>
                  <Button type="primary" htmlType="submit" loading={save.isPending}>Speichern</Button>
                </Form>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
