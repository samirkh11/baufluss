import { useMutation } from '@tanstack/react-query';
import { Button, Dropdown, message } from 'antd';
import { downloadEInvoice, EInvoiceFormat } from '../api/documents';
import { apiErrorMessage } from '../utils/assets';

const ITEMS = [
  { key: 'xrechnung-ubl', label: 'XRechnung (UBL, XML)' },
  { key: 'xrechnung-cii', label: 'XRechnung (CII, XML)' },
  { key: 'zugferd', label: 'ZUGFeRD / Factur-X (PDF mit XML)' },
];

// Download of the structured e-invoice of an issued invoice or credit note.
export function EInvoiceButton({ documentId }: { documentId: string }) {
  const mutation = useMutation({
    mutationFn: (format: EInvoiceFormat) => downloadEInvoice(documentId, format),
    onError: (error) => void message.error(apiErrorMessage(error, 'E-Rechnung konnte nicht erzeugt werden.')),
  });
  return (
    <Dropdown menu={{ items: ITEMS, onClick: ({ key }) => mutation.mutate(key as EInvoiceFormat) }}>
      <Button loading={mutation.isPending} data-testid="einvoice-button">E-Rechnung</Button>
    </Dropdown>
  );
}
