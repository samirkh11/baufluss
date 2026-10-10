import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tabs, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { createCatalogItem, CatalogItemPayload, deleteCatalogItem, listCatalogItems, updateCatalogItem } from '../api/catalog';
import { CatalogItem, CatalogItemKind } from '../types';

const KIND_LABELS: Record<CatalogItemKind, string> = { SERVICE: 'Leistungen', ARTICLE: 'Artikel' };
const NON_NULLABLE_FIELDS = ['kind', 'name', 'unit', 'netPrice', 'vatRate'];
const UNIT_OPTIONS = ['Stk', 'h', 'm', 'm²', 'm³', 'kg', 'l', 'psch'].map((value) => ({ value }));

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Form works with numbers; the API returns decimal strings.
type FormValues = Omit<CatalogItemPayload, 'isActive'>;

export function CatalogPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CatalogItemKind>('SERVICE');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const params = { q: search || undefined, kind, includeInactive: showArchived, page };
  const { data, isLoading } = useQuery({
    queryKey: ['catalog-items', params],
    queryFn: () => listCatalogItems(params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog-items'] });

  const saveMutation = useMutation({
    mutationFn: (values: CatalogItemPayload) => (editing ? updateCatalogItem(editing.id, values) : createCatalogItem(values)),
    onSuccess: () => {
      message.success('Gespeichert.');
      closeModal();
      refresh();
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.message;
      message.error(Array.isArray(detail) ? detail.join(', ') : (detail ?? 'Speichern fehlgeschlagen.'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateCatalogItem(id, { isActive }),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({ mutationFn: deleteCatalogItem, onSuccess: refresh });

  function openModal(item: CatalogItem | null) {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue(
      item
        ? {
            kind: item.kind,
            sku: item.sku ?? undefined,
            name: item.name,
            description: item.description ?? undefined,
            unit: item.unit,
            netPrice: Number(item.netPrice),
            purchasePrice: item.purchasePrice === null ? undefined : Number(item.purchasePrice),
            vatRate: Number(item.vatRate),
          }
        : { kind, unit: kind === 'SERVICE' ? 'h' : 'Stk', vatRate: 19 },
    );
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  // See ContactsPage: cleared optional fields must be sent as null on update to remove the value.
  function handleFinish(values: FormValues) {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const isEmpty = value === '' || value === undefined || value === null;
      if (!isEmpty) {
        payload[key] = value;
      } else if (editing && !NON_NULLABLE_FIELDS.includes(key)) {
        payload[key] = null;
      }
    }
    saveMutation.mutate(payload as CatalogItemPayload);
  }

  return (
    <div>
      <Tabs
        activeKey={kind}
        onChange={(key) => {
          setKind(key as CatalogItemKind);
          setPage(1);
        }}
        items={(Object.keys(KIND_LABELS) as CatalogItemKind[]).map((k) => ({ key: k, label: KIND_LABELS[k] }))}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          {kind === 'SERVICE' ? 'Neue Leistung' : 'Neuer Artikel'}
        </Button>
        <Input.Search
          placeholder="Suchen (Name, Nr.)"
          allowClear
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          style={{ width: 280 }}
        />
        <Checkbox
          checked={showArchived}
          onChange={(e) => {
            setShowArchived(e.target.checked);
            setPage(1);
          }}
        >
          Archivierte anzeigen
        </Checkbox>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: data?.pageSize ?? 25, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Nr.', dataIndex: 'sku', width: 100 },
          { title: 'Bezeichnung', render: (_, item) => <a onClick={() => openModal(item)}>{item.name}</a> },
          { title: 'Einheit', dataIndex: 'unit', width: 90 },
          { title: 'Netto', dataIndex: 'netPrice', align: 'right', render: (v: string) => euro.format(Number(v)) },
          { title: 'EK netto', dataIndex: 'purchasePrice', align: 'right', render: (v: string | null) => (v === null ? '' : euro.format(Number(v))) },
          { title: 'USt', dataIndex: 'vatRate', align: 'right', render: (v: string) => `${Number(v)} %` },
          {
            title: '',
            render: (_, item) => (
              <Space>
                <Button size="small" onClick={() => archiveMutation.mutate({ id: item.id, isActive: !item.isActive })}>
                  {item.isActive ? 'Archivieren' : 'Reaktivieren'}
                </Button>
                <Popconfirm title="Endgültig löschen?" onConfirm={() => deleteMutation.mutate(item.id)}>
                  <Button danger size="small">
                    Löschen
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? 'Bearbeiten' : kind === 'SERVICE' ? 'Neue Leistung' : 'Neuer Artikel'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={640}
        destroyOnClose
      >
        <Form layout="vertical" form={form} onFinish={handleFinish}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="kind" label="Art" rules={[{ required: true }]}>
                <Select options={(Object.keys(KIND_LABELS) as CatalogItemKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="sku" label="Nummer">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="name" label="Bezeichnung" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Beschreibung">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="unit" label="Einheit" rules={[{ required: true }]}>
                <Select showSearch options={UNIT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="netPrice" label="Preis netto (€)" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} precision={2} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="purchasePrice" label="EK netto (€)">
                <InputNumber min={0} step={0.01} precision={2} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="vatRate" label="USt (%)" rules={[{ required: true }]}>
                <Select options={[19, 7, 0].map((value) => ({ value, label: `${value} %` }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
