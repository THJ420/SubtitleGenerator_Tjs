"use client";

import { memo, useEffect, useMemo, useState, type RefObject } from "react";
import { Captions, Film, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime, processTranscriptChunks } from "@/lib/transcript-utils";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import styles from "./editor.module.css";

interface EditorTimelineProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  transcript: TranscriptionResult;
  duration: number;
  fileName?: string;
  maxWordsPerLine: number;
  onSeek: (time: number) => void;
  onEdit: () => void;
}

// Playback state stays here so each time update does not render the style panel.
export const EditorTimeline = memo(function EditorTimeline({
  videoRef,
  transcript,
  duration,
  fileName,
  maxWordsPerLine,
  onSeek,
  onEdit,
}: EditorTimelineProps) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState("");
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setTime(video.currentTime);
      setPlaying(!video.paused);
    };
    const capture = () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = Math.round((160 * video.videoHeight) / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPoster(canvas.toDataURL("image/webp", 0.6));
      canvas.width = canvas.height = 0;
    };
    sync();
    capture();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("loadeddata", capture);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("loadeddata", capture);
    };
  }, [videoRef]);

  const chunks = useMemo(
    () => processTranscriptChunks(transcript, "phrase", maxWordsPerLine),
    [transcript, maxWordsPerLine],
  );
  const windowStart =
    Math.floor(Math.min(time, Math.max(0, duration - 0.001)) / 60) * 60;
  const windowDuration = Math.max(1, Math.min(60, duration - windowStart));
  const visibleChunks = chunks.filter(
    (chunk) =>
      chunk.timestamp[1] > windowStart &&
      chunk.timestamp[0] < windowStart + windowDuration,
  );
  const position = Math.min(
    100,
    Math.max(0, ((time - windowStart) / windowDuration) * 100),
  );

  return (
    <section className={styles.timeline} aria-label="Video timeline">
      <div className={styles.timelineTransport}>
        <Button
          variant="outline"
          size="icon"
          aria-label={playing ? "Pause video" : "Play video"}
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused) void video.play().catch(() => setPlaying(false));
            else video.pause();
          }}
        >
          {playing ? <Pause /> : <Play fill="currentColor" />}
        </Button>
        <span>
          <strong>{formatTime(time)}</strong> / {formatTime(duration)}
        </span>
        <span className={styles.timelineHint}>Select a subtitle to edit</span>
      </div>
      <div className={styles.timelineTracks}>
        <div className={styles.trackLabels}>
          <span />
          <span>
            <Captions size={16} /> Subtitles
          </span>
          <span>
            <Film size={16} /> Video
          </span>
        </div>
        <div className={styles.tracks}>
          <div className={styles.ruler}>
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index}>
                {formatTime(windowStart + (windowDuration * index) / 6)}
              </span>
            ))}
          </div>
          <div className={styles.captionTrack}>
            {visibleChunks.map((chunk, index) => (
              <button
                key={`${chunk.timestamp[0]}-${index}`}
                type="button"
                title={chunk.text}
                aria-label={`Edit subtitle at ${formatTime(chunk.timestamp[0])}: ${chunk.text}`}
                data-active={
                  time >= chunk.timestamp[0] && time <= chunk.timestamp[1]
                }
                data-disabled={chunk.disabled || chunk.subtitleHidden}
                style={{
                  left: `${Math.max(0, ((chunk.timestamp[0] - windowStart) / windowDuration) * 100)}%`,
                  width: `${Math.max(0.5, ((Math.min(windowStart + windowDuration, chunk.timestamp[1]) - Math.max(windowStart, chunk.timestamp[0])) / windowDuration) * 100)}%`,
                }}
                onClick={() => {
                  onSeek(chunk.timestamp[0]);
                  onEdit();
                }}
              >
                {chunk.text}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.videoTrack}
            aria-label="Seek video from timeline"
            style={poster ? { backgroundImage: `url(${poster})` } : undefined}
            onClick={(event) => {
              if (event.detail === 0) {
                onSeek(windowStart);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek(
                windowStart +
                  Math.min(
                    1,
                    Math.max(0, (event.clientX - rect.left) / rect.width),
                  ) *
                    windowDuration,
              );
            }}
          >
            <span>{fileName || "Your video"}</span>
          </button>
          <div
            className={styles.playhead}
            style={{ left: `${position}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
      <input
        className={styles.timelineSeek}
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={Math.min(time, duration || 1)}
        aria-label="Seek video"
        aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </section>
  );
});
