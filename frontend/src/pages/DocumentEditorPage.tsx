import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Switch,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listCatalogItems } from '../api/catalog';
import { listContacts } from '../api/contacts';
import {
  convertDocument,
  deleteDocument,
  DocumentItemPayload,
  DocumentPayload,
  duplicateDocument,
  finalizeDocument,
  getDocument,
  getDocumentIssues,
  downloadGaeb,
  openDocumentPdf,
  setDocumentStatus,
  updateDocument,
} from '../api/documents';
import { BusinessDocument, CatalogItem, DocumentItemKind } from '../types';
import { useIsPhone } from '../hooks/useMediaQuery';
import { apiErrorMessage } from '../utils/assets';
import { buildOrdinals, calculateTotals, lineTotal } from '../utils/documentCalc';
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE,
  customerName,
  documentPath,
  formatDate,
  formatMoney,
  toDateInput,
} from '../utils/labels';

// One editable line. `key` only identifies the row in the UI; the server replaces all lines on save.
interface EditorLine {
  key: string;
  kind: DocumentItemKind;
  catalogItemId?: string;
  oz?: string; // original GAEB Ordnungszahl (imported lines only)
  sku?: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPercent: number;
  isOptional: boolean;
}

interface HeaderValues {
  // invoice-only fields (kept in the same form)
  serviceDateFrom?: string;
  serviceDateTo?: string;
  paymentTermDays?: number;
  reverseCharge?: boolean;
  orderReference?: string;
  buyerReference?: string;
  recipientContactId?: string;
  subject?: string;
  documentDate?: string;
  validUntil?: string;
  introText?: string;
  closingText?: string;
}

let keyCounter = 0;
const newKey = () => `line-${++keyCounter}`;

function blankLine(kind: DocumentItemKind): EditorLine {
  return {
    key: newKey(),
    kind,
    name: '',
    description: '',
    quantity: 1,
    unit: 'Stk',
    unitPrice: 0,
    vatRate: 19,
    discountPercent: 0,
    isOptional: false,
  };
}

function toEditorLines(document: BusinessDocument): EditorLine[] {
  return document.items.map((item) => ({
    key: newKey(),
    kind: item.kind,
    catalogItemId: item.catalogItemId ?? undefined,
    oz: item.oz ?? undefined,
    sku: item.sku ?? undefined,
    name: item.name,
    description: item.description ?? '',
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPrice: Number(item.unitPrice),
    vatRate: Number(item.vatRate),
    discountPercent: Number(item.discountPercent),
    isOptional: item.isOptional,
  }));
}

function toPayload(line: EditorLine): DocumentItemPayload {
  return {
    kind: line.kind,
    catalogItemId: line.catalogItemId,
    oz: line.oz,
    sku: line.sku,
    name: line.name,
    description: line.description || undefined,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    discountPercent: line.discountPercent,
    isOptional: line.isOptional,
  };
}

