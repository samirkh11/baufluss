import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Avatar, Button, Input, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { listProjects } from '../api/projects';
import { useAuth } from '../auth/AuthContext';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { Project, ProjectStatus } from '../types';
import { assetUrl } from '../utils/assets';
import { customerName, formatDate, optionsOf, PROJECT_STATUS, siteAddress } from '../utils/labels';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<ProjectStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const params = { status: status === 'ALL' ? undefined : status, q: search || undefined, page };
  const { data, isLoading } = useQuery({
    queryKey: ['projects', params],
    queryFn: () => listProjects(params),
    placeholderData: keepPreviousData,
  });

  const canCreate = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div>
      <Tabs
        activeKey={status}
        onChange={(key) => {
          setStatus(key as ProjectStatus | 'ALL');
          setPage(1);
        }}
        items={[
          { key: 'ALL', label: 'Alle' },
          ...optionsOf(PROJECT_STATUS).map((o) => ({ key: o.value, label: o.label })),
        ]}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Neues Projekt
          </Button>
        )}
        <Input.Search
          placeholder="Suchen (Name, Nr., Kunde, Ort)"
          allowClear
          style={{ width: 320, maxWidth: '100%' }}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </Space>

      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          { title: 'Nr.', dataIndex: 'number', width: 90 },
          {
            title: 'Projekt',
            render: (_, project: Project) => <Link to={`/projects/${project.id}`}>{project.name}</Link>,
          },
          { title: 'Kunde', render: (_, project: Project) => customerName(project.customer) },
          { title: 'Baustelle', responsive: ['md'], render: (_, project: Project) => siteAddress(project) },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: ProjectStatus) => (
              <Tag color={PROJECT_STATUS[value].color}>{PROJECT_STATUS[value].label}</Tag>
            ),
          },
          {
            title: 'Zeitraum',
            responsive: ['md'],
            render: (_, project: Project) =>
              project.startDate || project.endDate
                ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`
                : '',
          },
          {
            title: 'Team',
            responsive: ['md'],
            render: (_, project: Project) => (
              <Avatar.Group size="small" max={{ count: 4 }}>
                {project.members.map((member) => (
                  <Tooltip key={member.id} title={`${member.firstName} ${member.lastName}`}>
                    <Avatar src={member.imagePath ? assetUrl(member.imagePath) : undefined}>
                      {member.firstName[0]}
                    </Avatar>
                  </Tooltip>
                ))}
              </Avatar.Group>
            ),
          },
          {
            title: 'Berichte',
            width: 90,
            align: 'right',
            render: (_, project: Project) => project._count.reports,
          },
        ]}
      />

      <ProjectFormModal
        open={modalOpen}
        project={null}
        onClose={() => setModalOpen(false)}
        onSaved={(saved) => {
          setModalOpen(false);
          navigate(`/projects/${saved.id}`);
        }}
      />
    </div>
  );
}
