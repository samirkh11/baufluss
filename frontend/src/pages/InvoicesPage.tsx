import { Tabs } from 'antd';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { DunningProposalsPanel } from '../components/DunningProposalsPanel';
import { ReceivablesPanel } from '../components/ReceivablesPanel';

// Invoices, open items (payments) and credit notes (Storno) in one place.
export function InvoicesPage() {
  return (
    <Tabs
      items={[
        { key: 'invoices', label: 'Rechnungen', children: <DocumentsPanel type="INVOICE" /> },
        { key: 'open', label: 'Offene Posten', children: <ReceivablesPanel /> },
        { key: 'dunning', label: 'Mahnwesen', children: <DunningProposalsPanel /> },
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
