export type Timestamp = [number, number];
export interface TimedSubtitle {
  timestamp: Timestamp;
  /** Original media position. Timing edits never move video cuts. */
  sourceTimestamp?: Timestamp;
}
export type TimingAction = "start" | "end" | "move";
export type TimingSelection = { first: number; last: number };
export const MIN_SUBTITLE_DURATION = 0.02;

export function timingBounds(
  chunks: readonly TimedSubtitle[],
  { first, last }: TimingSelection,
  duration: number,
) {
  return {
    min: Math.max(0, chunks[first - 1]?.timestamp[1] ?? 0),
    max: Math.min(duration, chunks[last + 1]?.timestamp[0] ?? duration),
  };
}

/** Edge edits affect one word; a move preserves every word's duration and gaps. */
export function editSubtitleTiming<T extends TimedSubtitle>(
  chunks: readonly T[],
  selection: TimingSelection,
  action: TimingAction,
  value: number,
  duration: number,
): T[] {
  const { first, last } = selection;
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    first < 0 ||
    last < first ||
    !chunks[first] ||
    !chunks[last]
  )
    return [...chunks];
  const { min, max } = timingBounds(chunks, selection, duration);
  const start = chunks[first].timestamp[0];
  const end = chunks[last].timestamp[1];
  let low: number;
  let high: number;
  if (action === "start") {
    low = min;
    high = Math.min(max, chunks[first].timestamp[1] - MIN_SUBTITLE_DURATION);
  } else if (action === "end") {
    low = Math.max(min, chunks[last].timestamp[0] + MIN_SUBTITLE_DURATION);
    high = max;
  } else {
    low = min - start;
    high = max - end;
  }
  if (low > high) return [...chunks];
  const accepted = Math.max(low, Math.min(high, value));
  return chunks.map((chunk, index) => {
    if (index < first || index > last) return chunk;
    const timestamp: Timestamp = [...chunk.timestamp];
    if (action === "start" && index === first) timestamp[0] = accepted;
    if (action === "end" && index === last) timestamp[1] = accepted;
    if (action === "move") {
      timestamp[0] += accepted;
      timestamp[1] += accepted;
    }
    if (timestamp.every((time, edge) => time === chunk.timestamp[edge]))
      return chunk;
    return {
      ...chunk,
      sourceTimestamp: chunk.sourceTimestamp ?? chunk.timestamp,
      timestamp,
    };
  });
}

/** Apply only timing fields, so Undo does not undo text, styling, or cut edits. */
export function restoreSubtitleTiming<T extends TimedSubtitle>(
  chunks: readonly T[],
  snapshot: readonly TimedSubtitle[],
): T[] {
  return chunks.map((chunk, index) => {
    const saved = snapshot[index];
    if (!saved || (!timingChanged([chunk], [saved]) && !saved.sourceTimestamp))
      return chunk;
    return {
      ...chunk,
      sourceTimestamp:
        chunk.sourceTimestamp ?? saved.sourceTimestamp ?? chunk.timestamp,
      timestamp: [...saved.timestamp] as Timestamp,
    };
  });
}

export function resetSubtitleTiming<T extends TimedSubtitle>(
  chunks: readonly T[],
  selection: TimingSelection,
  duration: number,
): T[] | null {
  const next = chunks.map((chunk, index) =>
    index >= selection.first && index <= selection.last && chunk.sourceTimestamp
      ? { ...chunk, timestamp: [...chunk.sourceTimestamp] as Timestamp }
      : chunk,
  );
  for (let i = selection.first; i <= selection.last; i++) {
    const current = next[i];
    if (
      !current ||
      current.timestamp[0] < 0 ||
      current.timestamp[1] > duration ||
      current.timestamp[1] <= current.timestamp[0] ||
      (i > 0 && current.timestamp[0] < next[i - 1].timestamp[1]) ||
      (i + 1 < next.length && current.timestamp[1] > next[i + 1].timestamp[0])
    )
      return null;
  }
  return next;
}

export function timingChanged(
  a: readonly TimedSubtitle[],
  b: readonly TimedSubtitle[],
) {
  return a.some(
    (chunk, i) =>
      !b[i] ||
      chunk.timestamp.some(
        (time, edge) => Math.abs(time - b[i].timestamp[edge]) > 1e-8,
      ),
  );
}

export function parseSubtitleTime(value: string): number | null {
  if (!/^\d+(?::[0-5]\d){0,2}(?:\.\d{1,3})?$/.test(value.trim())) return null;
  const seconds = value
    .trim()
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
}
