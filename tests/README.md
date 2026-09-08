# Media regression tests

Run `npm test` for media parsing, subtitle timing, silence removal, portrait cropping, and auto zoom checks. Run `npm run lint`, `npm run format:check`, and `npm run build` before release.

`fixtures/speech.mp4` is a generated test pattern with synthetic English speech. It has H.264 video and mono AAC audio at 22,050 Hz. This low audio rate is intentional: Windows Chrome rejects direct AAC encoding at that rate. The export path must resample it to 48,000 Hz. No personal recording is included.

Speech: “Hello world. This is a test of video subtitles. The quick brown fox jumps over the lazy dog.”

## Browser regression procedure

1. Run the production build with `npm run start`.
2. Upload the fixture, select English and Tiny, and start transcription. Check that the transcript matches the speech.
3. Cancel transcription and start it again. Check that the controls recover and transcription completes.
4. Edit a phrase, save it, and check the SRT and WebVTT downloads.
5. Export landscape video. Check that it has H.264 video and AAC audio at 48,000 Hz. Decode the full output and inspect a frame with subtitles.
6. Select Portrait, Left / Right subtitles, auto zoom, and default silence removal. Export again. Check the aspect ratio, subtitles, sound, and shorter duration.
7. Stop an export, then start another export. Check that the second export completes.
8. Record with a test camera and microphone. Stop, review, and accept the recording. Check that it opens as a video input.
9. Check the page at a mobile viewport and check the browser console for errors.

Keep test outputs in `test-results/`, which Git ignores. Use a native Windows download path with browser test tools on Windows.

These checks do not replace tests on physical phones, Safari, or long high-resolution videos.
