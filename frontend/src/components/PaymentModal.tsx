import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import { addPayment } from '../api/payments';
import { PaymentMethod, PaymentTarget } from '../types';
import { apiErrorMessage } from '../utils/assets';
import { berlinNow } from '../utils/dates';
import { optionsOf, PAYMENT_METHOD } from '../utils/labels';

interface PaymentModalProps {
  open: boolean;
  documentId: string;
  title: string; // e.g. "Zahlung zu RE-00004"
  target?: PaymentTarget; // RETENTION to book the Sicherheitseinbehalt
  defaultAmount?: number; // pre-filled with the open amount
  defaultReference?: string;
  refund?: boolean; // credit note: money paid back to the customer
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  paidAt: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

// Dialog to book an incoming payment (or a refund) on an invoice.
export function PaymentModal({
  open,
  documentId,
  title,
  target = 'INVOICE',
  defaultAmount,
  defaultReference,
  refund,
  onClose,
  onSaved,
}: PaymentModalProps) {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        paidAt: berlinNow().date,
        amount: defaultAmount,
        method: 'BANK_TRANSFER',
        reference: defaultReference,
      });
    }
  }, [open, defaultAmount, defaultReference, form]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      addPayment(documentId, {
        ...values,
        target,
        reference: values.reference || undefined,
        note: values.note || undefined,
      }),
    onSuccess: () => {
      message.success(refund ? 'Erstattung gebucht.' : 'Zahlung gebucht.');
      onSaved();
    },
    onError: (error) => void message.error(apiErrorMessage(error, 'Buchen fehlgeschlagen.')),
  });

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Buchen"
      confirmLoading={saveMutation.isPending}
      forceRender
    >
      <Form layout="vertical" form={form} onFinish={(values) => saveMutation.mutate(values)}>
        <Form.Item
          name="paidAt"
          label={refund ? 'Erstattet am' : 'Eingegangen am'}
          rules={[{ required: true }]}
        >
          <Input type="date" max={berlinNow().date} />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Betrag (€)"
          rules={[{ required: true, message: 'Bitte einen Betrag angeben' }]}
        >
          <InputNumber min={0.01} precision={2} decimalSeparator="," style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="method" label="Zahlungsart">
          <Select options={optionsOf(PAYMENT_METHOD)} />
        </Form.Item>
        <Form.Item name="reference" label="Verwendungszweck / Referenz">
          <Input />
        </Form.Item>
        <Form.Item name="note" label="Notiz">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
