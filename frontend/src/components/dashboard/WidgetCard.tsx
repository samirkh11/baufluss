import { ReactNode } from 'react';
import { Card, Spin } from 'antd';
import { Link } from 'react-router-dom';

interface WidgetCardProps {
  title: string;
  link?: string; // "open" target shown in the header
  loading?: boolean;
  children: ReactNode;
}

// Common frame of all dashboard widgets: fills the grid cell, scrolls internally when content is taller.
export function WidgetCard({ title, link, loading, children }: WidgetCardProps) {
  return (
    <Card
      size="small"
      title={title}
      extra={link ? <Link to={link}>Öffnen</Link> : undefined}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, overflow: 'auto', minHeight: 0 } }}
    >
      {loading ? <Spin /> : children}
    </Card>
  );
}
