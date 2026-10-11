import { useRef, useState } from 'react';
import { Button, Image, Space, Upload, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { apiErrorMessage, assetUrl } from '../utils/assets';
import { IMAGE_ACCEPT } from './ImageUpload';

export interface GalleryImage {
  id: string;
  path: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  maxImages?: number;
  onAdd: (file: File) => Promise<unknown>;
  onRemove: (imageId: string) => Promise<unknown>;
}

// Multi-picture control used for services and articles: thumbnails with preview, delete and add.
export function ImageGallery({ images, maxImages = 10, onAdd, onRemove }: ImageGalleryProps) {
  const [busy, setBusy] = useState(false);
  // Uploads are chained so several selected files are stored one after another (stable ordering).
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function enqueue(action: () => Promise<unknown>) {
    setBusy(true);
    queue.current = queue.current
      .then(action)
      .catch((error) => void message.error(apiErrorMessage(error, 'Bild konnte nicht gespeichert werden.')))
      .finally(() => setBusy(false));
  }

  return (
    <Space wrap align="start">
      <Image.PreviewGroup>
        {images.map((image) => (
          <div key={image.id} style={{ position: 'relative' }}>
            <Image
              src={assetUrl(image.path)}
              width={96}
              height={72}
              style={{ objectFit: 'cover', borderRadius: 4 }}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ position: 'absolute', top: 2, right: 2 }}
              onClick={() => enqueue(() => onRemove(image.id))}
            />
          </div>
        ))}
      </Image.PreviewGroup>
      {images.length < maxImages && (
        <Upload
          accept={IMAGE_ACCEPT}
          multiple
          showUploadList={false}
          beforeUpload={(file) => {
            enqueue(() => onAdd(file));
            return false;
          }}
        >
          <Button icon={<PlusOutlined />} loading={busy} style={{ width: 96, height: 72 }}>
            Bild
          </Button>
        </Upload>
      )}
    </Space>
  );
}
