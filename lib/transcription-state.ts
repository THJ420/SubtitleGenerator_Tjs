import type { SetStateAction } from "react";
import type { TranscriptionResult } from "../hooks/useTranscription";

type Chunk = TranscriptionResult["chunks"][number];

export interface TranscriptionState {
  result: TranscriptionResult | null;
  /** Last unedited worker snapshot, used to distinguish edits from ASR revisions. */
  source: TranscriptionResult | null;
}

export type TranscriptionAction =
  | { type: "edit"; value: SetStateAction<TranscriptionResult | null> }
  | { type: "worker"; result: TranscriptionResult };

export const initialTranscriptionState: TranscriptionState = {
  result: null,
  source: null,
};

const key = (chunk: Chunk) => `${chunk.timestamp[0]}:${chunk.timestamp[1]}`;
const normalize = (text: string) => text.trim().toLocaleLowerCase();
const editableFields = [
  "text",
  "disabled",
  "subtitleHidden",
  "dynamicPosition",
  "styleOverride",
] as const;

/** Merge cumulative ASR snapshots without treating unedited ASR text as a user edit. */
export function mergeTranscriptionUpdate(
  previous: TranscriptionState,
  incoming: TranscriptionResult,
): TranscriptionResult {
  if (!previous.result || !previous.source) return incoming;
  const oldChunks = previous.source.chunks;
  const byTime = new Map(oldChunks.map((chunk) => [key(chunk), chunk]));
  const byStart = new Map(
    oldChunks.map((chunk) => [chunk.timestamp[0], chunk]),
  );
  const editedByTime = new Map(
    previous.result.chunks.map((chunk) => [key(chunk), chunk]),
  );
  let cursor = 0;
  let hasTextEdit = false;
  const chunks = incoming.chunks.map((chunk) => {
    let source = byTime.get(key(chunk)) ?? byStart.get(chunk.timestamp[0]);
    if (!source) {
      // Whisper can adjust the trailing word's timestamps as more audio arrives.
      // Only transfer across changed starts for the same overlapping source word.
      while (
        cursor + 1 < oldChunks.length &&
        oldChunks[cursor + 1].timestamp[0] <= chunk.timestamp[0]
      )
        cursor++;
      source = oldChunks
        .slice(Math.max(0, cursor - 1), cursor + 3)
        .find((candidate) => {
          const overlap =
            Math.min(candidate.timestamp[1], chunk.timestamp[1]) -
            Math.max(candidate.timestamp[0], chunk.timestamp[0]);
          const shorter = Math.min(
            candidate.timestamp[1] - candidate.timestamp[0],
            chunk.timestamp[1] - chunk.timestamp[0],
          );
          return (
            overlap > 0 &&
            overlap >= shorter * 0.5 &&
            normalize(candidate.text) === normalize(chunk.text)
          );
        });
    }
    if (!source) return chunk;
    const edited = editedByTime.get(key(source));
    if (!edited) return chunk;
    const changes = Object.fromEntries(
      editableFields
        .filter((field) => !Object.is(edited[field], source[field]))
        .map((field) => [field, edited[field]]),
    );
    if ("text" in changes) hasTextEdit = true;
    return Object.keys(changes).length ? { ...chunk, ...changes } : chunk;
  });
  return {
    ...incoming,
    chunks,
    ...(hasTextEdit
      ? { text: chunks.map((chunk) => chunk.text.trim()).join(" ") }
      : {}),
  };
}

/** Keep worker snapshots and UI edits in one ordered React update queue. */
export function transcriptionReducer(
  state: TranscriptionState,
  action: TranscriptionAction,
): TranscriptionState {
  if (action.type === "worker") {
    return {
      result: mergeTranscriptionUpdate(state, action.result),
      source: action.result,
    };
  }
  const result =
    typeof action.value === "function"
      ? action.value(state.result)
      : action.value;
  // New video, regenerate, and cancel all clear both the result and merge baseline.
  return result === null ? initialTranscriptionState : { ...state, result };
}
