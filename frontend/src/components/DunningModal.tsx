import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Descriptions, Modal, Select, message } from 'antd';
import { createDunning, openDunningPdf, previewDunning } from '../api/dunning';
import { DunningLevel } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { DUNNING_LEVEL, formatDate, formatMoney } from '../utils/labels';

const LEVELS: DunningLevel[] = ['REMINDER', 'FIRST', 'SECOND', 'FINAL'];

interface DunningModalProps {
  open: boolean;
  documentId: string;
  invoiceNumber?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

// Confirmation dialog for a dunning letter: shows the level, the amounts (fees, default interest,
// lump sum) and the new payment deadline before the letter is issued. The PDF opens afterwards.
export function DunningModal({ open, documentId, invoiceNumber, onClose, onCreated }: DunningModalProps) {
  const [level, setLevel] = useState<DunningLevel | undefined>();

  useEffect(() => {
    if (open) {
      setLevel(undefined);
    }
  }, [open]);

  const { data: preview, error } = useQuery({
    queryKey: ['dunning', 'preview', documentId, level],
    queryFn: () => previewDunning(documentId, level),
    enabled: open && !!documentId,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const letter = await createDunning(documentId, preview?.level);
      await openDunningPdf(letter.id);
      return letter;
    },
    onSuccess: () => {
      message.success('Mahnung erstellt.');
      onCreated();
    },
    onError: (err) => void message.error(apiErrorMessage(err, 'Mahnung konnte nicht erstellt werden.')),
  });

  const lastRank = preview?.lastLevel ? LEVELS.indexOf(preview.lastLevel) : -1;

  return (
    <Modal
      title={`Mahnung zu ${invoiceNumber ?? 'Rechnung'}`}
      open={open}
      onCancel={onClose}
      onOk={() => createMutation.mutate()}
      okText="Mahnung erstellen"
      okButtonProps={{ disabled: !preview || preview.blocked }}
      confirmLoading={createMutation.isPending}
      forceRender
    >
      {error && <Alert type="warning" showIcon message={apiErrorMessage(error, 'Keine Mahnung möglich.')} />}
      {preview?.blocked && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Mahnsperre${preview.blockReason ? `: ${preview.blockReason}` : ''}`} />}
      {preview && (
        <>
          <Select
            value={preview.level}
            style={{ width: '100%', marginBottom: 12 }}
            onChange={setLevel}
            options={LEVELS.map((value, index) => ({ value, label: DUNNING_LEVEL[value].label, disabled: index <= lastRank }))}
          />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Überfällig seit">{preview.overdueDays} Tagen</Descriptions.Item>
            <Descriptions.Item label="Offener Rechnungsbetrag">{formatMoney(preview.openAmount)}</Descriptions.Item>
            {Number(preview.interest) > 0 && (
              <Descriptions.Item label={`Verzugszinsen ${preview.interestRate} % für ${preview.interestDays} Tage`}>{formatMoney(preview.interest)}</Descriptions.Item>
            )}
            {Number(preview.fee) > 0 && <Descriptions.Item label="Mahngebühr">{formatMoney(preview.fee)}</Descriptions.Item>}
            {Number(preview.lumpSum) > 0 && <Descriptions.Item label="Verzugspauschale">{formatMoney(preview.lumpSum)}</Descriptions.Item>}
            <Descriptions.Item label="Gesamtforderung"><strong data-testid="dunning-total">{formatMoney(preview.total)}</strong></Descriptions.Item>
            <Descriptions.Item label="Zahlungsfrist bis">{formatDate(preview.dueDate)}</Descriptions.Item>
          </Descriptions>
          <p style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
            Gebühren, Zinsen und Pauschale sind Nebenforderungen: Zahlungen werden weiterhin nur auf den Rechnungsbetrag gebucht.
          </p>
        </>
      )}
    </Modal>
  );
}
