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
import { ImageUpload } from '../components/ImageUpload';

const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Inhaber' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'MEMBER', label: 'Mitarbeiter' },
];

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CreateUserPayload>();

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success('Nutzer angelegt.');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateUser(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const removeImageMutation = useMutation({
    mutationFn: removeUserImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      <Button type="primary" onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>
        Nutzer einladen
      </Button>

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
            render: (_, record) => `${record.firstName} ${record.lastName}`,
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
            render: (_, record) => (
              <Space>
                {record.imagePath && (
                  <Button size="small" onClick={() => removeImageMutation.mutate(record.id)}>
                    Bild löschen
                  </Button>
                )}
                <Popconfirm title="Nutzer entfernen?" onConfirm={() => deleteMutation.mutate(record.id)}>
                  <Button danger size="small">
                    Entfernen
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Neuen Nutzer anlegen"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" form={form} onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="firstName" label="Vorname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Nachname" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="E-Mail" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Initialpasswort" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Rolle" initialValue="MEMBER">
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
