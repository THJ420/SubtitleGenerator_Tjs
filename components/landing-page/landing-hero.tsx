import Image from "next/image";
import { LockKeyhole, WifiOff, Zap } from "lucide-react";
import { LandingDropzone } from "./landing-dropzone";
import { EditorPreview, HandNote } from "./landing-visuals";
import styles from "./landing.module.css";

interface LandingHeroProps {
  onVideoSelect?: (file: File) => void;
}

const BENEFITS = [
  {
    icon: LockKeyhole,
    title: "100% local",
    detail: "Video stays on device",
    tone: "green",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    detail: "Once models are ready",
    tone: "pink",
  },
  {
    icon: Zap,
    title: "Powered by AI",
    detail: "Whisper speech models",
    tone: "purple",
  },
] as const;

export function LandingHero({ onVideoSelect }: LandingHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <span className={styles.heroBadge}>
            <Zap size={15} fill="currentColor" /> Free · No sign-up · Open
            source
          </span>
          <h1>
            Subtitles that run
            <br />
            <span className={styles.highlight}>in your browser</span>
          </h1>
          <p className={styles.heroDescription}>
            Drop a video. Create AI subtitles on your device. Edit every word,
            make it your own, and export.
          </p>
          <div className={styles.benefits}>
            {BENEFITS.map(({ icon: Icon, title, detail, tone }) => (
              <div key={title}>
                <span className={styles.benefitIcon} data-tone={tone}>
                  <Icon size={23} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </div>
            ))}
          </div>
          <div id="dropzone" className={styles.dropzoneAnchor}>
            <LandingDropzone onVideoSelect={onVideoSelect} />
          </div>
        </div>
        <div className={styles.heroVisual}>
          <HandNote className={styles.heroNote} arrow>
            Fast. <br />
            Private. <br />
            In your browser.
          </HandNote>
          <EditorPreview />
          <div className={styles.spark} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <HandNote className={styles.stickyNote}>
            Turn
            <br />
            speech into
            <br />
            <span>opportunity.</span>
          </HandNote>
        </div>
      </div>
      <div className={styles.creatorCredit}>
        <span>MADE FOR CREATORS, BY A CREATOR</span>
        <a
          href="https://x.com/deifosv"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image src="/vlad-pfp.jpg" width={38} height={38} alt="" />
          <strong>VLAD</strong>
        </a>
      </div>
    </section>
  );
}
