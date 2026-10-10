import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Tabs, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { getOwnCompany, updateOwnCompany, uploadCompanyLogo } from '../api/companies';
import { Company } from '../types';
import { NumberSequencesPanel } from './NumberSequencesPanel';

export function CompanyProfilePage() {
  const queryClient = useQueryClient();
  const { data: company, isLoading } = useQuery({ queryKey: ['company'], queryFn: getOwnCompany });
  const [form] = Form.useForm<Company>();

  useEffect(() => {
    if (company) {
      form.setFieldsValue(company);
    }
  }, [company, form]);

  const updateMutation = useMutation({
    mutationFn: updateOwnCompany,
    onSuccess: () => {
      message.success('Firmenprofil gespeichert.');
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });

  const logoMutation = useMutation({
    mutationFn: uploadCompanyLogo,
    onSuccess: () => {
      message.success('Logo hochgeladen.');
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });

  if (isLoading) {
    return null;
  }

  return (
    <Tabs
      items={[
        {
          key: 'profile',
          label: 'Firmendaten',
          children: (
            <Card>
              <Form layout="vertical" form={form} onFinish={(values) => updateMutation.mutate(values)}>
                <Form.Item name="name" label="Firmenname" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="legalForm" label="Rechtsform">
                  <Input placeholder="z.B. GmbH, Einzelunternehmen" />
                </Form.Item>
                <Form.Item name="street" label="Straße &amp; Hausnummer">
                  <Input />
                </Form.Item>
                <Form.Item name="zipCode" label="PLZ">
                  <Input />
                </Form.Item>
                <Form.Item name="city" label="Ort">
                  <Input />
                </Form.Item>
                <Form.Item name="taxId" label="Steuernummer">
                  <Input />
                </Form.Item>
                <Form.Item name="vatId" label="USt-IdNr.">
                  <Input />
                </Form.Item>
                <Form.Item name="iban" label="IBAN">
                  <Input />
                </Form.Item>
                <Form.Item name="bic" label="BIC">
                  <Input />
                </Form.Item>
                <Form.Item name="email" label="E-Mail">
                  <Input />
                </Form.Item>
                <Form.Item name="phone" label="Telefon">
                  <Input />
                </Form.Item>
                <Form.Item name="website" label="Website">
                  <Input />
                </Form.Item>
                <Form.Item name="letterheadHeaderText" label="Briefkopf-Text">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="letterheadFooterText" label="Brieffuß-Text">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
                  Speichern
                </Button>
              </Form>
            </Card>
          ),
        },
        {
          key: 'logo',
          label: 'Logo',
          children: (
            <Card>
              {company?.logoPath && (
                <img
                  src={`${import.meta.env.VITE_API_BASE_URL}${company.logoPath}`}
                  alt="Firmenlogo"
                  style={{ maxWidth: 240, display: 'block', marginBottom: 16 }}
                />
              )}
              <Upload
                beforeUpload={(file) => {
                  logoMutation.mutate(file);
                  return false;
                }}
                showUploadList={false}
                accept=".png,.jpg,.jpeg,.svg,.webp"
              >
                <Button icon={<UploadOutlined />} loading={logoMutation.isPending}>
                  Logo hochladen
                </Button>
              </Upload>
            </Card>
          ),
        },
        {
          key: 'number-sequences',
          label: 'Nummernkreise',
          children: <NumberSequencesPanel />,
        },
      ]}
    />
  );
}
