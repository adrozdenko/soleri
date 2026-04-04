/**
 * Minimal cron expression validator.
 * Enforces minimum 1-hour interval to prevent runaway automation.
 */

/**
 * Validate a cron expression (5-field: minute hour day month weekday).
 * Returns null if valid, or an error message if invalid.
 */
export function validateCron(expression: string): string | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return 'Cron expression must have exactly 5 fields: minute hour day month weekday';
  }

  const [minute, hour] = parts;

  // Enforce minimum 1-hour interval: minute field must be a single fixed value (no */1 style)
  if (minute === '*' || minute.startsWith('*/')) {
    return 'Minimum scheduling interval is 1 hour. Minute field cannot be * or */N';
  }

  // Hour field: validate basic format (number, range, or list — not */1 which would be every hour on the minute)
  if (hour !== '*' && !isValidField(hour, 0, 23)) {
    return `Invalid hour field: "${hour}"`;
  }

  if (!isValidField(parts[0], 0, 59)) return `Invalid minute field: "${parts[0]}"`;
  if (!isValidField(parts[2], 1, 31)) return `Invalid day field: "${parts[2]}"`;
  if (!isValidField(parts[3], 1, 12)) return `Invalid month field: "${parts[3]}"`;
  if (!isValidField(parts[4], 0, 7)) return `Invalid weekday field: "${parts[4]}"`;

  return null;
}

function isValidField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;

  // Handle step values: */N or N-M/S
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = Number(step);
    if (isNaN(stepNum) || stepNum < 1) return false;
    if (range !== '*' && !isValidRange(range, min, max)) return false;
    return true;
  }

  // Handle comma-separated lists
  if (field.includes(',')) {
    return field.split(',').every((v) => isValidValue(v.trim(), min, max));
  }

  // Handle ranges
  if (field.includes('-')) {
    return isValidRange(field, min, max);
  }

  return isValidValue(field, min, max);
}

function isValidRange(range: string, min: number, max: number): boolean {
  const [start, end] = range.split('-');
  const s = Number(start);
  const e = Number(end);
  return !isNaN(s) && !isNaN(e) && s >= min && e <= max && s <= e;
}

function isValidValue(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return !isNaN(n) && n >= min && n <= max;
}

/**
 * Estimate the minimum interval in hours from a cron expression.
 * Returns Infinity if the expression is invalid.
 */
export function estimateMinIntervalHours(expression: string): number {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return Infinity;

  const hour = parts[1];

  // */N style = every N hours
  if (hour.startsWith('*/')) {
    return Number(hour.slice(2));
  }

  // Comma-separated: e.g. "2,4,6" = every 2 hours
  if (hour.includes(',')) {
    const values = hour
      .split(',')
      .map(Number)
      .sort((a, b) => a - b);
    if (values.length < 2) return 24;
    const gaps = values.slice(1).map((v, i) => v - values[i]);
    return Math.min(...gaps);
  }

  // Single value or range: at least once per day
  return 24;
}
