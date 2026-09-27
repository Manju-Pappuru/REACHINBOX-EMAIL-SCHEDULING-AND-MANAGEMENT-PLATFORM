const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function parseRecipients(input: string): string[] {
  if (!input) return [];
  // Split by comma, semicolon, newline, or whitespace
  const rawList = input.split(/[\r\n,;]+/);
  const seen = new Set<string>();
  const validEmails: string[] = [];

  for (const item of rawList) {
    const clean = item.trim().toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      validEmails.push(clean);
    }
  }

  return validEmails;
}

export function truncateText(text: string, maxLength: number = 60): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Parses raw text content from a CSV or TXT file and returns a
 * deduplicated list of valid email addresses.
 *
 * Supports:
 *   - Single-column: just emails, one per line
 *   - Multi-column: e.g. "name,email" header then rows
 *   - Comma / semicolon / newline separated inline lists
 */
export function parseCSVFileContent(text: string): string[] {
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const emails: string[] = [];

  // Detect multi-column CSV by checking if first line has "email" header
  const header = lines[0]?.toLowerCase() ?? '';
  const hasHeader = header.includes('email');
  let emailColIdx = -1;

  if (hasHeader) {
    // Find the column index that contains "email"
    emailColIdx = header.split(',').findIndex((col) => col.trim() === 'email');
  }

  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const candidates: string[] = [];

    if (emailColIdx >= 0) {
      // CSV with identified email column
      const cols = line.split(',');
      const cell = cols[emailColIdx]?.trim().toLowerCase() ?? '';
      if (cell) candidates.push(cell);
    } else {
      // No header — split by comma/semicolon/whitespace
      const parts = line.split(/[,;\s]+/);
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) candidates.push(trimmed);
      }
    }

    for (const candidate of candidates) {
      if (isValidEmail(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        emails.push(candidate);
      }
    }
  }

  return emails;
}
