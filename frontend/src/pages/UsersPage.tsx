import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { useState } from 'react';
import {
  createUser,
  CreateUserPayload,
  deleteUser,
  listUsers,
  removeUserImage,
  setUserImage,
  updateUser,
} from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { ImageUpload } from '../components/ImageUpload';
import { apiErrorMessage } from '../utils/assets';
import { CompanyUser } from '../types';

const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Inhaber' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'MEMBER', label: 'Mitarbeiter' },
];

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const { user: currentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<Partial<CreateUserPayload>>();

  // Mirrors the backend rules (which are authoritative): only OWNER/ADMIN manage users, and
  // ADMINs may not touch OWNER accounts or grant the OWNER role.
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const isOwner = currentUser?.role === 'OWNER';
  const canEdit = (target: CompanyUser) => canManage && (isOwner || target.role !== 'OWNER');
  const roleOptions = ROLE_OPTIONS.map((option) => ({
    ...option,
    disabled: option.value === 'OWNER' && !isOwner,
  }));

  // Derived from the list so the picture in the dialog updates right after an upload.
  const editing = users?.find((candidate) => candidate.id === editingId) ?? null;

  function openModal(target: CompanyUser | null) {
    setEditingId(target?.id ?? null);
    form.resetFields();
    form.setFieldsValue(
      target
        ? { firstName: target.firstName, lastName: target.lastName, email: target.email, role: target.role }
        : { role: 'MEMBER' },
    );
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  const saveMutation = useMutation({
    mutationFn: (values: Partial<CreateUserPayload>) => {
      if (!editing) {
        return createUser(values as CreateUserPayload);
      }
      // An empty password field means "keep the current password".
      const { password, ...rest } = values;
      return updateUser(editing.id, password ? { ...rest, password } : rest);
    },
    onSuccess: () => {
      message.success('Nutzer gespeichert.');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateUser(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (error) => message.error(apiErrorMessage(error, 'Änderung fehlgeschlagen.')),
  });

  const removeImageMutation = useMutation({
    mutationFn: removeUserImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (error) => message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  return (
    <div>
      {canManage && (
        <Button type="primary" onClick={() => openModal(null)} style={{ marginBottom: 16 }}>
          Nutzer einladen
        </Button>
      )}

      <Table
        rowKey="id"
        dataSource={users}
        columns={[
          {
            title: '',
            width: 64,
            render: (_, record) => (
              <ImageUpload
                compact
                size={40}
                path={record.imagePath}
                onUpload={async (file) => {
                  await setUserImage(record.id, file);
                  await queryClient.invalidateQueries({ queryKey: ['users'] });
                }}
                onRemove={async () => {
                  await removeUserImage(record.id);
                  await queryClient.invalidateQueries({ queryKey: ['users'] });
                }}
              />
            ),
          },
          {
            title: 'Name',
            render: (_, record) =>
              canEdit(record) ? (
                <a onClick={() => openModal(record)}>
                  {record.firstName} {record.lastName}
                </a>
              ) : (
                `${record.firstName} ${record.lastName}`
              ),
          },
          { title: 'E-Mail', dataIndex: 'email' },
          {
            title: 'Rolle',
            dataIndex: 'role',
            render: (role: string) => <Tag>{ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role}</Tag>,
          },
          {
            title: 'Aktiv',
            dataIndex: 'isActive',
            render: (isActive: boolean, record) => (
              <Switch
                disabled={!canEdit(record) || record.id === currentUser?.id}
                checked={isActive}
                onChange={(checked) =>
                  toggleActiveMutation.mutate({
                    id: record.id,
                    isActive: checked,
                  })
                }
              />
            ),
          },
          {
            title: '',
            render: (_, record) =>
              canEdit(record) && (
                <Space>
                  <Button size="small" onClick={() => openModal(record)}>
                    Bearbeiten
                  </Button>
                  {record.imagePath && (
                    <Button size="small" onClick={() => removeImageMutation.mutate(record.id)}>
                      Bild löschen
                    </Button>
                  )}
                  {record.id !== currentUser?.id && (
                    <Popconfirm title="Nutzer entfernen?" onConfirm={() => deleteMutation.mutate(record.id)}>
                      <Button danger size="small">
                        Entfernen
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
          },
        ]}
      />

      <Modal
        title={editing ? 'Nutzer bearbeiten' : 'Neuen Nutzer anlegen'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
      >
        {editing && (
          <Form.Item label="Bild">
            <ImageUpload
              path={editing.imagePath}
              onUpload={async (file) => {
                await setUserImage(editing.id, file);
                await queryClient.invalidateQueries({ queryKey: ['users'] });
              }}
              onRemove={async () => {
                await removeUserImage(editing.id);
                await queryClient.invalidateQueries({ queryKey: ['users'] });
              }}
            />
          </Form.Item>
        )}
        <Form layout="vertical" form={form} onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="firstName" label="Vorname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Nachname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="E-Mail" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? 'Neues Passwort (leer lassen = unverändert)' : 'Initialpasswort'}
            rules={[{ required: !editing, min: 8, message: 'Mindestens 8 Zeichen' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="Rolle">
            <Select options={roleOptions} disabled={editing?.id === currentUser?.id} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
