# BasedSubtitles

AI-powered subtitle generator that processes video and audio in your browser. No media uploads or accounts are required.

- Transcribes video audio using [Whisper.js](https://huggingface.co/docs/transformers.js) (WebGPU/WASM)
- Exports MP4 with subtitles baked in using [Mediabunny](https://mediabunny.dev/)
- Caches downloaded models in the browser for reuse. Model files and other app assets require network access when they are not cached.

Live at [basedsubs.getbasedapps.com](https://basedsubs.getbasedapps.com)

Current release: **2.7.0**. See [CHANGELOG.md](./CHANGELOG.md) for release details.

## AI Models

All model inference runs locally in the browser. Video and audio are processed on your device; the app downloads model files as needed.

| Model                             | Task                                            | Library                                   |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| **Whisper** (tiny / base / small) | Speech-to-text transcription, 100+ languages    | `@huggingface/transformers` (WebGPU/WASM) |
| **MODNet** (`Xenova/modnet`)      | Background removal — person segmentation        | `@huggingface/transformers` (Web Worker)  |
| **MediaPipe Blaze Face**          | Real-time face detection for subtitle placement | `@mediapipe/tasks-vision`                 |

## Features

- **100% local** — audio never leaves your device
- **100+ languages** — Whisper multilingual models (tiny/base/small)
- **25+ Google Fonts** — Bangers, Bebas Neue, Permanent Marker, Montserrat, and more
- **Per-word styling** — override font, size, color, and effects on individual words
- **Caption placement** — drag and resize captions, with local or global placement
- **Subtitle timing** — edit word or phrase start/end times, move subtitles on the timeline, and use Undo or Reset
- **Playback speed** — preview at 1×, 1.1×, 1.25×, or 1.5× with pitch preservation; export speed is unchanged
- **Emoji replace / overlay** — swap a word for an emoji or float one above it
- **Background removal** — AI person segmentation, runs locally via Web Worker
- **3D depth effect** — subtitles render behind or in front of the detected person
- **Face tracking** — MediaPipe Blaze Face, real-time EMA-smoothed position
- **Split subtitle mode** — phrase words placed above/below or left/right of the face
- **Display on Spoken** — words light up as each one is spoken (karaoke style)
- **Portrait / landscape** — 9:16 and 16:9 export with portrait zoom/crop
- **Stacked portrait** — two-person layouts with face tracking, swap, and face zoom
- **Silence removal** — detect and skip silent sections in playback and video export
- **Camera recording** — record up to five minutes, select a camera, and review before editing; audio capture runs on the audio thread with buffered AAC encoding
- **MP4 export** — baked subtitles, H.264 + AAC; desktop defaults to 30 fps, while mobile uses up to 24 fps and a 1280-pixel long edge
- **Transcript export** — download JSON, SRT, and WebVTT

### Edit subtitle timing

Select a subtitle on the timeline. Drag either edge to change its start or end, or drag the middle to move it. Arrow keys adjust timing by 0.01 seconds; Shift + Arrow adjusts it by 0.1 seconds. Exact-time fields accept seconds or `HH:MM:SS.mmm`.

Timing uses source-video seconds. Changes stay within the video and adjacent word limits. Edge edits enforce a minimum word duration of 0.02 seconds. In phrase mode, an edge edit changes the first or last word; moving a phrase preserves its word durations and gaps.

**Undo timing** restores the previous timing edit without changing text or styles. **Reset timing** restores original times if they do not overlap adjacent words. Timing changes do not move the original media ranges used to remove video sections.

## Getting Started

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm start       # serve the production build
npm test        # regression tests
npm run lint    # ESLint
npm run format:check # Prettier check
```

## Architecture

### Subtitle Generation

Whisper models run in a dedicated Web Worker (`app/worker.ts`) via `@huggingface/transformers`. Audio is extracted from the video file client-side and passed as a `Float32Array`. Cached model files can be reused; additional models and uncached assets still require downloads.

```
Video File → audio-utils → Float32Array → Whisper Worker → TranscriptChunks[]
```

Models available:
| Name | Size | Notes |
|------|------|-------|
| Tiny | ~75 MB | Fastest |
| Base | ~150 MB | Default |
| Small | ~500 MB | Most accurate |

#### Streaming transcription — how it works

The `@huggingface/transformers` ASR pipeline processes the whole audio then merges at the end, with no built-in way to get partial results per chunk. To support long videos and live previews, `app/worker.ts` replicates the pipeline's internal `_call_whisper` loop directly:

1. **Chunk the audio** using the same 30s window / 5s stride / 20s jump that the pipeline uses internally.
2. **Call `model.generate()`** on each chunk with:
   - `return_timestamps: true` — embeds timestamp tokens in the output sequence. `_decode_asr` requires these to detect where each chunk's usable region starts and ends (stride filtering via `first_timestamp` / `last_timestamp`). Without them, multi-chunk merging silently skips content.
   - `return_token_timestamps: true` — uses DTW cross-attention alignment to produce per-token timestamps, enabling word-level output from `_decode_asr`.
3. **Call `tokenizer._decode_asr(processedSoFar, { return_timestamps: "word" })`** after each chunk. This does stride-aware merging of all chunks processed so far and posts a partial `update` result to the main thread.
4. After all chunks are processed, the final `_decode_asr` call produces the complete transcript.

This approach gives accuracy identical to the single full pipeline call (same chunking math, same merge logic) while streaming word-level results chunk by chunk.

#### Why not use the high-level pipeline call?

`transcriber(audio, { chunk_length_s: 30, stride_length_s: 5 })` processes all chunks, then merges once at the end. The old `@xenova/transformers` library exposed a `chunk_callback` fired after each internal chunk; `@huggingface/transformers` does not. Replicating the internal loop is the only way to stream results.

### Background Removal

A second Web Worker runs **MODNet** (`Xenova/modnet`) for AI person segmentation on video frames and returns masks at 5fps. The masks are cached and reused at 30fps during both preview and export.

```
Video Frames → BG Removal Worker → Masks[] → Composited Canvas
```

### Face Tracking

**MediaPipe Blaze Face** runs in the main thread, scanning frames at ~5fps. Position is smoothed with an EMA filter (α = 0.15). During export, a 150ms lookahead compensates for EMA phase lag.

### Rendering Pipeline

| Mode                          | How                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| Plain preview                 | DOM `VideoCaption` component (CSS + HTML)                      |
| Compositing (BG removal / 3D) | Canvas loop → `lib/render-subtitle.ts`                         |
| Export                        | `hooks/useVideoDownloadMediaBunny.ts` internal canvas renderer |

The preview and export renderers share font resolution logic via `lib/font-config.ts`.

### Video Export

Mediabunny renders each frame to an offscreen canvas, composites subtitles (and optionally masks), then encodes to MP4. Mobile exports use a maximum 1280-pixel long edge to reduce memory and encoding load.

```
Video + Subtitles + Masks → frame-by-frame canvas render → Mediabunny → MP4 download
```

### Camera audio

`public/audio/recording-processor.js` captures microphone samples in an AudioWorklet. `lib/recording-audio.ts` queues these samples for AAC encoding and flushes the final block when recording stops. Audio capture shutdown and encoder drain share a 15-second deadline. Failure or cancellation releases capture resources and reports an error.

Camera and microphone access require a secure browser context, such as HTTPS or localhost, and user permission. See [recording validation](./tests/RECORDING-AUDIO-VALIDATION.md) and [subtitle timing validation](./tests/SUBTITLE-TIMING-VALIDATION.md) for test scope and remaining device checks.

## Project Structure

```
app/
  page.tsx                    # Home page
  layout.tsx                  # Root layout (Google Fonts, analytics)
  worker.ts                   # Transcription Web Worker (Whisper)
  bg-removal-worker.ts        # Background removal Web Worker
  changelog/page.tsx          # Changelog page

components/
  main-app.tsx                # Main editor — all state lives here
  editor/                    # Timeline, playback speed, and timing controls
  video-upload.tsx            # Video player + compositing canvas
  video-caption.tsx           # DOM subtitle renderer
  subtitle-styling.tsx        # Style controls panel
  transcript-sidebar.tsx      # Editable transcript list
  word-style-popover.tsx      # Per-word style overrides
  landing-page/               # Landing page components
  ui/                         # shadcn/ui primitives

hooks/
  useTranscription.ts         # Whisper via Web Worker
  useBackgroundRemoval.ts     # BG removal via Web Worker
  useFaceTracking.ts          # MediaPipe face detection
  useVideoDownloadMediaBunny.ts # Video export
  useCameraRecording.ts       # Camera input
  useSubtitleTiming.ts        # Timing transactions, Undo, and Reset

lib/
  font-config.ts              # Shared font map (CSS vars → canvas names)
  render-subtitle.ts          # Canvas subtitle rendering (preview)
  person-tracking.ts          # Face position interpolation
  audio-utils.ts              # Audio extraction
  recording-audio.ts          # AudioWorklet capture and AAC queue
  subtitle-timing.ts          # Timing bounds, edits, and reset
  transcript-utils.ts         # Phrase grouping and subtitle exports
  utils.ts                    # Shared UI utilities
  changelog.ts                # Version history data
```

## Adding a Font

1. Add the Google Font import to `app/layout.tsx`
2. Add the CSS variable → font name entry to `lib/font-config.ts`
3. Add the font as an option in `components/subtitle-styling.tsx`

## Contributing

Pull requests are welcome. For larger changes, open an issue first to discuss the approach.

```bash
npm run lint         # check for lint errors
npm test             # run regression tests
npm run build        # check the production build and TypeScript
npm run format:check # check formatting
npm run format       # auto-fix formatting
```

## Dependencies

| Package                     | Purpose                          |
| --------------------------- | -------------------------------- |
| `@huggingface/transformers` | Whisper AI transcription (local) |
| `@mediapipe/tasks-vision`   | Face detection                   |
| `mediabunny`                | MP4 video encoding               |
| `next`                      | React framework (v16)            |
| `react` / `react-dom`       | React v19                        |
| `@radix-ui/*`               | Accessible UI primitives         |
| `emoji-picker-react`        | Emoji picker                     |
| `lucide-react`              | Icons                            |
| `sonner`                    | Toast notifications              |
| `tailwindcss`               | Utility CSS (v4)                 |

## License

MIT — see [LICENSE](./LICENSE).
