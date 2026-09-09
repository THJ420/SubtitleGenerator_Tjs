import { ArrowRight, Upload } from "lucide-react";
import { HandNote, ReadyFile } from "./landing-visuals";
import styles from "./landing.module.css";

export function LandingCTA() {
  return (
    <section className={styles.ctaSection}>
      <div className={styles.container}>
        <div className={styles.cta}>
          <div className={styles.ctaCopy}>
            <span className={styles.eyebrow}>No sign-up. Yours to create.</span>
            <h2>
              Ready to add <span>subtitles?</span>
            </h2>
            <p>
              Drop your video above and get started.
              <br />
              No account needed.
            </p>
            <a href="#dropzone" className={styles.primaryButton}>
              <Upload size={18} /> Start adding subtitles{" "}
              <ArrowRight size={18} />
            </a>
            <HandNote className={styles.ctaButtonNote} arrow>
              It just works.
            </HandNote>
          </div>
          <div className={styles.ctaVisual} aria-hidden="true">
            <HandNote className={styles.ctaNote} arrow>
              Private.
              <br />
              Fast.
              <br />
              In your browser.
            </HandNote>
            <div className={styles.ctaFile}>
              <span className={styles.browserDots}>
                <i />
                <i />
                <i />
              </span>
              <ReadyFile compact />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
