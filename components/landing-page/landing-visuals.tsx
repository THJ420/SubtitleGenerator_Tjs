import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import {
  Check,
  Download,
  LockKeyhole,
  Maximize2,
  Play,
  Volume2,
} from "lucide-react";
import styles from "./landing.module.css";

export function LandingBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <span className={styles.brandMark}>FT</span>
      <span>FatahTech Subtitles</span>
    </span>
  );
}

export function HandNote({
  children,
  className = "",
  arrow = false,
}: {
  children: ReactNode;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <div className={`${styles.handNote} ${className}`} aria-hidden="true">
      <span>{children}</span>
      {arrow ? (
        <svg viewBox="0 0 100 72" fill="none" className={styles.noteArrow}>
          <path
            d="M90 7C57 2 23 20 13 59M8 45l4 17 15-12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}

const WAVE_HEIGHTS = Array.from(
  { length: 112 },
  (_, index) =>
    6 +
    Math.round(Math.abs(Math.sin(index * 1.63) * Math.cos(index * 0.23)) * 24),
);

export function DemoWaveform() {
  return (
    <div className={styles.demoWaveform}>
      {WAVE_HEIGHTS.map((height, index) => (
        <i
          key={index}
          style={{ "--bar-height": `${height}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

const DEMO_LINES = [
  "This is how you build",
  "something people love.",
  "Keep it simple.",
  "Focus on what matters.",
  "And iterate quickly.",
  "That’s the game.",
];

export function EditorPreview() {
  return (
    <figure
      className={styles.editorPreview}
      id="examples"
      aria-label="Example of a video with highlighted subtitles and an editable timeline"
    >
      <div aria-hidden="true">
        <div className={styles.previewHeader}>
          <LandingBrand compact />
          <div className={styles.previewActions}>
            <span>
              <Download size={11} /> Export
            </span>
            <span>Download SRT</span>
          </div>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.previewVideoColumn}>
            <div className={styles.previewVideo}>
              <Image
                src="/creator-studio.webp"
                alt=""
                width={960}
                height={640}
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 640px) 82vw, (max-width: 1024px) 60vw, 440px"
              />
              <span className={styles.previewCaption}>
                This is how you build something <mark>people love.</mark>
              </span>
            </div>
            <div className={styles.previewPlayback}>
              <Play size={11} fill="currentColor" />
              <Maximize2 size={11} />
              <span>00:12 / 00:48</span>
              <i />
              <Volume2 size={12} />
            </div>
          </div>
          <div className={styles.previewTranscript}>
            {DEMO_LINES.map((line, index) => (
              <div
                key={line}
                className={index === 1 ? styles.previewActiveLine : undefined}
              >
                <time>00:{String(index * 3).padStart(2, "0")}</time>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.previewTimeline}>
          <DemoWaveform />
          <div className={styles.previewPlayhead} />
          <div className={styles.previewClips}>
            {DEMO_LINES.slice(0, 3).map((line, index) => (
              <span
                key={line}
                className={index === 1 ? styles.activeClip : undefined}
              >
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Style each subtitle and see the result over your video.
      </figcaption>
    </figure>
  );
}

export function BrowserChrome() {
  return (
    <div className={styles.browserChrome} aria-hidden="true">
      <span className={styles.browserDots}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.browserAddress}>
        <LockKeyhole size={12} /> basedsubs.getbasedapps.com
      </span>
    </div>
  );
}

export function ReadyFile({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.readyFile} ${compact ? styles.readyFileCompact : ""}`}
    >
      <Image
        src="/creator-studio.webp"
        width={144}
        height={96}
        sizes="120px"
        alt=""
      />
      <div>
        <strong>{compact ? "subtitles.mp4" : "video.mp4"}</strong>
        <span>
          {compact ? (
            <>
              <Check size={14} /> Ready!
            </>
          ) : (
            "42 seconds · 1080p"
          )}
        </span>
        <small>{compact ? "42s · 1080p" : "Processed locally"}</small>
      </div>
    </div>
  );
}
