import { useQuery } from '@tanstack/react-query';
import { Empty, Progress, Space, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { getOfficeDashboard } from '../../api/dashboard';
import { documentPath, formatDate, formatMoney } from '../../utils/labels';
import { DocumentType } from '../../types';
import { WidgetCard } from './WidgetCard';

// One shared request feeds all office widgets (react-query de-duplicates it).
function useOffice() {
  return useQuery({ queryKey: ['dashboard', 'office'], queryFn: getOfficeDashboard, refetchInterval: 60000 });
}

const big = { fontSize: 22 } as const;

export function OpenItemsWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Offene Posten" link="/invoices" loading={isLoading}>
      {data && (
        <>
          <Space size="large" wrap>
            <Statistic title="Offen" value={formatMoney(data.openItems.open)} valueStyle={big} />
            <Statistic title="davon überfällig" value={formatMoney(data.openItems.overdue)} valueStyle={{ ...big, color: Number(data.openItems.overdue) > 0 ? '#cf1322' : undefined }} />
          </Space>
          {data.openItems.top.map((item) => (
            <div key={item.documentId + item.number} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
              <span>
                <Link to={documentPath(item.documentType as DocumentType, item.documentId)}>{item.number}</Link> {item.recipientName}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {item.overdueDays > 0 && <Tag color="red">{item.overdueDays} T</Tag>}
                {formatMoney(item.open)}
              </span>
            </div>
          ))}
        </>
      )}
    </WidgetCard>
  );
}

export function DunningWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Mahnvorschlag" link="/invoices" loading={isLoading}>
      {data && (
        <>
          <Statistic title="Rechnungen zu mahnen" value={data.dunning.count} valueStyle={{ ...big, color: data.dunning.count > 0 ? '#d46b08' : undefined }} />
          <Typography.Text type="secondary">Offener Betrag {formatMoney(data.dunning.open)}</Typography.Text>
        </>
      )}
    </WidgetCard>
  );
}

export function IncomingWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Eingangsrechnungen" link="/incoming-invoices" loading={isLoading}>
      {data && (
        <>
          <Space size="large" wrap>
            <Statistic title="Zu prüfen" value={data.incoming.toReview.count} valueStyle={big} />
            <Statistic title="Freigegeben, zu bezahlen" value={formatMoney(data.incoming.toPay.gross)} valueStyle={big} />
          </Space>
          {data.incoming.nextDue.map((invoice) => (
            <div key={invoice.number} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
              <span>{invoice.supplier ?? invoice.number}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{formatDate(invoice.dueDate)} · {formatMoney(invoice.gross)}</span>
            </div>
          ))}
        </>
      )}
    </WidgetCard>
  );
}

// Money in vs. money out per week as plain bars (no chart library needed for 9 rows).
export function LiquidityWidget() {
  const { data, isLoading } = useOffice();
  const rows = data?.liquidity.rows.filter((row) => Number(row.inflow) > 0 || Number(row.outflow) > 0) ?? [];
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.inflow), Number(row.outflow)]));
  return (
    <WidgetCard title="Liquidität (nach Fälligkeit)" loading={isLoading}>
      {data && (
        <>
          <Space size="large" wrap>
            <Statistic title="Erwartet" value={formatMoney(data.liquidity.inflow)} valueStyle={{ ...big, color: '#389e0d' }} />
            <Statistic title="Auszahlungen" value={formatMoney(data.liquidity.outflow)} valueStyle={{ ...big, color: '#cf1322' }} />
            <Statistic title="Saldo" value={formatMoney(data.liquidity.balance)} valueStyle={big} />
          </Space>
          {rows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nichts fällig" />}
          {rows.map((row) => (
            <div key={row.label} style={{ marginTop: 8 }} data-testid="liquidity-row">
              <small>{row.label === 'overdue' ? 'Überfällig / sofort' : `Woche ab ${formatDate(row.label)}`}</small>
              <div style={{ background: '#52c41a', height: 8, width: `${(Number(row.inflow) / max) * 100}%`, borderRadius: 2 }} title={`Einnahmen ${formatMoney(row.inflow)}`} />
              <div style={{ background: '#f5222d', height: 8, width: `${(Number(row.outflow) / max) * 100}%`, borderRadius: 2, marginTop: 2 }} title={`Ausgaben ${formatMoney(row.outflow)}`} />
            </div>
          ))}
        </>
      )}
    </WidgetCard>
  );
}

export function QuotesWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Angebote" link="/quotes" loading={isLoading}>
      {data && (
        <>
          <Space size="large" wrap>
            <Statistic title="Offen" value={data.quotes.open.count} suffix={`· ${formatMoney(data.quotes.open.gross)}`} valueStyle={big} />
            <Statistic title="Angenommen" value={data.quotes.accepted.count} valueStyle={big} />
          </Space>
          <div style={{ marginTop: 8 }}>
            Annahmequote
            <Progress percent={data.quotes.acceptanceRate ?? 0} size="small" format={(p) => (data.quotes.acceptanceRate === null ? '–' : `${p} %`)} />
          </div>
          {data.quotes.staleOpen > 0 && <Tag color="orange">{data.quotes.staleOpen} Angebot(e) seit über 14 Tagen ohne Antwort</Tag>}
        </>
      )}
    </WidgetCard>
  );
}

export function UnbilledWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Aufträge noch nicht abgerechnet" link="/orders" loading={isLoading}>
      {data && (
        <>
          <Statistic title={`${data.unbilledOrders.count} Auftrag/Aufträge, netto offen`} value={formatMoney(data.unbilledOrders.openNet)} valueStyle={big} />
          {data.unbilledOrders.top.map((order) => (
            <div key={order.id} style={{ marginTop: 6 }}>
              <Link to={`/orders/${order.id}`}>{order.number}</Link> {order.project}
              <Progress percent={order.percentBilled} size="small" />
            </div>
          ))}
        </>
      )}
    </WidgetCard>
  );
}

export function TimeApprovalsWidget() {
  const { data, isLoading } = useOffice();
  return (
    <WidgetCard title="Zeiten zur Freigabe" link="/time" loading={isLoading}>
      {data && (
        <>
          <Statistic title={`${data.timeApprovals.employees} Mitarbeiter`} value={`${data.timeApprovals.hours} Std.`} valueStyle={big} />
          {data.timeApprovals.list.map((entry) => (
            <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span>{entry.name}</span>
              <span>{entry.hours} Std.</span>
            </div>
          ))}
          {data.timeApprovals.employees === 0 && <Typography.Text type="secondary">Alles freigegeben</Typography.Text>}
        </>
      )}
    </WidgetCard>
  );
}
