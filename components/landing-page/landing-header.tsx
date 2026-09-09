import { ArrowRight } from "lucide-react";
import { GitHubIcon } from "@/components/icons/github-icon";
import { LandingBrand } from "./landing-visuals";
import styles from "./landing.module.css";

export function LandingHeader() {
  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <a href="#" aria-label="Based Subtitles home">
          <LandingBrand />
        </a>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#local">Privacy</a>
          <a href="#examples">Examples</a>
        </nav>
        <div className={styles.headerActions}>
          <a
            href="https://github.com/deifos/basedsubtitles"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            <GitHubIcon width={18} height={18} />
            <span>Open source</span>
          </a>
          <a href="#dropzone" className={styles.primaryButton}>
            Get started <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}