// Editor for a business document (quote). Drafts are fully editable; issued documents are shown
// read-only (the server enforces the lock) and can be duplicated into a new draft.
export function DocumentEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<HeaderValues>();
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  // Set right after a successful delete so the page does not try to reload the deleted document.
  const [deleted, setDeleted] = useState(false);
  const phone = useIsPhone();

  const {
    data: document,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['documents', 'detail', id], queryFn: () => getDocument(id), enabled: !deleted });
  const { data: contacts } = useQuery({
    queryKey: ['contacts', 'all-options'],
    queryFn: () => listContacts({ pageSize: 200 }),
  });
  const { data: catalogResults, isFetching: searchingCatalog } = useQuery({
    queryKey: ['catalog-items', 'picker', catalogSearch],
    queryFn: () => listCatalogItems({ q: catalogSearch || undefined, pageSize: 20 }),
  });

  // Pre-issue check of the saved invoice (missing service date, tax ids, optional lines ...).
  const { data: issues } = useQuery({
    queryKey: ['documents', 'issues', id, document?.updatedAt],
    queryFn: () => getDocumentIssues(id),
    enabled: !!document && document.type === 'INVOICE' && document.status === 'DRAFT',
  });

  // Load server data into the form/lines only when the stored document actually changed, so a
  // background refetch never overwrites unsaved edits.
  useEffect(() => {
    if (!document) {
      return;
    }
    form.setFieldsValue({
      recipientContactId: document.recipientContactId ?? undefined,
      subject: document.subject ?? '',
      documentDate: toDateInput(document.documentDate),
      validUntil: toDateInput(document.validUntil),
      introText: document.introText ?? '',
      closingText: document.closingText ?? '',
      serviceDateFrom: toDateInput(document.invoiceDetails?.serviceDateFrom),
      serviceDateTo: toDateInput(document.invoiceDetails?.serviceDateTo),
      paymentTermDays: document.invoiceDetails?.paymentTermDays ?? 14,
      reverseCharge: document.invoiceDetails?.reverseCharge ?? false,
      orderReference: document.invoiceDetails?.orderReference ?? '',
      buyerReference: document.invoiceDetails?.buyerReference ?? '',
    });
    setLines(toEditorLines(document));
    setDirty(false);
  }, [document?.id, document?.updatedAt]);

  const isDraft = document?.status === 'DRAFT';
  const ordinals = useMemo(() => buildOrdinals(lines.map((line) => line.kind)), [lines]);
  const totals = useMemo(() => calculateTotals(lines), [lines]);

  function patchLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setDirty(true);
  }

  function addLine(line: EditorLine) {
    setLines((current) => [...current, line]);
    setDirty(true);
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function addFromCatalog(catalogId: string) {
    const entry: CatalogItem | undefined = catalogResults?.items.find(
      (candidate) => candidate.id === catalogId,
    );
    if (!entry) {
      return;
    }
    // Values are copied: later catalog price changes must not alter this document.
    addLine({
      ...blankLine('POSITION'),
      catalogItemId: entry.id,
      sku: entry.sku ?? undefined,
      name: entry.name,
      description: entry.description ?? '',
      unit: entry.unit,
      unitPrice: Number(entry.netPrice),
      vatRate: Number(entry.vatRate),
    });
  }

  function currentPayload(): DocumentPayload {
    const values = form.getFieldsValue();
    return {
      recipientContactId: values.recipientContactId ?? null,
      subject: values.subject || null,
      documentDate: values.documentDate || undefined,
      validUntil: values.validUntil || null,
      introText: values.introText || null,
      closingText: values.closingText || null,
      items: lines.map(toPayload),
      ...(document?.type === 'INVOICE'
        ? {
            invoice: {
              serviceDateFrom: values.serviceDateFrom || null,
              serviceDateTo: values.serviceDateTo || null,
              paymentTermDays: values.paymentTermDays ?? 14,
              reverseCharge: !!values.reverseCharge,
              orderReference: values.orderReference || null,
              buyerReference: values.buyerReference || null,
            },
          }
        : {}),
    };
  }

  const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));

  function refreshCache(saved: BusinessDocument) {
    queryClient.setQueryData(['documents', 'detail', id], saved);
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  const saveMutation = useMutation({
    mutationFn: () => updateDocument(id, currentPayload()),
    onSuccess: (saved) => {
      message.success('Gespeichert.');
      refreshCache(saved);
    },
    onError,
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (dirty) {
        await updateDocument(id, currentPayload());
      }
      return finalizeDocument(id);
    },
    onSuccess: (saved) => {
      message.success(`${DOCUMENT_TYPE[saved.type]} ${saved.number} ausgestellt.`);
      refreshCache(saved);
    },
    onError,
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACCEPTED' | 'REJECTED') => setDocumentStatus(id, status),
    onSuccess: refreshCache,
    onError,
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateDocument(id),
    onSuccess: (copy) => {
      message.success('Neuer Entwurf angelegt.');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate(documentPath(copy.type, copy.id));
    },
    onError,
  });

  // Takes the document over into the next stage (quote -> order -> invoice) as a new draft.
  const convertMutation = useMutation({
    mutationFn: (targetType: 'ORDER' | 'INVOICE') => convertDocument(id, targetType),
    onSuccess: (created) => {
      message.success(`${DOCUMENT_TYPE[created.type]} als Entwurf angelegt.`);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(documentPath(created.type, created.id));
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(id),
    onSuccess: () => {
      setDeleted(true);
      message.success('Entwurf gelöscht.');
      queryClient.removeQueries({ queryKey: ['documents', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/projects/${document?.projectId ?? ''}`);
    },
    onError,
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      if (dirty && isDraft) {
        refreshCache(await updateDocument(id, currentPayload()));
      }
      await openDocumentPdf(id);
    },
    onError,
  });

  // GAEB X84 export (quotes): saves a pending draft first so the file matches what is on screen.
  const gaebMutation = useMutation({
    mutationFn: async () => {
      if (dirty && isDraft) {
        refreshCache(await updateDocument(id, currentPayload()));
      }
      await downloadGaeb(id);
    },
    onError,
  });

  if (isLoading) {
    return null;
  }
  if (isError || !document) {
    return (
      <Result
        status="404"
        title="Dokument nicht gefunden"
        extra={<Link to="/quotes">Zu den Dokumenten</Link>}
      />
    );
  }

  const status = DOCUMENT_STATUS[document.status];
  const numberLabel = document.number ?? 'Entwurf';
  const isQuote = document.type === 'QUOTE';
  const canIssue = true;
  const issued = document.status === 'SENT' || document.status === 'ACCEPTED';
  const canConvertToOrder =
    isQuote && issued && !document.derivedDocuments.some((derived) => derived.type === 'ORDER');
  const canConvertToInvoice =
    (isQuote && issued) || (document.type === 'ORDER' && document.status === 'SENT');

  const lineColumns = [
    {
      title: 'Pos.',
      width: 80,
      render: (_: unknown, line: EditorLine, index: number) => (
        <div>
          {ordinals[index] ?? ''}
          {line.oz && <div style={{ fontSize: 11, color: '#888' }}>OZ {line.oz}</div>}
        </div>
      ),
    },
    {
      title: 'Bezeichnung',
      render: (_: unknown, line: EditorLine) => (
        <div>
          <Input
            value={line.name}
            placeholder={line.kind === 'HEADING' ? 'Titel' : line.kind === 'TEXT' ? 'Text' : 'Kurztext'}
            style={line.kind === 'HEADING' ? { fontWeight: 'bold' } : undefined}
            onChange={(event) => patchLine(line.key, { name: event.target.value })}
          />
          {line.kind === 'POSITION' && (
            <Input.TextArea
              value={line.description}
              placeholder="Langtext (optional)"
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{ marginTop: 4, fontSize: 12 }}
              onChange={(event) => patchLine(line.key, { description: event.target.value })}
            />
          )}
        </div>
      ),
    },
    {
      title: 'Menge',
      width: 100,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <InputNumber
            min={0}
            precision={3}
            decimalSeparator=","
            value={line.quantity}
            style={{ width: '100%' }}
            onChange={(value) => patchLine(line.key, { quantity: value ?? 0 })}
          />
        ),
    },
    {
      title: 'Einheit',
      width: 80,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <Input value={line.unit} onChange={(event) => patchLine(line.key, { unit: event.target.value })} />
        ),
    },
    {
      title: 'Einzelpreis (netto)',
      width: 130,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <InputNumber
            precision={2}
            decimalSeparator=","
            value={line.unitPrice}
            style={{ width: '100%' }}
            onChange={(value) => patchLine(line.key, { unitPrice: value ?? 0 })}
          />
        ),
    },
    {
      title: 'USt',
      width: 80,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <Select
            value={line.vatRate}
            options={[19, 7, 0].map((value) => ({ value, label: `${value} %` }))}
            onChange={(value) => patchLine(line.key, { vatRate: value })}
          />
        ),
    },
    {
      title: 'Rabatt %',
      width: 90,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <InputNumber
            min={0}
            max={100}
            precision={2}
            decimalSeparator=","
            value={line.discountPercent}
            style={{ width: '100%' }}
            onChange={(value) => patchLine(line.key, { discountPercent: value ?? 0 })}
          />
        ),
    },
    {
      title: 'Optional',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' && (
          <Checkbox
            checked={line.isOptional}
            onChange={(event) => patchLine(line.key, { isOptional: event.target.checked })}
          />
        ),
    },
    {
      title: 'Summe',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, line: EditorLine) =>
        line.kind === 'POSITION' ? (
          <span style={{ opacity: line.isOptional ? 0.5 : 1 }}>{formatMoney(lineTotal(line))}</span>
        ) : null,
    },
    {
      title: '',
      width: 110,
      render: (_: unknown, line: EditorLine, index: number) => (
        <Space size={2}>
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => moveLine(index, -1)}
          />
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === lines.length - 1}
            onClick={() => moveLine(index, 1)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              setLines((current) => current.filter((candidate) => candidate.key !== line.key));
              setDirty(true);
            }}
          />
        </Space>
      ),
    },
  ];

  // Phone layout: one card per line instead of a wide table. Reuses the table's cell renderers
  // (indices: 1 name, 2 quantity, 3 unit, 4 price, 5 VAT, 6 discount, 7 optional, 8 sum, 9 actions).
  const cell = (columnIndex: number, line: EditorLine, index: number) =>
    (
      lineColumns[columnIndex] as unknown as {
        render: (value: unknown, line: EditorLine, index: number) => ReactNode;
      }
    ).render(null, line, index);
  const field = (label: string, columnIndex: number, line: EditorLine, index: number) => (
    <Col xs={12}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      {cell(columnIndex, line, index)}
    </Col>
  );
  const lineCards = lines.map((line, index) => (
    <Card
      key={line.key}
      size="small"
      style={{ marginBottom: 8, background: line.kind === 'HEADING' ? '#fafafa' : undefined }}
      title={
        <Space>
          {ordinals[index] && <Tag>{ordinals[index]}</Tag>}
          {line.oz && <span style={{ fontSize: 12, color: '#888' }}>OZ {line.oz}</span>}
          <span>{{ POSITION: 'Position', HEADING: 'Titel', TEXT: 'Text' }[line.kind]}</span>
        </Space>
      }
      extra={cell(9, line, index)}
    >
      {cell(1, line, index)}
      {line.kind === 'POSITION' && (
        <>
          <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
            {field('Menge', 2, line, index)}
            {field('Einheit', 3, line, index)}
            {field('Einzelpreis (netto)', 4, line, index)}
            {field('USt', 5, line, index)}
            {field('Rabatt %', 6, line, index)}
            <Col xs={12}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Optional
              </Typography.Text>
              <div style={{ paddingTop: 6 }}>{cell(7, line, index)}</div>
            </Col>
          </Row>
          <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 'bold' }}>{cell(8, line, index)}</div>
        </>
      )}
    </Card>
  ));

  return (
    <div>
      <style>{'.document-heading-row td { background: #fafafa; }'}</style>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {DOCUMENT_TYPE[document.type]} {numberLabel} <Tag color={status.color}>{status.label}</Tag>
        </Typography.Title>
        <Space wrap>
          <Link to={`/projects/${document.projectId}`}>
            Projekt {document.project.number} · {document.project.name}
          </Link>
          <Button loading={pdfMutation.isPending} onClick={() => pdfMutation.mutate()}>
            PDF
          </Button>
          {document.type === 'QUOTE' && (
            <Button loading={gaebMutation.isPending} onClick={() => gaebMutation.mutate()}>
              GAEB-Export
            </Button>
          )}
          <Button loading={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate()}>
            Duplizieren
          </Button>
          {canConvertToOrder && (
            <Button loading={convertMutation.isPending} onClick={() => convertMutation.mutate('ORDER')}>
              Auftragsbestätigung erstellen
            </Button>
          )}
          {canConvertToInvoice && (
            <Button
              type="primary"
              ghost
              loading={convertMutation.isPending}
              onClick={() => convertMutation.mutate('INVOICE')}
            >
              Rechnung erstellen
            </Button>
          )}
          {isDraft && (
            <>
              <Popconfirm title="Entwurf löschen?" onConfirm={() => deleteMutation.mutate()}>
                <Button danger>Löschen</Button>
              </Popconfirm>
              <Button
                type="primary"
                disabled={!dirty}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Speichern
              </Button>
              {canIssue && (
                <Popconfirm
                  title="Dokument ausstellen?"
                  description="Es erhält die nächste Nummer und kann danach nicht mehr geändert werden."
                  okText="Ausstellen"
                  onConfirm={() => finalizeMutation.mutate()}
                >
                  <Button type="primary" loading={finalizeMutation.isPending}>
                    Ausstellen
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
          {isQuote && document.status === 'SENT' && (
            <>
              <Button loading={statusMutation.isPending} onClick={() => statusMutation.mutate('ACCEPTED')}>
                Angenommen
              </Button>
              <Button
                danger
                loading={statusMutation.isPending}
                onClick={() => statusMutation.mutate('REJECTED')}
              >
                Abgelehnt
              </Button>
            </>
          )}
        </Space>
      </Space>

      {document.type === 'INVOICE' && isDraft && issues && (
        <Alert
          type={issues.length === 0 ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            issues.length === 0
              ? 'Die Rechnung ist vollständig und kann ausgestellt werden.'
              : 'Vor dem Ausstellen noch zu klären (gespeicherter Stand):'
          }
          description={
            issues.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : undefined
          }
        />
      )}

      {(document.sourceDocument || document.derivedDocuments.length > 0) && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={4}>
            {document.sourceDocument && (
              <span>
                Erstellt aus:{' '}
                <Link to={documentPath(document.sourceDocument.type, document.sourceDocument.id)}>
                  {DOCUMENT_TYPE[document.sourceDocument.type]} {document.sourceDocument.number}
                </Link>
              </span>
            )}
            {document.derivedDocuments.length > 0 && (
              <Space wrap>
                Folgedokumente:
                {document.derivedDocuments.map((derived) => (
                  <Link key={derived.id} to={documentPath(derived.type, derived.id)}>
                    {DOCUMENT_TYPE[derived.type]} {derived.number ?? '(Entwurf)'}{' '}
                    <Tag color={DOCUMENT_STATUS[derived.status].color}>
                      {DOCUMENT_STATUS[derived.status].label}
                    </Tag>
                  </Link>
                ))}
              </Space>
            )}
          </Space>
        </Card>
      )}

      {!isDraft && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Dieses Dokument ist ausgestellt und gesperrt. Zum Überarbeiten bitte duplizieren."
        />
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={!isDraft}
        onValuesChange={(changed) => {
          setDirty(true);
          // § 13b: the recipient owes the VAT, so every position is shown with 0 % VAT.
          if (changed.reverseCharge === true) {
            setLines((current) =>
              current.map((line) => (line.kind === 'POSITION' ? { ...line, vatRate: 0 } : line)),
            );
          }
        }}
      >
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="recipientContactId"
                label="Empfänger"
                extra={!isDraft ? undefined : 'Die Adresse wird beim Ausstellen aus dem Kontakt übernommen.'}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Kontakt wählen"
                  options={(contacts?.items ?? []).map((contact) => ({
                    value: contact.id,
                    label: `${contact.number ? contact.number + ' · ' : ''}${customerName(contact)}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="subject" label="Betreff">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="documentDate" label={document.type === 'INVOICE' ? 'Rechnungsdatum' : 'Datum'}>
                <Input type="date" />
              </Form.Item>
            </Col>
            {isQuote && (
              <Col xs={12} md={6}>
                <Form.Item name="validUntil" label="Gültig bis">
                  <Input type="date" />
                </Form.Item>
              </Col>
            )}
            {!isDraft && (
              <Col xs={24} md={12}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="Anschrift (Stand Ausstellung)">
                    {[
                      document.recipientName,
                      document.recipientStreet,
                      [document.recipientZipCode, document.recipientCity].filter(Boolean).join(' '),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Descriptions.Item>
                  <Descriptions.Item label="Ausgestellt am">
                    {formatDate(document.finalizedAt)}
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            )}
          </Row>
          <Form.Item name="introText" label="Einleitungstext">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
        </Card>

        {document.type === 'INVOICE' && (
          <Card title="Rechnungsangaben" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={12} md={6}>
                <Form.Item
                  name="serviceDateFrom"
                  label="Leistungsdatum / von"
                  tooltip="Pflichtangabe (§ 14 UStG): Zeitpunkt oder Zeitraum der Leistung"
                >
                  <Input type="date" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="serviceDateTo" label="bis (optional)">
                  <Input type="date" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  name="paymentTermDays"
                  label="Zahlungsziel (Tage)"
                  extra={
                    document.invoiceDetails?.dueDate
                      ? `Fällig am ${formatDate(document.invoiceDetails.dueDate)}`
                      : 'Fälligkeit = Rechnungsdatum + Zahlungsziel'
                  }
                >
                  <InputNumber min={0} max={365} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  name="reverseCharge"
                  label="§ 13b UStG"
                  valuePropName="checked"
                  tooltip="Bauleistungen an Unternehmer, die selbst Bauleistungen erbringen: der Empfänger schuldet die Umsatzsteuer."
                >
                  <Switch checkedChildren="Reverse Charge" unCheckedChildren="aus" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="orderReference" label="Bestellnummer des Kunden (optional)">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="buyerReference" label="Leitweg-ID (öffentliche Auftraggeber, optional)">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Typography.Text type="secondary">
              § 13b nur, wenn der Empfänger selbst Bauleistungen erbringt (Nachweis/USt-IdNr. liegt vor). Alle
              Positionen werden dann mit 0 % USt ausgewiesen und die Rechnung trägt den Pflichthinweis zur
              Steuerschuldnerschaft.
            </Typography.Text>
          </Card>
        )}

        <Card title="Positionen" style={{ marginBottom: 16 }}>
          {isDraft && (
            <Space style={{ marginBottom: 12 }} wrap>
              <Select
                showSearch
                filterOption={false}
                value={null}
                placeholder="Position aus Leistungs-/Artikelstamm hinzufügen …"
                style={{ width: 380, maxWidth: '100%' }}
                loading={searchingCatalog}
                onSearch={setCatalogSearch}
                onChange={(value) => value && addFromCatalog(value)}
                options={(catalogResults?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.sku ? item.sku + ' · ' : ''}${item.name} (${formatMoney(item.netPrice)} / ${item.unit})`,
                }))}
              />
              <Button onClick={() => addLine(blankLine('POSITION'))}>Freie Position</Button>
              <Button onClick={() => addLine(blankLine('HEADING'))}>Titel</Button>
              <Button onClick={() => addLine(blankLine('TEXT'))}>Textzeile</Button>
            </Space>
          )}
          {phone ? (
            <div>{lines.length === 0 ? <Empty description="Noch keine Positionen" /> : lineCards}</div>
          ) : (
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={lines}
              columns={lineColumns}
              scroll={{ x: 1100 }}
              locale={{ emptyText: 'Noch keine Positionen' }}
              rowClassName={(line) => (line.kind === 'HEADING' ? 'document-heading-row' : '')}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <table style={{ minWidth: 300 }}>
              <tbody>
                <tr>
                  <td>Nettosumme</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(totals.net)}</td>
                </tr>
                {totals.vatGroups.map((group) => (
                  <tr key={group.vatRate}>
                    <td>zzgl. {group.vatRate} % USt</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(group.vat)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <td style={{ borderTop: '1px solid #999', paddingTop: 4 }}>Gesamtsumme</td>
                  <td style={{ borderTop: '1px solid #999', paddingTop: 4, textAlign: 'right' }}>
                    {formatMoney(totals.gross)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {dirty && (
            <Typography.Text type="secondary">
              Vorschau – die Summen werden beim Speichern serverseitig berechnet.
            </Typography.Text>
          )}
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Form.Item name="closingText" label="Schlusstext" style={{ marginBottom: 0 }}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
        </Card>
      </Form>
    </div>
  );
}
