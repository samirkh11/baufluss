import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Form, InputNumber, Row, Switch, message } from 'antd';
import { getDunningSettings, updateDunningSettings } from '../api/dunning';
import { apiErrorMessage } from '../utils/assets';

// Company-wide dunning rules (Firmenprofil > Mahnwesen).
export function DunningSettingsPanel() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { data } = useQuery({ queryKey: ['dunning', 'settings'], queryFn: getDunningSettings });

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        ...data,
        feeFirst: Number(data.feeFirst),
        feeSecond: Number(data.feeSecond),
        feeFinal: Number(data.feeFinal),
        baseRatePercent: Number(data.baseRatePercent),
        lumpSumB2B: Number(data.lumpSumB2B),
      });
    }
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: updateDunningSettings,
    onSuccess: () => {
      message.success('Mahnwesen gespeichert.');
      queryClient.invalidateQueries({ queryKey: ['dunning'] });
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  return (
    <Card>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Basiszinssatz aktuell halten"
        description="Der Basiszinssatz der Bundesbank ändert sich zum 1.1. und 1.7. Verzugszinsen = Basiszinssatz + 9 Prozentpunkte (Unternehmer) bzw. + 5 Prozentpunkte (Verbraucher), § 288 BGB."
      />
      <Form layout="vertical" form={form} onFinish={(values) => saveMutation.mutate(values)}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="reminderAfterDays" label="Zahlungserinnerung vorschlagen nach (Tage über Fälligkeit)">
              <InputNumber min={0} max={60} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="graceDays" label="Zahlungsfrist je Schreiben (Tage)">
              <InputNumber min={1} max={60} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="feeFirst" label="Mahngebühr 1. Mahnung (€)">
              <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="feeSecond" label="Mahngebühr 2. Mahnung (€)">
              <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="feeFinal" label="Mahngebühr letzte Mahnung (€)">
              <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="interestEnabled" label="Verzugszinsen berechnen" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="baseRatePercent" label="Basiszinssatz (%)">
              <InputNumber precision={3} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="lumpSumB2B" label="Verzugspauschale Unternehmer (€)">
              <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
          Speichern
        </Button>
      </Form>
    </Card>
  );
}
