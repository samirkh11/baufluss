import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, message } from 'antd';
import {
  deleteIncomingInvoice,
  fetchIncomingInvoiceFile,
  getIncomingInvoice,
  incomingInvoiceAction,
  IncomingInvoicePayload,
  updateIncomingInvoice,
} from '../api/incomingInvoices';
import { listContacts } from '../api/contacts';
import { listProjects } from '../api/projects';
import { useIsPhone } from '../hooks/useMediaQuery';
import { apiErrorMessage } from '../utils/assets';
import { EINVOICE_FORMAT, formatDate, formatMoney, INCOMING_STATUS, toDateInput, todayDateInput } from '../utils/labels';

interface FormValues {
  supplierId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  serviceDate?: string;
  dueDate?: string;
  netAmount?: number;
  vatAmount?: number;
  grossAmount?: number;
  reverseCharge?: boolean;
  projectId?: string | null;
  description?: string;
}

// Capture + review dialog of one incoming invoice: original on one side, data and workflow
// actions (approve / reject / reopen / mark paid) on the other.
export function IncomingInvoiceModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const phone = useIsPhone();
  const [form] = Form.useForm<FormValues>();
  const [prompt, setPrompt] = useState<'reject' | 'pay' | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: invoice } = useQuery({
    queryKey: ['incoming', 'detail', id],
    queryFn: () => getIncomingInvoice(id!),
    enabled: !!id,
  });
  const { data: contacts } = useQuery({ queryKey: ['contacts', 'suppliers'], queryFn: () => listContacts({ pageSize: 100 }), enabled: !!id });
  const { data: projects } = useQuery({ queryKey: ['projects', 'select'], queryFn: () => listProjects({ pageSize: 100 }), enabled: !!id });

  useEffect(() => {
    if (!invoice) return;
    form.setFieldsValue({
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName ?? '',
      invoiceNumber: invoice.invoiceNumber ?? '',
      invoiceDate: toDateInput(invoice.invoiceDate),
      serviceDate: toDateInput(invoice.serviceDate),
      dueDate: toDateInput(invoice.dueDate),
      netAmount: Number(invoice.netAmount),
      vatAmount: Number(invoice.vatAmount),
      grossAmount: Number(invoice.grossAmount),
      reverseCharge: invoice.reverseCharge,
      projectId: invoice.projectId,
      description: invoice.description ?? '',
    });
  }, [invoice, form]);

  // Original file as object URL for the preview.
  const hasFile = !!invoice?.fileName;
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setPreviewUrl(null);
    if (id && hasFile) {
      fetchIncomingInvoiceFile(id)
        .then((blob) => {
          if (!cancelled) {
            url = URL.createObjectURL(blob);
            setPreviewUrl(url);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, hasFile]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['incoming'] });
  };

  const toPayload = (values: FormValues): IncomingInvoicePayload => ({
    supplierId: values.supplierId ?? null,
    supplierName: values.supplierName ?? '',
    invoiceNumber: values.invoiceNumber ?? '',
    // Empty date inputs are simply not sent (the API has no "clear date" for these fields).
    ...(values.invoiceDate ? { invoiceDate: values.invoiceDate } : {}),
    ...(values.serviceDate ? { serviceDate: values.serviceDate } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    netAmount: values.netAmount ?? 0,
    vatAmount: values.vatAmount ?? 0,
    grossAmount: values.grossAmount ?? 0,
    reverseCharge: !!values.reverseCharge,
    projectId: values.projectId ?? null,
    description: values.description ?? '',
  });

  const status = invoice?.status;
  // Approved invoices only allow project and description changes (the API enforces this too).
  const payloadFor = (values: FormValues): IncomingInvoicePayload =>
    status === 'APPROVED' ? { projectId: values.projectId ?? null, description: values.description ?? '' } : toPayload(values);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => updateIncomingInvoice(id!, payloadFor(values)),
    onSuccess: () => {
      message.success('Gespeichert.');
      refresh();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: { name: 'approve' | 'reject' | 'reopen' | 'pay'; body?: { reason?: string; paidAt?: string }; save?: boolean }) => {
      if (action.save) {
        await updateIncomingInvoice(id!, toPayload(form.getFieldsValue()));
      }
      return incomingInvoiceAction(id!, action.name, action.body);
    },
    onSuccess: () => {
      setPrompt(null);
      refresh();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteIncomingInvoice(id!),
    onSuccess: () => {
      message.success('Gelöscht.');
      refresh();
      onClose();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  const locked = status === 'APPROVED' || status === 'PAID';
  const fullyLocked = status === 'PAID';
  const busy = saveMutation.isPending || actionMutation.isPending || deleteMutation.isPending;
  const supplierOptions = (contacts?.items ?? [])
    .filter((c) => c.types.includes('SUPPLIER') || c.types.includes('SUBCONTRACTOR'))
    .map((c) => ({ value: c.id, label: c.organizationName || [c.firstName, c.lastName].filter(Boolean).join(' ') }));
  const projectOptions = (projects?.items ?? []).map((p) => ({ value: p.id, label: `${p.number} – ${p.name}` }));

  const isImage = invoice?.mimeType?.startsWith('image/');
  const isPdf = invoice?.mimeType === 'application/pdf';

  // Keep gross = net + VAT while one of them is edited; gross itself stays editable for odd invoices.
  const onValuesChange = (changed: FormValues, all: FormValues) => {
    if ('netAmount' in changed || 'vatAmount' in changed) {
      form.setFieldValue('grossAmount', Math.round(((all.netAmount ?? 0) + (all.vatAmount ?? 0)) * 100) / 100);
    }
    if (changed.reverseCharge) {
      form.setFieldsValue({ vatAmount: 0, grossAmount: all.netAmount ?? 0 });
    }
  };

  return (
    <Modal
      open={!!id}
      onCancel={onClose}
      width={1100}
      style={{ top: 24, maxWidth: '100%' }}
      destroyOnHidden
      title={
        invoice ? (
          <Space wrap>
            <span>{invoice.number}</span>
            <Tag color={INCOMING_STATUS[invoice.status].color}>{INCOMING_STATUS[invoice.status].label}</Tag>
            {invoice.reverseCharge && <Tag>§ 13b</Tag>}
          </Space>
        ) : (
          'Eingangsrechnung'
        )
      }
      footer={
        invoice && (
          <Space wrap>
            {(status === 'RECEIVED' || status === 'REJECTED') && (
              <Button danger loading={deleteMutation.isPending} onClick={() => Modal.confirm({ title: 'Eingangsrechnung löschen?', okText: 'Löschen', cancelText: 'Abbrechen', onOk: () => deleteMutation.mutate() })}>
                Löschen
              </Button>
            )}
            {status === 'RECEIVED' && <Button disabled={busy} onClick={() => { setPromptValue(''); setPrompt('reject'); }}>Ablehnen</Button>}
            {(status === 'APPROVED' || status === 'REJECTED') && (
              <Button disabled={busy} onClick={() => actionMutation.mutate({ name: 'reopen' })}>
                {status === 'APPROVED' ? 'Freigabe zurücknehmen' : 'Wieder öffnen'}
              </Button>
            )}
            {status === 'APPROVED' && <Button type="primary" disabled={busy} onClick={() => { setPromptValue(todayDateInput()); setPrompt('pay'); }}>Als bezahlt markieren</Button>}
            {!fullyLocked && <Button loading={saveMutation.isPending} disabled={busy} onClick={() => form.submit()}>Speichern</Button>}
            {status === 'RECEIVED' && (
              <Button type="primary" loading={actionMutation.isPending} disabled={busy} data-testid="incoming-approve" onClick={() => actionMutation.mutate({ name: 'approve', save: true })}>
                Freigeben
              </Button>
            )}
            <Button onClick={onClose}>Schließen</Button>
          </Space>
        )
      }
    >
      {invoice && (
        <Row gutter={16}>
          <Col xs={24} md={11}>
            <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, height: phone ? 260 : 560, overflow: 'auto', marginBottom: 12, background: '#fafafa' }}>
              {!hasFile && <div style={{ padding: 16 }}>Ohne Beleg erfasst.</div>}
              {hasFile && !previewUrl && !invoice.eInvoice && <div style={{ padding: 16 }}>Beleg wird geladen …</div>}
              {invoice.eInvoice && !isPdf && (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(row) => `${row.position}-${row.name}`}
                  dataSource={invoice.eInvoice.lines}
                  scroll={{ x: 'max-content' }}
                  data-testid="einvoice-lines"
                  columns={[
                    { title: 'Pos.', dataIndex: 'position', width: 50 },
                    { title: 'Bezeichnung', dataIndex: 'name' },
                    { title: 'Menge', align: 'right', render: (_, row) => `${row.quantity ?? ''} ${row.unit ?? ''}` },
                    { title: 'Netto', align: 'right', render: (_, row) => (row.net ? formatMoney(row.net) : '') },
                  ]}
                />
              )}
              {previewUrl && isPdf && <iframe title="Beleg" src={previewUrl} style={{ border: 0, width: '100%', height: '100%' }} />}
              {previewUrl && isImage && <img alt="Beleg" src={previewUrl} style={{ width: '100%' }} />}
              {previewUrl && !isPdf && !isImage && !invoice.eInvoice && (
                <div style={{ padding: 16 }}>
                  <a href={previewUrl} target="_blank" rel="noreferrer">{invoice.fileName}</a>
                </div>
              )}
            </div>
            {invoice.fileName && <small>{invoice.fileName}</small>}
          </Col>
          <Col xs={24} md={13}>
            {invoice.eInvoice && (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 12 }}
                data-testid="einvoice-alert"
                message={`E-Rechnung erkannt: ${EINVOICE_FORMAT[invoice.eInvoice.format] ?? invoice.eInvoice.format}`}
                description={
                  invoice.eInvoice.supplierMatched
                    ? 'Die Daten wurden aus der Datei übernommen, der Lieferant wurde in den Kontakten gefunden.'
                    : `Die Daten wurden aus der Datei übernommen. „${invoice.eInvoice.seller.name ?? 'Lieferant'}“ ist nicht in den Kontakten – bei Bedarf einen Kontakt anlegen und hier auswählen.`
                }
              />
            )}
            {invoice.duplicateOf && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Mögliche Doppelerfassung: gleiche Rechnungsnummer bereits als ${invoice.duplicateOf.number} erfasst.`} />
            )}
            {status === 'RECEIVED' && invoice.issues && invoice.issues.length > 0 && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Zum Freigeben fehlt noch:" description={invoice.issues.join(' ')} />
            )}
            {status === 'REJECTED' && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={`Abgelehnt${invoice.rejectionReason ? `: ${invoice.rejectionReason}` : ''}`} />}
            {status === 'APPROVED' && invoice.approvedBy && (
              <Alert type="success" showIcon style={{ marginBottom: 12 }} message={`Freigegeben von ${invoice.approvedBy.firstName} ${invoice.approvedBy.lastName}${invoice.approvedAt ? ` am ${formatDate(invoice.approvedAt)}` : ''}. Beträge sind gesperrt.`} />
            )}
            {status === 'PAID' && <Alert type="success" showIcon style={{ marginBottom: 12 }} message={`Bezahlt am ${formatDate(invoice.paidAt)}`} />}

            <Form layout="vertical" form={form} disabled={fullyLocked} onValuesChange={onValuesChange} onFinish={(values) => saveMutation.mutate(values)}>
              <Form.Item name="supplierId" label="Lieferant / Subunternehmer" tooltip="Aus den Kontakten wählen; sonst unten einen Namen eintragen">
                <Select allowClear showSearch optionFilterProp="label" options={supplierOptions} disabled={locked} placeholder="Kontakt wählen" data-testid="incoming-supplier" />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="invoiceNumber" label="Rechnungsnummer des Lieferanten">
                    <Input disabled={locked} data-testid="incoming-invoice-number" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="supplierName" label="Name (falls nicht in Kontakten)">
                    <Input disabled={locked} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="invoiceDate" label="Rechnungsdatum"><Input type="date" disabled={locked} data-testid="incoming-invoice-date" /></Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="serviceDate" label="Leistungsdatum"><Input type="date" disabled={locked} /></Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="dueDate" label="Fällig am"><Input type="date" disabled={locked} /></Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="netAmount" label="Netto (€)"><InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} disabled={locked} data-testid="incoming-net" /></Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="vatAmount" label="Umsatzsteuer (€)"><InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} disabled={locked} data-testid="incoming-vat" /></Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="grossAmount" label="Brutto (€)"><InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} disabled={locked} data-testid="incoming-gross" /></Form.Item>
                </Col>
              </Row>
              <Form.Item name="reverseCharge" label="Steuerschuldnerschaft des Leistungsempfängers (§ 13b)" valuePropName="checked">
                <Switch disabled={locked} />
              </Form.Item>
              <Form.Item name="projectId" label="Projekt (Kostenzuordnung)">
                <Select allowClear showSearch optionFilterProp="label" options={projectOptions} placeholder="Keinem Projekt zugeordnet" disabled={fullyLocked} data-testid="incoming-project" />
              </Form.Item>
              <Form.Item name="description" label="Beschreibung / Notiz">
                <Input.TextArea rows={2} disabled={fullyLocked} />
              </Form.Item>
            </Form>
          </Col>
        </Row>
      )}
      <Modal
        open={!!prompt}
        title={prompt === 'reject' ? 'Rechnung ablehnen' : 'Als bezahlt markieren'}
        okText={prompt === 'reject' ? 'Ablehnen' : 'Bezahlt'}
        cancelText="Abbrechen"
        onCancel={() => setPrompt(null)}
        confirmLoading={actionMutation.isPending}
        onOk={() =>
          actionMutation.mutate(prompt === 'reject' ? { name: 'reject', body: { reason: promptValue } } : { name: 'pay', body: { paidAt: promptValue || undefined } })
        }
      >
        {prompt === 'reject' ? (
          <Input.TextArea rows={3} placeholder="Grund (z. B. Reklamation, falscher Empfänger)" value={promptValue} onChange={(e) => setPromptValue(e.target.value)} />
        ) : (
          <Input type="date" value={promptValue} max={todayDateInput()} onChange={(e) => setPromptValue(e.target.value)} />
        )}
      </Modal>
    </Modal>
  );
}
