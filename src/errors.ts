export type StructuredError = {
  error: true;
  code: string;
  message: string;
};

export function formatError(code: string, message: string): string {
  const structured: StructuredError = { error: true, code, message };
  return JSON.stringify(structured);
}
