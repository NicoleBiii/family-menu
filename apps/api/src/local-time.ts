/**
 * Household-local wall-clock time ↔ instant conversion using only Intl (Node 24 has no
 * Temporal). A local time may map to zero instants (skipped by a daylight-saving jump), one, or
 * two (repeated when clocks fall back); callers must handle the first and last cases explicitly.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  return format;
}

export interface LocalDateTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  time: string;
}

/** Wall-clock date and time of an instant in a time zone (minute precision). */
export function toLocal(instant: Date, timeZone: string): LocalDateTime {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** Offset of the zone from UTC at an instant, in minutes (e.g. -240 for UTC−4). */
export function offsetMinutes(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

export function formatOffset(minutes: number) {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

/**
 * All instants whose wall-clock reading in `timeZone` equals the given local date and time,
 * earliest first. Candidates come from the offsets in effect a day either side, which covers
 * every real-world transition (none move clocks by more than a day).
 */
export function resolveLocal(local: LocalDateTime, timeZone: string): Date[] {
  const [year, month, day] = local.date.split('-').map(Number);
  const [hour, minute] = local.time.split(':').map(Number);
  const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) =>
      offsetMinutes(new Date(wall + hours * 3600_000), timeZone),
    ),
  );
  const found = new Map<number, Date>();
  for (const offset of offsets) {
    const candidate = new Date(wall - offset * 60_000);
    const back = toLocal(candidate, timeZone);
    if (back.date === local.date && back.time === local.time) {
      found.set(candidate.getTime(), candidate);
    }
  }
  return [...found.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
