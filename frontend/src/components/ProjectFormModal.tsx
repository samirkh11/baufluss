import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Col, Form, Input, Modal, Row, Select, message } from 'antd';
import { createProject, ProjectPayload, updateProject } from '../api/projects';
import { listContacts } from '../api/contacts';
import { listUsers } from '../api/users';
import { Project } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { customerName, optionsOf, PROJECT_STATUS, toDateInput } from '../utils/labels';

interface ProjectFormModalProps {
  open: boolean;
  // null = create a new project
  project: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

// Dialog for creating and editing a project (used by the project list and the project detail page).
export function ProjectFormModal({ open, project, onClose, onSaved }: ProjectFormModalProps) {
  const [form] = Form.useForm();

  // Customers: first 200 active customers. TODO: switch to remote search when companies get bigger.
  const { data: customers } = useQuery({
    queryKey: ['contacts', 'customer-options'],
    queryFn: () => listContacts({ type: 'CUSTOMER', pageSize: 200 }),
    enabled: open,
  });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: open });

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue(
      project
        ? {
            ...project,
            startDate: toDateInput(project.startDate),
            endDate: toDateInput(project.endDate),
            memberIds: project.members.map((member) => member.id),
          }
        : { status: 'PLANNING', memberIds: [] },
    );
  }, [open, project, form]);

  const saveMutation = useMutation({
    mutationFn: (payload: ProjectPayload) =>
      project ? updateProject(project.id, payload) : createProject(payload),
    onSuccess: (saved) => {
      message.success('Projekt gespeichert.');
      onSaved(saved);
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  // Cleared optional fields are sent as null on update (removes the value) and omitted on create.
  function handleFinish(values: Record<string, unknown>) {
    const payload: Record<string, unknown> = {};
    for (const key of [
      'name',
      'status',
      'description',
      'customerId',
      'siteStreet',
      'siteZipCode',
      'siteCity',
      'startDate',
      'endDate',
      'managerId',
      'memberIds',
    ]) {
      const value = values[key];
      const isEmpty = value === undefined || value === null || value === '';
      if (!isEmpty) {
        payload[key] = value;
      } else if (project && key !== 'name' && key !== 'status') {
        payload[key] = key === 'memberIds' ? [] : null;
      }
    }
    saveMutation.mutate(payload as ProjectPayload);
  }

  const userOptions = (users ?? [])
    .filter((user) => user.isActive)
    .map((user) => ({ value: user.id, label: `${user.firstName} ${user.lastName}` }));

  return (
    <Modal
      title={project ? `Projekt ${project.number} bearbeiten` : 'Neues Projekt'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saveMutation.isPending}
      width={720}
      forceRender
    >
      <Form layout="vertical" form={form} onFinish={handleFinish}>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.Item name="name" label="Projektname" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="status" label="Status">
              <Select options={optionsOf(PROJECT_STATUS)} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="customerId" label="Kunde">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Kunde wählen"
            options={(customers?.items ?? []).map((customer) => ({
              value: customer.id,
              label: `${customer.number ? customer.number + ' · ' : ''}${customerName(customer)}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="siteStreet" label="Baustelle: Straße &amp; Hausnummer">
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="siteZipCode" label="PLZ">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="siteCity" label="Ort">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="startDate" label="Beginn">
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="endDate" label="Fertigstellung (geplant)">
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="managerId" label="Projektleiter">
          <Select allowClear showSearch optionFilterProp="label" options={userOptions} />
        </Form.Item>
        <Form.Item name="memberIds" label="Team">
          <Select mode="multiple" optionFilterProp="label" options={userOptions} />
        </Form.Item>
        <Form.Item name="description" label="Beschreibung">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
