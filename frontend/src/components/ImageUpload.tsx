import { useState } from 'react';
import { Avatar, Button, Space, Upload, message } from 'antd';
import { DeleteOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { apiErrorMessage, assetUrl } from '../utils/assets';

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp';

interface ImageUploadProps {
  // Currently stored image path (null/undefined = no image yet).
  path?: string | null;
  size?: number;
  // Compact mode: only the clickable avatar, no text buttons (for table cells).
  compact?: boolean;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}

// Single-picture control used for contacts and employees: shows the picture and lets the user
// replace or remove it.
export function ImageUpload({ path, size = 80, compact = false, onUpload, onRemove }: ImageUploadProps) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Bild konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  const upload = (
    <Upload
      accept={IMAGE_ACCEPT}
      showUploadList={false}
      beforeUpload={(file) => {
        run(() => onUpload(file));
        return false;
      }}
    >
      {compact ? (
        <Avatar shape="square" size={size} src={path ? assetUrl(path) : undefined} icon={<UserOutlined />} style={{ cursor: 'pointer', opacity: busy ? 0.5 : 1 }} />
      ) : (
        <Button icon={<UploadOutlined />} loading={busy}>
          {path ? 'Bild ersetzen' : 'Bild hochladen'}
        </Button>
      )}
    </Upload>
  );

  if (compact) {
    return upload;
  }

  return (
    <Space align="center">
      <Avatar shape="square" size={size} src={path ? assetUrl(path) : undefined} icon={<UserOutlined />} />
      {upload}
      {path && (
        <Button icon={<DeleteOutlined />} danger disabled={busy} onClick={() => run(onRemove)}>
          Entfernen
        </Button>
      )}
    </Space>
  );
}
