// Turns a stored upload path (e.g. "/uploads/contacts/x.png") into a full URL served by the API.
export function assetUrl(path: string): string {
  return `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}${path}`;
}

// NOTE: antd's message.* returns a thenable that resolves when the toast closes (~3 s). Never
// return it from a react-query onError/onSuccess handler (use `=> void message.error(...)` or a
// block body), otherwise the mutation stays "pending" and buttons keep spinning that long.
//
// Extracts a readable message from an axios error produced by the API (string or validation list).
export function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}
