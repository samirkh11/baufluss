import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dropdown, Empty, Space, Typography, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useAuth } from '../auth/useAuth';
import { DashboardItem, getDashboardLayout, resetDashboardLayout, saveDashboardLayout } from '../api/dashboard';
import { defaultLayout, WIDGETS, widgetsFor } from '../components/dashboard/registry';
import { useIsPhone } from '../hooks/useMediaQuery';
import { apiErrorMessage } from '../utils/assets';

const Grid = WidthProvider(GridLayout);

// Start page: a per-user arrangement of widgets (drag, resize, hide). Phones show the same widgets
// as a single column in layout order; arranging needs a larger screen.
export function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const phone = useIsPhone();
  const isOffice = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const available = useMemo(() => widgetsFor(isOffice), [isOffice]);

  const { data: stored, isLoading } = useQuery({ queryKey: ['dashboard', 'layout'], queryFn: getDashboardLayout });
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DashboardItem[]>([]);

  // Saved layout (only widgets that still exist and are allowed for the role), else the role default.
  const baseLayout = useMemo(() => {
    const allowed = new Set(available.map((widget) => widget.id));
    return (stored ?? defaultLayout(isOffice)).filter((item) => allowed.has(item.id));
  }, [stored, isOffice, available]);

  useEffect(() => {
    if (!editing) setItems(baseLayout);
  }, [baseLayout, editing]);

  const saveMutation = useMutation({
    mutationFn: () => saveDashboardLayout(items),
    onSuccess: () => {
      queryClient.setQueryData(['dashboard', 'layout'], items);
      setEditing(false);
      message.success('Dashboard gespeichert.');
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Speichern fehlgeschlagen.')),
  });
  const resetMutation = useMutation({
    mutationFn: resetDashboardLayout,
    onSuccess: () => {
      queryClient.setQueryData(['dashboard', 'layout'], null);
      setEditing(false);
    },
  });

  const hidden = available.filter((widget) => !items.some((item) => item.id === widget.id));
  const addWidget = (id: string) => {
    const widget = WIDGETS.find((w) => w.id === id)!;
    const bottom = Math.max(0, ...items.map((item) => item.y + item.h));
    setItems([...items, { id, x: 0, y: bottom, w: widget.w, h: widget.h }]);
  };

  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Willkommen, {user?.firstName}!</Typography.Title>
        {!phone && (
          <Space wrap>
            {!editing && <Button onClick={() => setEditing(true)} data-testid="dashboard-edit">Dashboard anpassen</Button>}
            {editing && (
              <>
                <Dropdown
                  disabled={hidden.length === 0}
                  menu={{ items: hidden.map((widget) => ({ key: widget.id, label: widget.title })), onClick: ({ key }) => addWidget(key) }}
                >
                  <Button data-testid="dashboard-add">Widget hinzufügen{hidden.length ? ` (${hidden.length})` : ''}</Button>
                </Dropdown>
                <Button onClick={() => resetMutation.mutate()} loading={resetMutation.isPending}>Standard</Button>
                <Button onClick={() => { setItems(baseLayout); setEditing(false); }}>Abbrechen</Button>
                <Button type="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="dashboard-save">Speichern</Button>
              </>
            )}
          </Space>
        )}
      </Space>

      {!isLoading && ordered.length === 0 && <Empty description="Keine Widgets. Über „Dashboard anpassen“ hinzufügen." />}

      {phone ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {ordered.map((item) => {
            const Widget = WIDGETS.find((w) => w.id === item.id)!.component;
            return <div key={item.id} data-testid={`widget-${item.id}`} style={{ minHeight: 120 }}><Widget /></div>;
          })}
        </Space>
      ) : (
        <Grid
          className="dashboard-grid"
          cols={12}
          rowHeight={60}
          margin={[12, 12]}
          isDraggable={editing}
          isResizable={editing}
          draggableCancel=".dashboard-no-drag"
          layout={items.map((item) => {
            const widget = WIDGETS.find((w) => w.id === item.id)!;
            return { i: item.id, x: item.x, y: item.y, w: item.w, h: item.h, minW: widget.minW, minH: widget.minH };
          })}
          onLayoutChange={(layout) => {
            if (editing) setItems(layout.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
          }}
        >
          {items.map((item) => {
            const widget = WIDGETS.find((w) => w.id === item.id)!;
            const Widget = widget.component;
            return (
              <div key={item.id} data-testid={`widget-${item.id}`} style={{ outline: editing ? '2px dashed #91caff' : 'none', borderRadius: 8, position: 'relative' }}>
                <Widget />
                {editing && (
                  <Button
                    className="dashboard-no-drag"
                    size="small"
                    shape="circle"
                    icon={<CloseOutlined />}
                    aria-label={`${widget.title} ausblenden`}
                    style={{ position: 'absolute', top: 6, right: 6, zIndex: 5 }}
                    onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                  />
                )}
              </div>
            );
          })}
        </Grid>
      )}
    </div>
  );
}
