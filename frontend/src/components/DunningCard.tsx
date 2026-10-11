import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Popconfirm, Space, Switch, Table, Tag, message } from 'antd';
import { deleteDunning, listDunnings, openDunningPdf, setDunningBlock } from '../api/dunning';
import { apiErrorMessage } from '../utils/assets';
import { DUNNING_LEVEL, formatDate, formatMoney } from '../utils/labels';
import { DunningModal } from './DunningModal';

interface DunningCardProps {
  documentId: string;
  invoiceNumber?: string | null;
  blocked: boolean;
  blockReason?: string | null;
  canDunn: boolean; // invoice still has an open amount
  onChanged: () => void;
}

// Dunning section of an issued invoice: history of letters, Mahnsperre switch and "Mahnung erstellen".
export function DunningCard({ documentId, invoiceNumber, blocked, blockReason, canDunn, onChanged }: DunningCardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(blockReason ?? '');
  const { data: letters = [] } = useQuery({ queryKey: ['dunning', 'list', documentId], queryFn: () => listDunnings(documentId) });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dunning'] });
    queryClient.invalidateQueries({ queryKey: ['receivables'] });
    onChanged();
  };

  const blockMutation = useMutation({
    mutationFn: (value: boolean) => setDunningBlock(documentId, value, value ? reason : undefined),
    onSuccess: refresh,
    onError: (err) => void message.error(apiErrorMessage(err, 'Mahnsperre konnte nicht geändert werden.')),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDunning,
    onSuccess: refresh,
    onError: (err) => void message.error(apiErrorMessage(err, 'Löschen fehlgeschlagen.')),
  });

  return (
    <Card title="Mahnungen" style={{ marginTop: 16 }} data-testid="dunning-card">
      <Space wrap style={{ marginBottom: 12 }}>
        <Switch checked={blocked} loading={blockMutation.isPending} onChange={(value) => blockMutation.mutate(value)} data-testid="dunning-block" />
        <span>Mahnsperre</span>
        <Input placeholder="Grund (z. B. Reklamation)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 240, maxWidth: '100%' }} />
        <Button type="primary" disabled={!canDunn || blocked} onClick={() => setOpen(true)}>
          Mahnung erstellen
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={letters}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Noch keine Mahnung' }}
        columns={[
          { title: 'Nr.', dataIndex: 'number' },
          { title: 'Stufe', render: (_, row) => <Tag color={DUNNING_LEVEL[row.level].color}>{DUNNING_LEVEL[row.level].label}</Tag> },
          { title: 'Datum', render: (_, row) => formatDate(row.dunningDate) },
          { title: 'Frist', render: (_, row) => formatDate(row.dueDate) },
          { title: 'Gesamt', align: 'right', render: (_, row) => formatMoney(row.totalAmount) },
          {
            title: '',
            render: (_, row, index) => (
              <Space>
                <Button size="small" onClick={() => void openDunningPdf(row.id)}>PDF</Button>
                {index === letters.length - 1 && (
                  <Popconfirm title="Letzte Mahnung löschen?" onConfirm={() => deleteMutation.mutate(row.id)}>
                    <Button size="small" danger>Löschen</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <DunningModal
        open={open}
        documentId={documentId}
        invoiceNumber={invoiceNumber}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          refresh();
        }}
      />
    </Card>
  );
}
