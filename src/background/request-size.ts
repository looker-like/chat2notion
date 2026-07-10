// Request size estimation and limits for Notion API calls.
// Notion caps request bodies at ~500KB; these helpers measure byte length
// and enforce the limit before sending.

const NOTION_REQUEST_BODY_LIMIT_BYTES = 500_000;

// Throw if the JSON body would exceed Notion's safe request size limit.
export function assertNotionRequestFits(bodyJson: string, label: string): void {
  const size = getByteLength(bodyJson);

  if (size > NOTION_REQUEST_BODY_LIMIT_BYTES) {
    throw new Error(
      `${label} is too large (${Math.ceil(size / 1024)}KB, limit 489KB). Chat2Notion could not safely split this request.`,
    );
  }
}

// Measure the UTF-8 byte length of a string.
export function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
