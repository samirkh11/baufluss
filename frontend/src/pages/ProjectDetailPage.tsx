import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Result,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteProject, getProject } from '../api/projects';
import { useAuth } from '../auth/AuthContext';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { ReportsPanel } from '../components/ReportsPanel';
import { apiErrorMessage, assetUrl } from '../utils/assets';
import { customerName, DOCUMENT_TYPE_PLURAL, formatDate, PROJECT_STATUS, siteAddress } from '../utils/labels';

// Project overview: master data on top, the project's documents below. Quotes, orders and invoices
// get their own tabs here in the upcoming blocks; reports are available from the start.
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const {
    data: project,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['projects', 'detail', id], queryFn: () => getProject(id) });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      message.success('Projekt gelöscht.');
      // Drop the detail query first so the page doesn't try to reload the project it just deleted.
      queryClient.removeQueries({ queryKey: ['projects', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Löschen fehlgeschlagen.')),
  });

  if (isLoading) {
    return null;
  }
  if (isError || !project) {
    return (
      <Result
        status="404"
        title="Projekt nicht gefunden"
        extra={<Link to="/projects">Zur Projektliste</Link>}
      />
    );
  }

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const status = PROJECT_STATUS[project.status];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {project.number} · {project.name} <Tag color={status.color}>{status.label}</Tag>
        </Typography.Title>
        {canManage && (
          <Space>
            <Button onClick={() => setEditOpen(true)}>Bearbeiten</Button>
            <Popconfirm
              title="Projekt mit allen Berichten löschen?"
              onConfirm={() => deleteMutation.mutate()}
            >
              <Button danger>Löschen</Button>
            </Popconfirm>
          </Space>
        )}
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="Kunde">{customerName(project.customer) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Baustelle">{siteAddress(project) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Zeitraum">
            {project.startDate || project.endDate
              ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`
              : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Projektleiter">
            {project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Team" span="filled">
            <Avatar.Group size="small">
              {project.members.map((member) => (
                <Tooltip key={member.id} title={`${member.firstName} ${member.lastName}`}>
                  <Avatar src={member.imagePath ? assetUrl(member.imagePath) : undefined}>
                    {member.firstName[0]}
                  </Avatar>
                </Tooltip>
              ))}
            </Avatar.Group>
            {project.members.length === 0 && '—'}
          </Descriptions.Item>
          {project.description && (
            <Descriptions.Item label="Beschreibung" span="filled">
              {project.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Tabs
        items={[
          // Documents contain prices: only the office (OWNER/ADMIN) sees them.
          ...(canManage
            ? (['QUOTE', 'ORDER', 'INVOICE'] as const).map((type) => ({
                key: type,
                label: `${DOCUMENT_TYPE_PLURAL[type]} (${project.documentCounts?.[type] ?? 0})`,
                children: <DocumentsPanel type={type} projectId={project.id} />,
              }))
            : []),
          {
            key: 'reports',
            label: `Berichte (${project._count.reports})`,
            children: <ReportsPanel projectId={project.id} />,
          },
        ]}
      />

      <ProjectFormModal
        open={editOpen}
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ['projects'] });
        }}
      />
    </div>
  );
}
