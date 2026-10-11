import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Modal, Select, Typography, Upload, message, notification } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { importGaeb } from '../api/documents';
import { listProjects } from '../api/projects';
import { apiErrorMessage } from '../utils/assets';
import { documentPath } from '../utils/labels';

// GAEB DA XML exchange phases X81 ... X89 and generic .xml
const GAEB_ACCEPT = '.x81,.x82,.x83,.x84,.x85,.x86,.x87,.x89,.xml';

interface GaebImportButtonProps {
  // Target project. Without it a dialog asks for the project first.
  projectId?: string;
}

// Imports a bill of quantities (Leistungsverzeichnis, GAEB DA XML) as a new quote draft.
export function GaebImportButton({ projectId }: GaebImportButtonProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenProject, setChosenProject] = useState<string | undefined>();

  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => listProjects({ pageSize: 200 }),
    enabled: pickerOpen && !projectId,
  });

  const importMutation = useMutation({
    mutationFn: ({ project, file }: { project: string; file: File }) => importGaeb(project, file),
    onSuccess: (result) => {
      const lines = result.document.items.length;
      message.success(
        `${lines} Zeilen aus der GAEB-Datei übernommen (Phase X${result.source.phase ?? '?'}, Version ${result.source.version ?? '?'}). Bitte Preise ergänzen und prüfen.`,
        6,
      );
      if (result.warnings.length > 0) {
        notification.warning({
          message: 'GAEB-Import mit Hinweisen',
          description: result.warnings.join('\n'),
          duration: 0,
        });
      }
      setPickerOpen(false);
      navigate(documentPath(result.document.type, result.document.id));
    },
    onError: (error) => message.error(apiErrorMessage(error, 'Der GAEB-Import ist fehlgeschlagen.')),
  });

  const upload = (project: string | undefined) => (
    <Upload
      accept={GAEB_ACCEPT}
      showUploadList={false}
      disabled={!project}
      beforeUpload={(file) => {
        if (project) {
          importMutation.mutate({ project, file });
        }
        return false;
      }}
    >
      <Button icon={<UploadOutlined />} disabled={!project} loading={importMutation.isPending}>
        GAEB-Datei wählen
      </Button>
    </Upload>
  );

  if (projectId) {
    return upload(projectId);
  }

  return (
    <>
      <Button icon={<UploadOutlined />} onClick={() => setPickerOpen(true)}>
        GAEB-Import
      </Button>
      <Modal
        title="GAEB-Import: Projekt wählen"
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
      >
        <Typography.Paragraph type="secondary">
          Aus dem Leistungsverzeichnis (GAEB DA XML, z.B. .x83) wird ein Angebotsentwurf im gewählten Projekt
          erstellt.
        </Typography.Paragraph>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Projekt wählen"
          style={{ width: '100%', marginBottom: 16 }}
          value={chosenProject}
          onChange={setChosenProject}
          options={(projects?.items ?? []).map((project) => ({
            value: project.id,
            label: `${project.number} · ${project.name}`,
          }))}
        />
        {upload(chosenProject)}
      </Modal>
    </>
  );
}
