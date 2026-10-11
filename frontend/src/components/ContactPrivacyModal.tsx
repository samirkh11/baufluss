import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Modal, Popconfirm, Space, Typography, message } from 'antd';
import { downloadContactExport, eraseContact, getErasureInfo } from '../api/compliance';
import { apiErrorMessage } from '../utils/assets';
import { formatDate } from '../utils/labels';

interface ContactPrivacyModalProps {
  contact: { id: string; number: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
}

// Data subject rights for one contact: access (JSON export) and erasure. Contacts on retained
// documents are anonymized instead of deleted; the issued documents keep their frozen address block.
export function ContactPrivacyModal({ contact, onClose, onChanged }: ContactPrivacyModalProps) {
  const { data: info } = useQuery({
    queryKey: ['compliance', 'erasure', contact?.id],
    queryFn: () => getErasureInfo(contact!.id),
    enabled: !!contact,
  });
  const exportMutation = useMutation({
    mutationFn: () => downloadContactExport(contact!.id, contact!.number ?? contact!.id),
    onError: (error) => void message.error(apiErrorMessage(error, 'Export fehlgeschlagen.')),
  });
  const eraseMutation = useMutation({
    mutationFn: () => eraseContact(contact!.id),
    onSuccess: (result) => {
      message.success(result.result === 'deleted' ? 'Kontakt gelöscht.' : 'Kontakt anonymisiert.');
      onChanged();
      onClose();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  return (
    <Modal open={!!contact} onCancel={onClose} footer={null} title="Datenschutz (DSGVO)" destroyOnHidden>
      <Typography.Title level={5}>Auskunft (Art. 15, 20)</Typography.Title>
      <Typography.Paragraph>Alle zu diesem Kontakt gespeicherten Daten als maschinenlesbare Datei.</Typography.Paragraph>
      <Button loading={exportMutation.isPending} onClick={() => exportMutation.mutate()} data-testid="contact-export">Datenauskunft herunterladen (JSON)</Button>

      <Typography.Title level={5} style={{ marginTop: 24 }}>Löschung (Art. 17)</Typography.Title>
      {info?.alreadyErased && <Alert type="info" showIcon message="Die personenbezogenen Daten dieses Kontakts wurden bereits anonymisiert." />}
      {info && !info.alreadyErased && (
        <>
          {info.canDeleteCompletely ? (
            <Alert type="success" showIcon style={{ marginBottom: 12 }} message="Es bestehen keine Aufbewahrungspflichten. Der Kontakt wird vollständig gelöscht." />
          ) : (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Löschung nur als Anonymisierung möglich"
              description={`Der Kontakt ist noch gebunden an: ${info.blockers.join('; ')}.${info.retainUntil ? ` Aufbewahrung bis ${formatDate(info.retainUntil)}.` : ''} Stammdaten (Anschrift, Kontaktdaten, Bankdaten, Notizen) werden entfernt; die ausgestellten Belege bleiben unverändert, wie es das Steuerrecht verlangt.`}
            />
          )}
          <Space>
            <Popconfirm title="Wirklich löschen bzw. anonymisieren? Das lässt sich nicht rückgängig machen." okText="Ja" cancelText="Abbrechen" onConfirm={() => eraseMutation.mutate()}>
              <Button danger loading={eraseMutation.isPending} data-testid="contact-erase">{info.canDeleteCompletely ? 'Kontakt löschen' : 'Kontakt anonymisieren'}</Button>
            </Popconfirm>
          </Space>
        </>
      )}
    </Modal>
  );
}
