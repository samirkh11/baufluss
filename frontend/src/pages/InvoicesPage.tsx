import { Tabs } from 'antd';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { ReceivablesPanel } from '../components/ReceivablesPanel';

// Invoices, open items (payments) and credit notes (Storno) in one place.
export function InvoicesPage() {
  return (
    <Tabs
      items={[
        { key: 'invoices', label: 'Rechnungen', children: <DocumentsPanel type="INVOICE" /> },
        { key: 'open', label: 'Offene Posten', children: <ReceivablesPanel /> },
        // Credit notes are created by cancelling an invoice, never directly.
        {
          key: 'credit',
          label: 'Stornorechnungen',
          children: <DocumentsPanel type="CREDIT_NOTE" allowCreate={false} />,
        },
      ]}
    />
  );
}
