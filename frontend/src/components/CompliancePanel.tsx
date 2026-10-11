import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Collapse, Form, Input, InputNumber, Row, Space, Typography, message } from 'antd';
import {
  ArchiveCheck,
  completeArchive,
  downloadDatev,
  downloadPrivacyDocumentation,
  downloadProcedureDocumentation,
  downloadTaxAuditExport,
  getComplianceSettings,
  updateComplianceSettings,
  verifyArchive,
} from '../api/compliance';
import { apiErrorMessage } from '../utils/assets';
import { berlinNow } from '../utils/dates';

const onError = (error: unknown) => void message.error(apiErrorMessage(error, 'Aktion fehlgeschlagen.'));
const number = { style: { width: '100%' } } as const;

// Company profile > Compliance: retention and documentation settings, archive check, process
// documentation, data protection papers, and the exports for the tax audit and DATEV.
export function CompliancePanel() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const lastYear = Number(berlinNow().date.slice(0, 4)) - 1;
  const [from, setFrom] = useState(`${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31`);
  const [check, setCheck] = useState<ArchiveCheck | null>(null);

  const { data } = useQuery({ queryKey: ['compliance', 'settings'], queryFn: getComplianceSettings });
  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: updateComplianceSettings,
    onSuccess: () => {
      message.success('Einstellungen gespeichert.');
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
    },
    onError,
  });
  const verifyMutation = useMutation({ mutationFn: verifyArchive, onSuccess: setCheck, onError });
  const completeMutation = useMutation({
    mutationFn: completeArchive,
    onSuccess: (result) => {
      message.success(`${result.archived} Beleg(e) nachträglich archiviert.`);
      verifyMutation.mutate();
    },
    onError,
  });
  const download = useMutation({ mutationFn: (action: () => Promise<void>) => action(), onError });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Archiv und Prüfung (GoBD)">
        <Typography.Paragraph>
          Jeder ausgestellte Beleg (und jede Mahnung) wird unveränderlich archiviert; Prüfsummen belegen, dass nichts verändert wurde. Aufbewahrungsfristen laufen ab Ende des Kalenderjahres des Belegs.
        </Typography.Paragraph>
        <Space wrap>
          <Button type="primary" loading={verifyMutation.isPending} onClick={() => verifyMutation.mutate()} data-testid="archive-verify">Archiv prüfen</Button>
          <Button loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>Fehlende Belege nachträglich archivieren</Button>
        </Space>
        {check && (
          <Alert
            style={{ marginTop: 12 }}
            data-testid="archive-result"
            type={check.ok ? 'success' : 'error'}
            showIcon
            message={check.ok ? `Archiv in Ordnung: ${check.checked} Dateien geprüft, alle Prüfsummen stimmen.` : 'Archivprüfung mit Befunden'}
            description={
              check.ok
                ? undefined
                : [
                    check.unarchivedDocuments > 0 ? `${check.unarchivedDocuments} ausgestellte Belege ohne Archivkopie. ` : '',
                    ...check.problems.map((problem) => `${problem.ref}: ${problem.problem === 'ALTERED' ? 'Datei verändert' : 'Datei fehlt'}. `),
                  ].join('')
            }
          />
        )}
      </Card>

      <Card title="Dokumentation">
        <Typography.Paragraph>Die Verfahrensdokumentation und die Datenschutz-Unterlagen werden aus den Einstellungen unten erzeugt. Mit „[bitte ergänzen]“ markierte Stellen müssen noch ergänzt werden.</Typography.Paragraph>
        <Space wrap>
          <Button loading={download.isPending} onClick={() => download.mutate(downloadProcedureDocumentation)} data-testid="download-procedure">Verfahrensdokumentation (PDF)</Button>
          <Button loading={download.isPending} onClick={() => download.mutate(downloadPrivacyDocumentation)}>Datenschutz: VVT &amp; TOM (PDF)</Button>
        </Space>
      </Card>

      <Card title="Betriebsprüfung und DATEV">
        <Typography.Paragraph>
          Datenträger nach GoBD (index.xml, CSV-Tabellen, Belege als PDF/XML, Verfahrensdokumentation) und DATEV-Buchungsstapel für den Steuerberater. Gewählt wird der Zeitraum nach Belegdatum.
        </Typography.Paragraph>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Von" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis" />
          <Button type="primary" loading={download.isPending} onClick={() => download.mutate(() => downloadTaxAuditExport(from, to))} data-testid="download-tax-audit">Betriebsprüfung (ZIP)</Button>
          <Button loading={download.isPending} onClick={() => download.mutate(() => downloadDatev(from, to))} data-testid="download-datev">DATEV-Buchungsstapel (CSV)</Button>
        </Space>
        <Alert type="info" showIcon message="Der DATEV-Export ist ein Entwurf (SKR03-Standardkonten, Bruttobuchungen je Steuersatz). Konten und Berater-/Mandantennummer stellst du unten ein; bitte mit dem Steuerberater abstimmen." />
      </Card>

      <Form layout="vertical" form={form} onFinish={(values) => saveMutation.mutate(values)}>
        <Card title="Einstellungen">
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="responsiblePerson" label="Verantwortliche Person (Verfahrensdokumentation)"><Input /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="retentionYearsInvoices" label="Aufbewahrung Rechnungen (Jahre)"><InputNumber min={1} max={30} {...number} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="retentionYearsOther" label="Aufbewahrung Geschäftsbriefe (Jahre)"><InputNumber min={1} max={30} {...number} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="hostingDescription" label="Hosting und Betrieb"><Input.TextArea rows={3} placeholder="Anbieter, Standort der Server, Verträge (AVV)" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="backupDescription" label="Datensicherung"><Input.TextArea rows={3} placeholder="Wie oft, wohin, wie getestet" /></Form.Item></Col>
          </Row>
          <Collapse
            ghost
            items={[
              {
                key: 'datev',
                label: 'DATEV-Konten',
                children: (
                  <Row gutter={16}>
                    <Col xs={12} md={6}><Form.Item name="datevAdvisorNumber" label="Beraternummer"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="datevClientNumber" label="Mandantennummer"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountRevenue19" label="Erlöse 19 %"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountRevenue7" label="Erlöse 7 %"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountRevenueExempt" label="Erlöse 0 % / § 13b"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountExpense19" label="Wareneingang 19 %"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountExpense7" label="Wareneingang 7 %"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountExpenseNoVat" label="Wareneingang ohne USt"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountBank" label="Bank"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountDebtorBase" label="Debitoren ab"><InputNumber {...number} /></Form.Item></Col>
                    <Col xs={12} md={6}><Form.Item name="accountCreditorBase" label="Kreditoren ab"><InputNumber {...number} /></Form.Item></Col>
                  </Row>
                ),
              },
            ]}
          />
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>Speichern</Button>
        </Card>
      </Form>
    </Space>
  );
}
