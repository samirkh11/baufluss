import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Col, Form, Input, InputNumber, Modal, Radio, Row, Select, message } from 'antd';
import { createTimeEntry, TimeEntryPayload, updateTimeEntry } from '../api/timeEntries';
import { listProjects } from '../api/projects';
import { listUsers } from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { TimeEntry } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { berlinNow } from '../utils/dates';

interface TimeEntryModalProps {
  open: boolean;
  entry: TimeEntry | null; // null = new entry
  defaultDate: string; // pre-selected day for new entries
  defaultUserId?: string; // OWNER/ADMIN: employee the entry is created for
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  userId?: string;
  projectId?: string;
  date: string;
  mode: 'range' | 'duration';
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  hours?: number;
  minutes?: number;
  activity?: string;
  note?: string;
}

// Create / correct a time entry: either "from - to" with a break, or just a duration.
export function TimeEntryModal({
  open,
  entry,
  defaultDate,
  defaultUserId,
  onClose,
  onSaved,
}: TimeEntryModalProps) {
  const { user } = useAuth();
  const office = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [form] = Form.useForm<FormValues>();
  const [mode, setMode] = useState<'range' | 'duration'>('range');

  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => listProjects({ pageSize: 200 }),
    enabled: open,
  });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: open && office });

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    const nextMode = entry && !entry.startTime ? 'duration' : 'range';
    setMode(nextMode);
    form.setFieldsValue(
      entry
        ? {
            projectId: entry.projectId ?? undefined,
            date: entry.date.slice(0, 10),
            mode: nextMode,
            startTime: entry.startTime ?? undefined,
            endTime: entry.endTime ?? undefined,
            breakMinutes: entry.breakMinutes,
            hours: Math.floor(entry.durationMinutes / 60),
            minutes: entry.durationMinutes % 60,
            activity: entry.activity ?? undefined,
            note: entry.note ?? undefined,
          }
        : {
            date: defaultDate,
            mode: 'range',
            startTime: '07:00',
            endTime: '16:00',
            breakMinutes: 60,
            userId: defaultUserId,
            hours: 8,
            minutes: 0,
          },
    );
  }, [open, entry, defaultDate, defaultUserId, form]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: TimeEntryPayload = {
        date: values.date,
        activity: values.activity || (entry ? null : undefined),
        note: values.note || (entry ? null : undefined),
        projectId: values.projectId ?? (entry ? null : undefined),
        ...(values.mode === 'range'
          ? { startTime: values.startTime, endTime: values.endTime, breakMinutes: values.breakMinutes ?? 0 }
          : {
              startTime: entry ? null : undefined,
              endTime: entry ? null : undefined,
              durationMinutes: (values.hours ?? 0) * 60 + (values.minutes ?? 0),
            }),
      };
      return entry
        ? updateTimeEntry(entry.id, payload)
        : createTimeEntry({ ...payload, userId: office ? values.userId : undefined });
    },
    onSuccess: () => {
      message.success('Zeit gespeichert.');
      onSaved();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  return (
    <Modal
      title={entry ? 'Zeit bearbeiten' : 'Zeit erfassen'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saveMutation.isPending}
      okText="Speichern"
      forceRender
    >
      <Form layout="vertical" form={form} onFinish={(values) => saveMutation.mutate({ ...values, mode })}>
        {office && !entry && (
          <Form.Item name="userId" label="Mitarbeiter">
            <Select
              allowClear
              placeholder="Ich selbst"
              options={(users ?? [])
                .filter((candidate) => candidate.isActive)
                .map((candidate) => ({
                  value: candidate.id,
                  label: `${candidate.firstName} ${candidate.lastName}`,
                }))}
            />
          </Form.Item>
        )}
        <Form.Item name="projectId" label="Projekt">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Intern (ohne Projekt)"
            options={(projects?.items ?? []).map((project) => ({
              value: project.id,
              label: `${project.number} · ${project.name}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="date" label="Datum" rules={[{ required: true }]}>
          <Input type="date" max={berlinNow().date} />
        </Form.Item>
        <Radio.Group
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          style={{ marginBottom: 12 }}
        >
          <Radio.Button value="range">Von – Bis</Radio.Button>
          <Radio.Button value="duration">Dauer</Radio.Button>
        </Radio.Group>
        {mode === 'range' ? (
          <Row gutter={12}>
            <Col xs={12} sm={8}>
              <Form.Item name="startTime" label="Beginn" rules={[{ required: true, message: 'Pflicht' }]}>
                <Input type="time" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="endTime" label="Ende" rules={[{ required: true, message: 'Pflicht' }]}>
                <Input type="time" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="breakMinutes" label="Pause (Min.)">
                <InputNumber min={0} max={720} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        ) : (
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="hours" label="Stunden">
                <InputNumber min={0} max={24} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="minutes" label="Minuten">
                <InputNumber min={0} max={59} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Form.Item name="activity" label="Tätigkeit">
          <Input placeholder="z.B. Lattung montiert" />
        </Form.Item>
        <Form.Item name="note" label="Notiz">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
