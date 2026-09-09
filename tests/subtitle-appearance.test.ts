import { test } from "node:test";
import assert from "node:assert/strict";
import type { SubtitleStyle } from "../components/subtitle-styling";
import { formatSubtitleText } from "../lib/subtitle-appearance";
import {
  renderSubtitle,
  renderDynamicWordWithOptions,
} from "../lib/export-renderer";
import {
  renderSubtitleToCanvas,
  renderDynamicBehindText,
} from "../lib/render-subtitle";
import { transcriptToSrt } from "../lib/transcript-utils";

const baseStyle: SubtitleStyle = {
  fontFamily: "Arial, sans-serif",
  fontSize: 22,
  fontWeight: "700",
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundStyle: "solid",
  borderWidth: 0,
  borderColor: "#000000",
  dropShadowIntensity: 0,
  uppercase: false,
  wordEmphasisEnabled: false,
  wordEmphasisColorEnabled: false,
  wordEmphasisColor: "#000000",
  wordEmphasisBackgroundColor: "#FFE600",
  windEnabled: false,
  position: "bottom",
  maxWordsPerLine: 6,
  backgroundRemovalEnabled: false,
  backgroundType: "solid",
  solidBackgroundColor: "#000000",
  dynamicEnabled: false,
  dynamicFontSize: 80,
  dynamicYPosition: 35,
  dynamicFrontFontSize: 40,
  dynamicFrontYPosition: 75,
  dynamicFollowWord: false,
  textFadeIn: false,
  brandingWatermark: true,
  splitSubtitleMode: "none",
  verticalOffset: 0,
};
const words = [
  {
    text: "Hello",
    timestamp: [0, 1] as [number, number],
    dynamicPosition: "behind" as const,
  },
  {
    text: "world",
    timestamp: [1, 2] as [number, number],
    dynamicPosition: "behind" as const,
  },
];
const transcript = { text: "Hello world", chunks: words };
const chunk = {
  text: "Hello world",
  timestamp: [0, 2] as [number, number],
  words,
};

function recordingCanvas() {
  const text: Array<{ text: string; color: unknown }> = [];
  const fills: unknown[] = [];
  const measurements: string[] = [];
  const properties: Record<string, unknown> = {
    fillStyle: "#000000",
    globalAlpha: 1,
    font: "22px Arial",
  };
  const stack: Array<Record<string, unknown>> = [];
  const context = new Proxy(properties, {
    get(target, key: string) {
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => Object.assign(target, stack.pop());
      if (key === "fillText")
        return (value: string) =>
          text.push({ text: value, color: target.fillStyle });
      if (key === "fill") return () => fills.push(target.fillStyle);
      if (key === "measureText")
        return (value: string) => {
          measurements.push(value);
          return {
            width: value.length * 12,
            actualBoundingBoxAscent: 16,
            actualBoundingBoxDescent: 5,
          };
        };
      return key in target ? target[key] : () => {};
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, text, fills, measurements };
}

test("case conversion is optional and does not change transcript exports", () => {
  assert.equal(
    formatSubtitleText("Hello world! Straße", {}),
    "Hello world! Straße",
  );
  assert.equal(
    formatSubtitleText("Hello world! Straße", { uppercase: true }),
    "HELLO WORLD! STRASSE",
  );
  assert.match(transcriptToSrt(transcript, "phrase"), /Hello world/);
});

for (const uppercase of [false, true]) {
  for (const splitSubtitleMode of [
    "none",
    "above-below",
    "left-right",
  ] as const) {
    test(`preview and export retain case with uppercase=${uppercase}, split=${splitSubtitleMode}`, () => {
      const style = { ...baseStyle, uppercase, splitSubtitleMode };
      const preview = recordingCanvas();
      const exported = recordingCanvas();
      renderSubtitleToCanvas(
        preview.context,
        transcript,
        0.5,
        style,
        "phrase",
        1080,
        1920,
      );
      renderSubtitle(
        exported.context,
        chunk,
        style,
        { width: 1080, height: 1920 } as HTMLCanvasElement,
        "phrase",
        0.5,
      );
      const expected = uppercase ? "HELLO WORLD" : "Hello world";
      for (const recorded of [preview, exported]) {
        assert.equal(
          recorded.text.map((item) => item.text).join(" "),
          expected,
        );
        assert.ok(
          recorded.measurements.every(
            (value) => uppercase || !value.includes("HELLO"),
          ),
        );
      }
    });
  }
}

test("active background color works without a full caption background in preview and export", () => {
  for (const background of ["#FFE600", "#19B5FE"]) {
    const style = {
      ...baseStyle,
      wordEmphasisEnabled: true,
      wordEmphasisColorEnabled: true,
      wordEmphasisBackgroundColor: background,
    };
    const preview = recordingCanvas();
    const exported = recordingCanvas();
    renderSubtitleToCanvas(
      preview.context,
      transcript,
      0.5,
      style,
      "phrase",
      1080,
      1920,
    );
    renderSubtitle(
      exported.context,
      chunk,
      style,
      { width: 1080, height: 1920 } as HTMLCanvasElement,
      "phrase",
      0.5,
    );
    for (const recorded of [preview, exported]) {
      assert.deepEqual(recorded.fills, [background]);
      assert.deepEqual(recorded.text, [
        { text: "Hello", color: "#000000" },
        { text: "world", color: "#FFFFFF" },
      ]);
    }
  }
});

test("disabling resize removes only the active background", () => {
  const recorded = recordingCanvas();
  renderSubtitleToCanvas(
    recorded.context,
    transcript,
    0.5,
    { ...baseStyle, wordEmphasisColorEnabled: true },
    "phrase",
    1080,
    1920,
  );
  assert.deepEqual(recorded.fills, []);
  assert.equal(recorded.text[0].color, "#000000");
});

test("behind-person preview and export honor the case setting", () => {
  for (const uppercase of [false, true]) {
    const style = { ...baseStyle, dynamicEnabled: true, uppercase };
    const preview = recordingCanvas();
    const exported = recordingCanvas();
    renderDynamicBehindText(
      preview.context,
      transcript,
      0.5,
      style,
      1080,
      1920,
    );
    renderDynamicWordWithOptions(
      exported.context,
      chunk.text,
      style,
      { width: 1080, height: 1920 } as HTMLCanvasElement,
      { fontSize: 80, yPosition: 35 },
      words,
      0.5,
      2,
    );
    const expected = uppercase ? "HELLO WORLD" : "Hello world";
    assert.equal(preview.text.map((item) => item.text).join(" "), expected);
    assert.equal(exported.text.map((item) => item.text).join(" "), expected);
  }
});
