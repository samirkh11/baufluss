import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { apiErrorMessage } from '../utils/assets';
import { formatMoney } from '../utils/labels';
import { createPlan, listPlans, Plan, updatePlan } from './adminApi';

// Subscription plans: price per month, user limit, availability.
export function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [form] = Form.useForm();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'plans'], queryFn: listPlans });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => (editing === 'new' ? createPlan(values as never) : updatePlan((editing as Plan).id, values as never)),
    onSuccess: () => {
      message.success('Tarif gespeichert.');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  const open = (plan: Plan | 'new') => {
    setEditing(plan);
    form.resetFields();
    if (plan !== 'new') form.setFieldsValue({ ...plan, priceMonthly: Number(plan.priceMonthly) });
    else form.setFieldsValue({ isActive: true, sortOrder: (data?.length ?? 0) + 1, priceMonthly: 0 });
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Tarife</Typography.Title>
        <Button type="primary" onClick={() => open('new')} data-testid="plan-new">Neuer Tarif</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Tarif', render: (_, plan: Plan) => <strong>{plan.name}</strong> },
          { title: 'Schlüssel', dataIndex: 'key', responsive: ['md'] },
          { title: 'Preis / Monat (netto)', align: 'right', render: (_, plan) => formatMoney(plan.priceMonthly) },
          { title: 'Nutzer', render: (_, plan) => plan.maxUsers ?? 'unbegrenzt' },
          { title: 'Mandanten', align: 'right', render: (_, plan) => plan._count?.companies ?? 0 },
          { title: 'Buchbar', render: (_, plan) => (plan.isActive ? <Tag color="green">ja</Tag> : <Tag>nein</Tag>) },
          { title: '', render: (_, plan) => <Button size="small" onClick={() => open(plan)}>Bearbeiten</Button> },
        ]}
      />
      <Modal open={!!editing} title={editing === 'new' ? 'Neuer Tarif' : 'Tarif bearbeiten'} okText="Speichern" cancelText="Abbrechen" onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={save.isPending} forceRender>
        <Form layout="vertical" form={form} onFinish={(values) => save.mutate(values)}>
          <Form.Item name="key" label="Schlüssel (dauerhaft, z. B. business)" rules={[{ required: editing === 'new', pattern: /^[a-z0-9-]{2,30}$/, message: 'Kleinbuchstaben, Ziffern, Bindestrich' }]}><Input disabled={editing !== 'new'} /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Beschreibung"><Input /></Form.Item>
          <Form.Item name="priceMonthly" label="Preis pro Monat (netto, €)" rules={[{ required: true }]}><InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="maxUsers" label="Maximale aktive Nutzer (leer = unbegrenzt)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="sortOrder" label="Reihenfolge"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="isActive" label="Buchbar" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
