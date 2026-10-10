import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Popconfirm, Select, Switch, Table, message } from 'antd';
import {
  deleteNumberSequence,
  listNumberSequences,
  upsertNumberSequence,
  UpsertNumberSequencePayload,
} from '../api/numberSequences';

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'QUOTE', label: 'Angebot' },
  { value: 'ORDER', label: 'Auftragsbestätigung' },
  { value: 'INVOICE', label: 'Rechnung' },
  { value: 'CREDIT_NOTE', label: 'Gutschrift' },
  { value: 'REPORT', label: 'Bericht' },
];

export function NumberSequencesPanel() {
  const queryClient = useQueryClient();
  const { data: sequences } = useQuery({ queryKey: ['number-sequences'], queryFn: listNumberSequences });
  const [form] = Form.useForm<UpsertNumberSequencePayload>();

  const upsertMutation = useMutation({
    mutationFn: upsertNumberSequence,
    onSuccess: () => {
      message.success('Nummernkreis gespeichert.');
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['number-sequences'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNumberSequence,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['number-sequences'] }),
  });

  return (
    <div>
      <Form layout="inline" form={form} onFinish={(values) => upsertMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="documentType" rules={[{ required: true }]}>
          <Select placeholder="Dokumenttyp" options={DOCUMENT_TYPE_OPTIONS} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="prefix">
          <Input placeholder="Präfix, z.B. RE-" />
        </Form.Item>
        <Form.Item name="nextNumber">
          <InputNumber placeholder="Nächste Nummer" min={1} />
        </Form.Item>
        <Form.Item name="digits">
          <InputNumber placeholder="Stellen" min={1} max={10} />
        </Form.Item>
        <Form.Item name="resetYearly" valuePropName="checked" label="Jährlich zurücksetzen">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={upsertMutation.isPending}>
          Speichern
        </Button>
      </Form>

      <Table
        rowKey="id"
        dataSource={sequences}
        pagination={false}
        columns={[
          {
            title: 'Dokumenttyp',
            dataIndex: 'documentType',
            render: (value: string) => DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value,
          },
          { title: 'Präfix', dataIndex: 'prefix' },
          { title: 'Nächste Nummer', dataIndex: 'nextNumber' },
          { title: 'Stellen', dataIndex: 'digits' },
          { title: 'Jährlich zurücksetzen', dataIndex: 'resetYearly', render: (v: boolean) => (v ? 'Ja' : 'Nein') },
          {
            title: '',
            render: (_, record) => (
              <Popconfirm title="Nummernkreis löschen?" onConfirm={() => deleteMutation.mutate(record.documentType)}>
                <Button danger size="small">
                  Löschen
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  );
}
