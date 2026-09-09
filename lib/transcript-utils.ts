import {
  adjustTranscriptChunksForSilenceRemoval,
  createSilenceRemovalPlan,
} from "./silence-removal";

/**
 * Format seconds into a readable time format (MM:SS)
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/** Merge preview cuts without changing subtitle timestamps used for editing. */
export function mergeTimestampRanges(
  ranges: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const sorted = ranges
    .map(([start, end]): [number, number] => [start, end])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || previous[1] < range[0]) merged.push(range);
    else previous[1] = Math.max(previous[1], range[1]);
  }
  return merged;
}

/**
 * Format seconds into SRT timestamp format (HH:MM:SS,MS)
 */
export function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
}

/**
 * Format seconds into WebVTT timestamp format (HH:MM:SS.MS)
 */
export function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export interface WordStyleOverride {
  wordPlacement?: import("./caption-placement").CaptionPlacement;
  phrasePlacement?: import("./caption-placement").CaptionPlacement;
  fontFamily?: string;
  fontSize?: number; // multiplier (e.g. 1.5 = 150% of global)
  color?: string;
  effect?: "knockout";
  emoji?: string; // replaces word text with this emoji
  emojiOverlay?: string; // renders this emoji above the word
  emojiScale?: number; // per-word emoji size multiplier (default 1.0)
}

export interface ProcessedWord {
  text: string;
  timestamp: [number, number];
  disabled?: boolean;
  subtitleHidden?: boolean;
  dynamicPosition?: "behind" | "front";
  styleOverride?: WordStyleOverride;
}

export interface ProcessedChunk {
  text: string;
  timestamp: [number, number];
  disabled?: boolean;
  subtitleHidden?: boolean;
  dynamicPosition?: "behind" | "front";
  styleOverride?: WordStyleOverride;
  words?: ProcessedWord[];
}

interface SourceTranscript {
  chunks: Array<{
    text: string;
    timestamp: [number, number];
    disabled?: boolean;
    subtitleHidden?: boolean;
    dynamicPosition?: "behind" | "front";
    styleOverride?: WordStyleOverride;
  }>;
}

/**
 * Process transcript chunks according to the mode (word/phrase).
 * When dynamicEnabled is true and mode is "phrase", auto-assigns
 * dynamicPosition (first word = "behind", rest = "front") to words
 * that don't already have a position set.
 */
// WeakMap cache: transcript object → param string → result
// Invalidates automatically when React replaces the transcript object on edits.
const _chunksCache = new WeakMap<
  SourceTranscript,
  Map<string, ProcessedChunk[]>
>();

export function binarySearchActiveChunk<
  T extends { timestamp: [number, number] },
>(chunks: T[], currentTime: number): T | undefined {
  let lo = 0,
    hi = chunks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = chunks[mid].timestamp;
    if (currentTime < start) hi = mid - 1;
    else if (currentTime > end) lo = mid + 1;
    else return chunks[mid];
  }
  return undefined;
}

export function processTranscriptChunks(
  transcript: SourceTranscript,
  mode: "word" | "phrase" = "word",
  maxWordsPerLine?: number,
  dynamicEnabled?: boolean,
): ProcessedChunk[] {
  const cacheKey = `${mode}-${maxWordsPerLine ?? "d"}-${dynamicEnabled ?? 0}`;
  let transcriptMap = _chunksCache.get(transcript);
  if (!transcriptMap) {
    transcriptMap = new Map();
    _chunksCache.set(transcript, transcriptMap);
  }
  const cached = transcriptMap.get(cacheKey);
  if (cached) return cached;

  const result = _processTranscriptChunks(
    transcript,
    mode,
    maxWordsPerLine,
    dynamicEnabled,
  );
  transcriptMap.set(cacheKey, result);
  return result;
}

