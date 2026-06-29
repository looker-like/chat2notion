const NOTION_REQUEST_BODY_LIMIT_BYTES = 500_000;

export function assertNotionRequestFits(bodyJson: string, label: string): void {
  const size = getByteLength(bodyJson);

  if (size > NOTION_REQUEST_BODY_LIMIT_BYTES) {
    throw new Error(
      `${label} is too large (${Math.ceil(size / 1024)}KB, limit 489KB). Chat2Notion could not safely split this request.`,
    );
  }
}

export function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
