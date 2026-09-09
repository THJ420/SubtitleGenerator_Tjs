import Image from "next/image";
import Link from "next/link";
import { APP_VERSION } from "@/lib/changelog";
import { GitHubIcon } from "@/components/icons/github-icon";
import {
  HandNote,
  LandingBrand,
} from "@/components/landing-page/landing-visuals";
import styles from "@/components/landing-page/landing.module.css";

function CreatorLink({ detail = false }: { detail?: boolean }) {
  return (
    <a
      href="https://x.com/deifosv"
      target="_blank"
      rel="noopener noreferrer"
      className={styles.footerCreator}
    >
      <Image
        src="/vlad-pfp.jpg"
        alt=""
        width={detail ? 34 : 25}
        height={detail ? 34 : 25}
      />
      <span>
        <strong>VLAD</strong>
        {detail ? (
          <>
            <small>Indie maker</small>
            <small>Building useful tools with AI.</small>
          </>
        ) : null}
      </span>
    </a>
  );
}

function StackLinks() {
  return (
    <div className={styles.stackLinks}>
      <span>Built with</span>
      <a
        href="https://huggingface.co/docs/transformers.js"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image src="/huggingface-logo.svg" alt="" width={14} height={14} />
        Transformers.js
      </a>
      <span>·</span>
      <a
        href="https://github.com/Vanilagy/mediabunny"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image src="/mediabunny-logo.svg" alt="" width={14} height={14} />
        MediaBunny
      </a>
      <span>·</span>
      <a
        href="https://getbasedapps.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        getbasedapps ↗
      </a>
    </div>
  );
}

export function SiteFooter({
  variant = "compact",
}: {
  variant?: "compact" | "landing";
}) {
  if (variant === "compact") {
    return (
      <footer className={styles.compactFooter}>
        <div>
          <span>Built by</span>
          <CreatorLink />
          <span>·</span>
          <Link href="/changelog">v{APP_VERSION}</Link>
          <span>·</span>
          <a
            href="https://github.com/deifos/basedsubtitles"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <GitHubIcon width={14} height={14} />
            GitHub
          </a>
        </div>
        <StackLinks />
      </footer>
    );
  }
  return (
    <footer className={`${styles.container} ${styles.footer}`}>
      <div className={styles.footerMain}>
        <div className={styles.footerAbout}>
          <a href="#" aria-label="Based Subtitles home">
            <LandingBrand />
          </a>
          <p>
            Subtitles that run in your browser.
            <br />
            Free. Local. Open source.
          </p>
          <a
            href="https://github.com/deifos/basedsubtitles"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerGithub}
          >
            <GitHubIcon width={17} height={17} />
            Open source on GitHub
          </a>
        </div>
        <nav aria-label="Product links">
          <strong>Product</strong>
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#examples">Examples</a>
        </nav>
        <nav aria-label="Resource links">
          <strong>Resources</strong>
          <a href="#local">Privacy</a>
          <Link href="/changelog">Changelog</Link>
          <a
            href="https://getbasedapps.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            More based apps ↗
          </a>
        </nav>
        <div className={styles.footerMaker}>
          <strong>Built by</strong>
          <CreatorLink detail />
        </div>
        <HandNote className={styles.footerNote}>
          Small experiments.
          <br />
          Big possibilities.
        </HandNote>
      </div>
      <div className={styles.footerBottom}>
        <span>
          © {new Date().getFullYear()} basedsubtitles.{" "}
          <Link href="/changelog">v{APP_VERSION}</Link>
        </span>
        <StackLinks />
      </div>
    </footer>
  );
}