function _processTranscriptChunks(
  transcript: SourceTranscript,
  mode: "word" | "phrase" = "word",
  maxWordsPerLine?: number,
  dynamicEnabled?: boolean,
): ProcessedChunk[] {
  if (mode === "word") {
    return transcript.chunks.map((chunk) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
      disabled: chunk.disabled,
      subtitleHidden: chunk.subtitleHidden,
      dynamicPosition: chunk.dynamicPosition,
      styleOverride: chunk.styleOverride,
    }));
  }

  const processedChunks: ProcessedChunk[] = [];

  type PhraseAccumulator = {
    texts: string[];
    words: ProcessedWord[];
    start: number;
    end: number;
    disabled: boolean;
    subtitleHidden: boolean;
  } | null;

  let currentGroup: PhraseAccumulator = null;

  const MAX_PHRASE_WORDS = maxWordsPerLine ?? 6;
  const MAX_PHRASE_DURATION = 3.0;
  const MAX_GAP = 0.5;

  const flushGroup = () => {
    if (!currentGroup) {
      return;
    }

    // When dynamic is enabled, auto-assign dynamicPosition if not already set
    if (dynamicEnabled) {
      currentGroup.words = currentGroup.words.map((word, i) => {
        if (word.dynamicPosition) return word; // preserve user toggle
        return {
          ...word,
          dynamicPosition: i === 0 ? ("behind" as const) : ("front" as const),
        };
      });
    }

    processedChunks.push({
      text: currentGroup.texts.join(" "),
      timestamp: [currentGroup.start, currentGroup.end],
      disabled: currentGroup.disabled,
      subtitleHidden: currentGroup.subtitleHidden,
      words: currentGroup.words,
    });

    currentGroup = null;
  };

  transcript.chunks.forEach((chunk, index) => {
    const [start, end] = chunk.timestamp;
    const trimmedText = chunk.text.trim();

    if (!trimmedText) {
      return;
    }

    const chunkDisabled = Boolean(chunk.disabled);
    const chunkHidden = Boolean(chunk.subtitleHidden);
    const wordData: ProcessedWord = {
      text: trimmedText,
      timestamp: [start, end],
      disabled: chunk.disabled,
      subtitleHidden: chunk.subtitleHidden,
      dynamicPosition: chunk.dynamicPosition,
      styleOverride: chunk.styleOverride,
    };

    if (!currentGroup) {
      currentGroup = {
        texts: [trimmedText],
        words: [wordData],
        start,
        end,
        disabled: chunkDisabled,
        subtitleHidden: chunkHidden,
      };
      return;
    }

    const timeSinceLastWord = start - currentGroup.end;
    const wouldExceedWordLimit = currentGroup.texts.length >= MAX_PHRASE_WORDS;
    const wouldExceedDuration = end - currentGroup.start > MAX_PHRASE_DURATION;
    const crossesDisabledBoundary = chunkDisabled !== currentGroup.disabled;
    const crossesHiddenBoundary = chunkHidden !== currentGroup.subtitleHidden;
    const endsWithPunctuation = /[.!?]$/.test(
      currentGroup.texts[currentGroup.texts.length - 1],
    );
    const endsWithCommaLike = /[,;:]$/.test(
      currentGroup.texts[currentGroup.texts.length - 1],
    );

    const shouldEndPhrase =
      crossesDisabledBoundary ||
      crossesHiddenBoundary ||
      timeSinceLastWord > MAX_GAP ||
      wouldExceedWordLimit ||
      wouldExceedDuration ||
      endsWithPunctuation ||
      (endsWithCommaLike && currentGroup.texts.length >= 3);

    if (shouldEndPhrase) {
      flushGroup();
      currentGroup = {
        texts: [trimmedText],
        words: [wordData],
        start,
        end,
        disabled: chunkDisabled,
        subtitleHidden: chunkHidden,
      };
    } else {
      currentGroup.texts.push(trimmedText);
      currentGroup.words.push(wordData);
      currentGroup.end = end;
    }

    if (index === transcript.chunks.length - 1) {
      flushGroup();
    }
  });

  flushGroup();

  return processedChunks;
}

/**
 * Convert transcript data to SRT format
 */
function getSubtitleFileChunks(
  transcript: SourceTranscript,
  mode: "word" | "phrase",
): ProcessedChunk[] {
  const disabledRanges = transcript.chunks
    .filter((chunk) => chunk.disabled)
    .map((chunk) => ({
      startTime: chunk.timestamp[0],
      endTime: chunk.timestamp[1],
    }));
  const duration = transcript.chunks.reduce(
    (end, chunk) => Math.max(end, chunk.timestamp[1]),
    0,
  );
  const chunks =
    disabledRanges.length > 0
      ? adjustTranscriptChunksForSilenceRemoval(
          transcript.chunks,
          createSilenceRemovalPlan(duration, disabledRanges),
        )
      : transcript.chunks;
  return processTranscriptChunks({ chunks }, mode).filter(
    (chunk) => !chunk.disabled && !chunk.subtitleHidden && chunk.text.trim(),
  );
}

export function transcriptToSrt(
  transcript: SourceTranscript,
  mode: "word" | "phrase" = "word",
): string {
  const processedChunks = getSubtitleFileChunks(transcript, mode);
  return processedChunks
    .map((chunk, index) => {
      const [start, end] = chunk.timestamp;
      return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(
        end,
      )}\n${chunk.text}\n`;
    })
    .join("\n");
}

/**
 * Convert transcript data to WebVTT format
 */
export function transcriptToVtt(
  transcript: SourceTranscript,
  mode: "word" | "phrase" = "word",
): string {
  const header = "WEBVTT\n\n";
  const processedChunks = getSubtitleFileChunks(transcript, mode);
  const cues = processedChunks
    .map((chunk, index) => {
      const [start, end] = chunk.timestamp;
      return `${index + 1}\n${formatVttTime(start)} --> ${formatVttTime(
        end,
      )}\n${chunk.text}\n`;
    })
    .join("\n");

  return header + cues;
}
