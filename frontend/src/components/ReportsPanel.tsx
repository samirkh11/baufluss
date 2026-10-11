import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  addReportPhoto,
  createReport,
  deleteReport,
  listReports,
  removeReportPhoto,
  ReportPayload,
  updateReport,
} from '../api/reports';
import { listProjects } from '../api/projects';
import { useAuth } from '../auth/AuthContext';
import { Report } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { formatDate, optionsOf, REPORT_TYPE, toDateInput, todayDateInput } from '../utils/labels';
import { ImageGallery } from './ImageGallery';

interface ReportsPanelProps {
  // Fixed project (project detail page). Without it, reports of all projects are listed and the
  // project can be chosen when creating a report.
  projectId?: string;
}

// Report list + create/edit dialog. Reports are core documents, equal in rank to quotes/invoices.
export function ReportsPanel({ projectId }: ReportsPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const params = { projectId, type: typeFilter as Report['type'] | undefined, q: search || undefined, page };
  const { data, isLoading } = useQuery({
    queryKey: ['reports', params],
    queryFn: () => listReports(params),
    placeholderData: keepPreviousData,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => listProjects({ pageSize: 200 }),
    enabled: modalOpen && !projectId,
  });

  // Derived from the list so photos in the dialog update right after an upload.
  const editing = data?.items.find((report) => report.id === editingId) ?? null;

  // Authors may change their own reports; OWNER/ADMIN may change any (mirrors the backend rule).
  const mayModify = (report: Report) =>
    user?.role === 'OWNER' || user?.role === 'ADMIN' || report.authorId === user?.id;
  const readOnly = editing ? !mayModify(editing) : false;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['reports'] });

  const saveMutation = useMutation({
    mutationFn: (values: ReportPayload & { projectId?: string }) => {
      const { projectId: chosenProject, ...payload } = values;
      return editing ? updateReport(editing.id, payload) : createReport(projectId ?? chosenProject!, payload);
    },
    onSuccess: () => {
      message.success('Bericht gespeichert.');
      closeModal();
      refresh();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReport,
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  function openModal(report: Report | null) {
    setEditingId(report?.id ?? null);
    form.resetFields();
    form.setFieldsValue(
      report
        ? { ...report, reportDate: toDateInput(report.reportDate), projectId: report.projectId }
        : { type: 'DAILY', reportDate: todayDateInput() },
    );
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  // Cleared optional fields are sent as null on update (removes the value) and omitted on create.
  function handleFinish(values: Record<string, unknown>) {
    const payload: Record<string, unknown> = {};
    for (const key of [
      'projectId',
      'type',
      'title',
      'reportDate',
      'weather',
      'workPerformed',
      'issues',
      'progressPercent',
    ]) {
      const value = values[key];
      const isEmpty = value === undefined || value === null || value === '';
      if (!isEmpty) {
        payload[key] = value;
      } else if (editing && ['weather', 'workPerformed', 'issues', 'progressPercent'].includes(key)) {
        payload[key] = null;
      }
    }
    saveMutation.mutate(payload as ReportPayload & { projectId?: string });
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          Neuer Bericht
        </Button>
        <Select
          allowClear
          placeholder="Alle Berichtsarten"
          style={{ width: 200 }}
          options={optionsOf(REPORT_TYPE)}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="Suchen (Titel, Nr., Inhalt)"
          allowClear
          style={{ width: 280 }}
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
          { title: 'Nr.', dataIndex: 'number', width: 90 },
          { title: 'Datum', dataIndex: 'reportDate', width: 100, render: formatDate },
          {
            title: 'Art',
            dataIndex: 'type',
            render: (type: Report['type']) => (
              <Tag color={REPORT_TYPE[type].color}>{REPORT_TYPE[type].label}</Tag>
            ),
          },
          { title: 'Titel', render: (_, report) => <a onClick={() => openModal(report)}>{report.title}</a> },
          ...(projectId
            ? []
            : [
                {
                  title: 'Projekt',
                  render: (_: unknown, report: Report) => (
                    <Link to={`/projects/${report.projectId}`}>
                      {report.project.number} · {report.project.name}
                    </Link>
                  ),
                },
              ]),
          { title: 'Verfasser', dataIndex: 'authorName' },
          {
            title: 'Fortschritt',
            dataIndex: 'progressPercent',
            width: 130,
            render: (value: number | null) =>
              value === null ? '' : <Progress percent={value} size="small" />,
          },
          { title: 'Fotos', width: 70, render: (_, report) => report.photos.length || '' },
          {
            title: '',
            render: (_, report) =>
              mayModify(report) && (
                <Popconfirm title="Bericht löschen?" onConfirm={() => deleteMutation.mutate(report.id)}>
                  <Button danger size="small">
                    Löschen
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />

      <Modal
        title={editing ? `Bericht ${editing.number}` : 'Neuer Bericht'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okButtonProps={{ style: readOnly ? { display: 'none' } : undefined }}
        confirmLoading={saveMutation.isPending}
        width={720}
        forceRender
      >
        {editing ? (
          <Form.Item label="Fotos">
            <ImageGallery
              images={editing.photos}
              maxImages={20}
              onAdd={async (file) => {
                await addReportPhoto(editing.id, file);
                await refresh();
              }}
              onRemove={async (photoId) => {
                await removeReportPhoto(editing.id, photoId);
                await refresh();
              }}
            />
          </Form.Item>
        ) : (
          <p style={{ color: '#888' }}>Fotos können nach dem ersten Speichern hinzugefügt werden.</p>
        )}
        <Form layout="vertical" form={form} onFinish={handleFinish} disabled={readOnly}>
          {!projectId && !editing && (
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
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="Art">
                <Select options={optionsOf(REPORT_TYPE)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="reportDate" label="Datum" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="title" label="Titel" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="weather" label="Wetter">
                <Input placeholder="z.B. sonnig, 18 °C" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="progressPercent" label="Baufortschritt (%)">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="workPerformed" label="Durchgeführte Arbeiten">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="issues" label="Besonderheiten / Mängel / Behinderungen">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
