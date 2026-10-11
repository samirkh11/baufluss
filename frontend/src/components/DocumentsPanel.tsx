import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { createDocument, listDocuments } from '../api/documents';
import { listProjects } from '../api/projects';
import { BusinessDocument, DocumentStatus, DocumentType } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { DOCUMENT_STATUS, DOCUMENT_TYPE, formatDate, formatMoney, optionsOf } from '../utils/labels';

interface DocumentsPanelProps {
  type: DocumentType;
  // Fixed project (project detail page). Without it all documents of the type are listed and the
  // project is chosen when creating a new one.
  projectId?: string;
}

// List of business documents of one type (quotes for now) with a "new" button that creates a
// draft and opens the editor.
export function DocumentsPanel({ type, projectId }: DocumentsPanelProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DocumentStatus | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pickProject, setPickProject] = useState(false);
  const [form] = Form.useForm<{ projectId: string }>();

  const params = { type, projectId, status, q: search || undefined, page };
  const { data, isLoading } = useQuery({
    queryKey: ['documents', params],
    queryFn: () => listDocuments(params),
    placeholderData: keepPreviousData,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => listProjects({ pageSize: 200 }),
    enabled: pickProject,
  });

  const createMutation = useMutation({
    mutationFn: (targetProject: string) => createDocument(targetProject, type),
    onSuccess: (created) => navigate(`/documents/${created.id}`),
    onError: (error) => message.error(apiErrorMessage(error, 'Anlegen fehlgeschlagen.')),
  });

  function handleNew() {
    if (projectId) {
      createMutation.mutate(projectId);
    } else {
      setPickProject(true);
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} loading={createMutation.isPending} onClick={handleNew}>
          Neues {DOCUMENT_TYPE[type]}
        </Button>
        <Select
          allowClear
          placeholder="Alle Status"
          style={{ width: 170 }}
          options={optionsOf(DOCUMENT_STATUS)}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="Suchen (Nr., Betreff, Empfänger)"
          allowClear
          style={{ width: 300 }}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </Space>

      <Table
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
            title: 'Nr.',
            width: 110,
            render: (_, document: BusinessDocument) => (
              <Link to={`/documents/${document.id}`}>{document.number ?? 'Entwurf'}</Link>
            ),
          },
          { title: 'Datum', dataIndex: 'documentDate', width: 100, render: formatDate },
          { title: 'Betreff', dataIndex: 'subject' },
          { title: 'Empfänger', dataIndex: 'recipientName' },
          ...(projectId
            ? []
            : [
                {
                  title: 'Projekt',
                  render: (_: unknown, document: BusinessDocument) => (
                    <Link to={`/projects/${document.projectId}`}>
                      {document.project.number} · {document.project.name}
                    </Link>
                  ),
                },
              ]),
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: DocumentStatus) => (
              <Tag color={DOCUMENT_STATUS[value].color}>{DOCUMENT_STATUS[value].label}</Tag>
            ),
          },
          { title: 'Netto', dataIndex: 'netTotal', align: 'right', render: formatMoney },
          { title: 'Brutto', dataIndex: 'grossTotal', align: 'right', render: formatMoney },
        ]}
      />

      <Modal
        title={`Neues ${DOCUMENT_TYPE[type]}: Projekt wählen`}
        open={pickProject}
        onCancel={() => setPickProject(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values.projectId)}>
          <Form.Item
            name="projectId"
            label="Projekt"
            rules={[{ required: true, message: 'Bitte ein Projekt wählen' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={(projects?.items ?? []).map((project) => ({
                value: project.id,
                label: `${project.number} · ${project.name}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
