import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { ContactPrivacyModal } from '../components/ContactPrivacyModal';
import {
  Avatar,
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  createContact,
  deleteContact,
  listContacts,
  removeContactImage,
  setContactImage,
  updateContact,
} from '../api/contacts';
import { ImageUpload } from '../components/ImageUpload';
import { apiErrorMessage, assetUrl } from '../utils/assets';
import { Contact, ContactType } from '../types';

const TYPE_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Kunde',
  SUPPLIER: 'Lieferant',
  SUBCONTRACTOR: 'Subunternehmer',
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as ContactType[]).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

const TAB_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Kunden',
  SUPPLIER: 'Lieferanten',
  SUBCONTRACTOR: 'Subunternehmer',
};

// Columns the database requires to be non-null: when cleared in the form they are left unchanged.
const NON_NULLABLE_FIELDS = ['types', 'isOrganization', 'country'];

function displayName(contact: Contact): string {
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  return contact.organizationName || person || '—';
}

export function ContactsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<ContactType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const isOffice = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const [privacyContact, setPrivacyContact] = useState<Contact | null>(null);
  const [form] = Form.useForm<Partial<Contact>>();

  const params = {
    q: search || undefined,
    type: typeFilter === 'ALL' ? undefined : typeFilter,
    includeInactive: showArchived,
    page,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['contacts', params],
    queryFn: () => listContacts(params),
    placeholderData: keepPreviousData,
  });

  // Derived from the list so the picture shown in the modal updates right after an upload.
  const editing = data?.items.find((contact) => contact.id === editingId) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const saveMutation = useMutation({
    mutationFn: (values: Partial<Contact>) =>
      editing ? updateContact(editing.id, values) : createContact(values),
    onSuccess: () => {
      message.success('Kontakt gespeichert.');
      closeModal();
      refresh();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateContact(id, { isActive }),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({ mutationFn: deleteContact, onSuccess: refresh });

  function openModal(contact: Contact | null) {
    setEditingId(contact?.id ?? null);
    form.resetFields();
    form.setFieldsValue(
      contact ?? {
        types: typeFilter === 'ALL' ? ['CUSTOMER'] : [typeFilter],
        isOrganization: true,
        country: 'DE',
      },
    );
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  // Cleared inputs arrive as '' / undefined / null. When editing they must be sent as null so the
  // stored value is actually removed; when creating they are simply omitted.
  function handleFinish(values: Partial<Contact>) {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const isEmpty = value === '' || value === undefined || value === null;
      if (!isEmpty) {
        payload[key] = value;
      } else if (editing && !NON_NULLABLE_FIELDS.includes(key)) {
        payload[key] = null;
      }
    }
    saveMutation.mutate(payload as Partial<Contact>);
  }

  return (
    <div>
      <Tabs
        activeKey={typeFilter}
        onChange={(key) => {
          setTypeFilter(key as ContactType | 'ALL');
          setPage(1);
        }}
        items={[
          { key: 'ALL', label: 'Alle' },
          ...TYPE_OPTIONS.map((o) => ({ key: o.value, label: TAB_LABELS[o.value] })),
        ]}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          Neuer Kontakt
        </Button>
        <Input.Search
          placeholder="Suchen (Name, Nr., E-Mail, Ort)"
          allowClear
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          style={{ width: 320, maxWidth: '100%' }}
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
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          {
            title: '',
            width: 56,
            render: (_, c) => (
              <Avatar shape="square" src={c.imagePath ? assetUrl(c.imagePath) : undefined}>
                {displayName(c)[0]}
              </Avatar>
            ),
          },
          { title: 'Nr.', responsive: ['md'], dataIndex: 'number', width: 90 },
          { title: 'Name', render: (_, c) => <a onClick={() => openModal(c)}>{displayName(c)}</a> },
          {
            title: 'Rolle',
            dataIndex: 'types',
            render: (types: ContactType[]) => types.map((t) => <Tag key={t}>{TYPE_LABELS[t]}</Tag>),
          },
          {
            title: 'Ort',
            responsive: ['md'],
            render: (_, c) => [c.zipCode, c.city].filter(Boolean).join(' '),
          },
          { title: 'E-Mail', responsive: ['md'], dataIndex: 'email' },
          { title: 'Telefon', render: (_, c) => c.phone || c.mobile },
          {
            title: '',
            render: (_, c) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => archiveMutation.mutate({ id: c.id, isActive: !c.isActive })}
                >
                  {c.isActive ? 'Archivieren' : 'Reaktivieren'}
                </Button>
                {isOffice && (
                  <Button size="small" onClick={() => setPrivacyContact(c)} data-testid={`privacy-${c.number}`}>
                    Datenschutz
                  </Button>
                )}
                <Popconfirm title="Kontakt endgültig löschen?" onConfirm={() => deleteMutation.mutate(c.id)}>
                  <Button danger size="small">
                    Löschen
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <ContactPrivacyModal contact={privacyContact} onClose={() => setPrivacyContact(null)} onChanged={refresh} />
      <Modal
        title={editing ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={720}
        forceRender
      >
        {editing ? (
          <Form.Item label="Bild">
            <ImageUpload
              path={editing.imagePath}
              onUpload={async (file) => {
                await setContactImage(editing.id, file);
                await refresh();
              }}
              onRemove={async () => {
                await removeContactImage(editing.id);
                await refresh();
              }}
            />
          </Form.Item>
        ) : (
          <p style={{ color: '#888' }}>Ein Bild kann nach dem ersten Speichern hinzugefügt werden.</p>
        )}
        <Form layout="vertical" form={form} onFinish={handleFinish}>
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Form.Item
                name="types"
                label="Rolle(n)"
                rules={[{ required: true, message: 'Mindestens eine Rolle wählen' }]}
              >
                <Select mode="multiple" options={TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="number" label="Nummer">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isOrganization" valuePropName="checked">
            <Checkbox>Firma (sonst Privatperson)</Checkbox>
          </Form.Item>
          <Form.Item name="organizationName" label="Firmenname">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Form.Item name="salutation" label="Anrede">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={9}>
              <Form.Item name="firstName" label="Vorname">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={9}>
              <Form.Item name="lastName" label="Nachname">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="street" label="Straße &amp; Hausnummer">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Form.Item name="zipCode" label="PLZ">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="city" label="Ort">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="country" label="Land">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="E-Mail" rules={[{ type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="website" label="Website">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Telefon">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="mobile" label="Mobil">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="vatId" label="USt-IdNr.">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="taxId" label="Steuernummer">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="iban" label="IBAN">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="bic" label="BIC">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="paymentTermDays" label="Zahlungsziel (Tage)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notizen">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
