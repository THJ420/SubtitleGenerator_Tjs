import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Input, BufferSource, ALL_FORMATS } from "mediabunny";
import {
  createSilenceRemovalPlan,
  detectSilenceRanges,
  sourceTimeToOutputTime,
  outputTimeToSourceTime,
  adjustTranscriptChunksForSilenceRemoval,
} from "../lib/silence-removal";
import {
  processTranscriptChunks,
  binarySearchActiveChunk,
  transcriptToSrt,
  transcriptToVtt,
} from "../lib/transcript-utils";
import { computeCropX, interpolateCenterX } from "../lib/person-tracking";
import {
  createAutoZoomCutSchedule,
  getAutoZoomTransform,
} from "../lib/auto-zoom";

test("Mediabunny reads a real MP4 with video and audio", async () => {
  const input = new Input({
    source: new BufferSource(
      await readFile(new URL("./fixtures/speech.mp4", import.meta.url)),
    ),
    formats: ALL_FORMATS,
  });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    assert.ok(video);
    assert.ok(audio);
    assert.equal(video.codec, "avc");
    assert.equal(audio.codec, "aac");
    assert.ok((await input.computeDuration()) > 3);
  } finally {
    input.dispose();
  }
});

test("silence cuts merge overlaps and clamp to the video", () => {
  const plan = createSilenceRemovalPlan(10, [
    { startTime: 3, endTime: 5 },
    { startTime: 2, endTime: 4 },
    { startTime: 9, endTime: 12 },
  ]);
  assert.equal(plan.outputDuration, 6);
  assert.deepEqual(plan.removedRanges, [
    { startTime: 2, endTime: 5 },
    { startTime: 9, endTime: 10 },
  ]);
});

test("retained timestamps round-trip across silence cuts", () => {
  const plan = createSilenceRemovalPlan(10, [{ startTime: 2, endTime: 4 }]);
  for (const time of [0, 1, 4.1, 5, 9, 10]) {
    assert.ok(
      Math.abs(
        outputTimeToSourceTime(sourceTimeToOutputTime(time, plan), plan) - time,
      ) < 1e-8,
    );
  }
});

test("silence detection protects speech edges", () => {
  const audio = new Float32Array(16000 * 3).fill(0.5);
  audio.fill(0, 16000, 32000);
  const ranges = detectSilenceRanges(audio, 0.5);
  assert.equal(ranges.length, 1);
  assert.ok(ranges[0].startTime > 1);
  assert.ok(ranges[0].endTime < 2);
  assert.deepEqual(detectSilenceRanges(new Float32Array(), 0.5), []);
});

test("removed words disappear and retained subtitle timing shifts", () => {
  const plan = createSilenceRemovalPlan(8, [{ startTime: 2, endTime: 4 }]);
  const chunks = [
    { text: "cut", timestamp: [2.5, 3] as [number, number] },
    {
      text: "keep",
      timestamp: [5, 6] as [number, number],
      subtitleHidden: true,
    },
  ];
  assert.deepEqual(adjustTranscriptChunksForSilenceRemoval(chunks, plan), [
    { text: "keep", timestamp: [3, 4], subtitleHidden: true },
  ]);
  assert.deepEqual(chunks[1].timestamp, [5, 6]);
});

test("full silence and empty cuts produce valid durations", () => {
  assert.equal(createSilenceRemovalPlan(5, []).outputDuration, 5);
  const plan = createSilenceRemovalPlan(5, [{ startTime: 0, endTime: 5 }]);
  assert.equal(plan.outputDuration, 0);
  assert.equal(outputTimeToSourceTime(0, plan), 0);
});

const transcript = {
  chunks: [
    { text: "Hello", timestamp: [0, 0.5] as [number, number] },
    { text: "world", timestamp: [0.5, 1] as [number, number] },
    { text: "Again", timestamp: [3, 4] as [number, number] },
  ],
};

test("phrase grouping breaks at long gaps and word limits", () => {
  assert.deepEqual(
    processTranscriptChunks(transcript, "phrase", 2).map((c) => c.text),
    ["Hello world", "Again"],
  );
  assert.equal(processTranscriptChunks(transcript, "phrase", 1).length, 3);
});

test("subtitle lookup handles gaps and empty input", () => {
  assert.equal(binarySearchActiveChunk(transcript.chunks, 0.2)?.text, "Hello");
  assert.equal(binarySearchActiveChunk(transcript.chunks, 2), undefined);
  assert.equal(binarySearchActiveChunk([], 0), undefined);
});

test("subtitle file exports preserve timing and text", () => {
  assert.match(
    transcriptToSrt(transcript),
    /00:00:00,000 --> 00:00:00,500\nHello/,
  );
  assert.match(
    transcriptToVtt(transcript),
    /^WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.500\nHello/,
  );
});

test("face tracking interpolation and portrait crop stay in bounds", () => {
  assert.equal(interpolateCenterX([], 1), 0.5);
  assert.equal(
    interpolateCenterX(
      [
        { time: 0, centerX: 0.2 },
        { time: 2, centerX: 0.8 },
      ],
      1,
    ),
    0.5,
  );
  assert.equal(computeCropX(0, 1920, 608), 0);
  assert.equal(computeCropX(1, 1920, 608), 1312);
});

test("auto zoom handles invalid inputs and keeps cuts ordered", () => {
  assert.deepEqual(getAutoZoomTransform(NaN, 10), { scale: 1, x: 0, y: 0 });
  const schedule = createAutoZoomCutSchedule([NaN, 12, 6, 19], 25);
  assert.equal(schedule[0], 0);
  assert.ok(
    schedule.every(
      (time, i) => time < 25 && (i === 0 || time > schedule[i - 1]),
    ),
  );
  assert.ok(Number.isFinite(getAutoZoomTransform(8, 25, NaN, schedule).x));
});
