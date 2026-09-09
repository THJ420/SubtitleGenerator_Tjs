"use client";

import type { JSX } from "react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { VideoUpload } from "@/components/video-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  Download,
  Video,
  SlidersHorizontal,
  Captions,
  Info,
  LockKeyhole,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Loader2,
  RefreshCw,
  RectangleHorizontal,
  RectangleVertical,
  Clapperboard,
} from "lucide-react";
import { TranscriptSidebar } from "@/components/transcript-sidebar";
import {
  FONT_FAMILIES,
  SubtitleStyling,
  SubtitleStyle,
} from "@/components/subtitle-styling";
import { WordStylePopover } from "@/components/word-style-popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  processTranscriptChunks,
  binarySearchActiveChunk,
  formatTime,
  type WordStyleOverride,
} from "@/lib/transcript-utils";
import {
  useTranscription,
  STATUS_MESSAGES,
  type TranscriptionResult,
  type ModelSize,
} from "@/hooks/useTranscription";
import { useVideoDownloadMediaBunny } from "@/hooks/useVideoDownloadMediaBunny";
import { useBackgroundRemoval } from "@/hooks/useBackgroundRemoval";
import { getBackgroundRemovalWarningDuration } from "@/lib/background-removal-warning";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { type LanguageCode } from "@/components/language-selector";
import { LanguageSelectionModal } from "@/components/language-selection-modal";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { APP_VERSION } from "@/lib/changelog";
import { extractAudioFromVideo, NoAudioDetectedError } from "@/lib/audio-utils";
import {
  createSilenceRemovalPlan,
  detectSilenceRanges,
  SILENCE_REMOVAL_LEVELS,
  type SilenceRemovalLevel,
  type TimeRange,
} from "@/lib/silence-removal";
import { toast } from "sonner";
import { EditorTimeline } from "@/components/editor/editor-timeline";
import { TranscriptionProgress } from "@/components/editor/transcription-progress";
import { VideoEffectsControls } from "@/components/editor/video-effects-controls";
import { PersonSubtitleControls } from "@/components/editor/person-subtitle-controls";
import styles from "@/components/editor/editor.module.css";

interface MainAppProps {
  initialFile?: File | null;
  onReturnToLanding?: () => void;
}

// Default subtitle style - Gold preset
const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  uppercase: false,
  wordEmphasisBackgroundColor: "#000000",
  fontFamily: FONT_FAMILIES.playfairDisplay.value,
  fontSize: 18,
  fontWeight: "600",
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundStyle: "solid",
  borderWidth: 1,
  borderColor: "#1A1A1A",
  dropShadowIntensity: 0.55,
  wordEmphasisEnabled: false,
  wordEmphasisColorEnabled: false,
  wordEmphasisColor: "#F2D21B",
  windEnabled: false,
  position: "bottom",
  maxWordsPerLine: 3,
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
  verticalOffset: -10,
};

export function MainApp({
  initialFile = null,
  onReturnToLanding,
}: MainAppProps): JSX.Element {
  const [currentTime, setCurrentTime] = useState(0);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(
    DEFAULT_SUBTITLE_STYLE,
  );
  const [uploadKey, setUploadKey] = useState(0);
  const [mode, setMode] = useState<"word" | "phrase">("phrase");
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  const [zoomPortrait, setZoomPortrait] = useState(false);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [modelSize, setModelSize] = useState<ModelSize>("base");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [editorTab, setEditorTab] = useState<"style" | "subtitles" | "video">(
    "style",
  );
  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [bgConfirmationDuration, setBgConfirmationDuration] = useState<
    number | null
  >(null);
  const pendingPersonEffectRef = useRef<"depth" | "background">("background");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedWordTimestamp, setSelectedWordTimestamp] = useState<
    [number, number] | null
  >(null);
  const previousResultRef = useRef<TranscriptionResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastChunkKeyRef = useRef<string | null>(null);

  const {
    status,
    error,
    notice,
    result,
    progress,
    modelLoading,
    device,
    setResult,
    handleVideoSelect: handleVideoSelectBase,
    startTranscription,
    resetTranscription,
    cancelTranscription,
    setStatus: setTranscriptionStatus,
  } = useTranscription();

  const {
    isModelLoading: isBgModelLoading,
    isProcessing: isBgProcessing,
    progress: bgProgress,
    isReady: bgRemovalReady,
    processVideo: processBgRemoval,
    getMaskAtTime,
    reset: resetBgRemoval,
    processFrame: bgProcessFrame,
  } = useBackgroundRemoval();

  const { startTracking, stopTracking, getCenterX, buildExportTimeline } =
    useFaceTracking();

  // User toggle for face tracking + whether it's actively running
  const [faceTrackingEnabled, setFaceTrackingEnabled] = useState(true);
  const [isFaceTrackingActive, setIsFaceTrackingActive] = useState(false);
  const [isVideoLandscape, setIsVideoLandscape] = useState(false);

  // Start/stop face tracking: runs when split subtitles, auto zoom, or manual tracking is on
  const splitActive = subtitleStyle.splitSubtitleMode !== "none";
  const hasTranscript = result !== null;
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoEl.src || videoEl.src === window.location.href) {
      return;
    }

    const tryStart = () => {
      if (!videoEl.videoWidth) return; // metadata not loaded yet
      const isLandscape = videoEl.videoWidth > videoEl.videoHeight;
      setIsVideoLandscape(isLandscape);
      if (
        hasTranscript &&
        ((faceTrackingEnabled && ratio === "9:16" && isLandscape) ||
          splitActive ||
          autoZoomEnabled)
      ) {
        startTracking(videoEl);
        setIsFaceTrackingActive(true);
      } else {
        stopTracking();
        setIsFaceTrackingActive(false);
      }
    };

    // If metadata is already loaded, start immediately
    if (videoEl.readyState >= 1) {
      tryStart();
    } else {
      videoEl.addEventListener("loadedmetadata", tryStart, { once: true });
    }

    return () => {
      videoEl.removeEventListener("loadedmetadata", tryStart);
      stopTracking();
      setIsFaceTrackingActive(false);
    };
  }, [
    ratio,
    faceTrackingEnabled,
    videoDuration,
    hasTranscript,
    splitActive,
    autoZoomEnabled,
    startTracking,
    stopTracking,
  ]);

  const [silenceRemovalLevel, setSilenceRemovalLevel] =
    useState<SilenceRemovalLevel>("off");
  const [silenceRemovedRanges, setSilenceRemovedRanges] = useState<TimeRange[]>(
    [],
  );
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);
  const silenceDetectionRunIdRef = useRef(0);
  const silenceDetectionAbortRef = useRef<AbortController | null>(null);

  const handleVideoSelect = useCallback(
    (file: File) => {
      setUploadedFile(file);
      silenceDetectionAbortRef.current?.abort();
      silenceDetectionRunIdRef.current += 1;
      setSilenceRemovalLevel("off");
      setSilenceRemovedRanges([]);
      setIsDetectingSilence(false);
      handleVideoSelectBase(file);
      // Show language selection modal after video loads
      setShowLanguageModal(true);
    },
    [handleVideoSelectBase],
  );

  const handleAspectRatioDetected = useCallback(
    (detectedRatio: "16:9" | "9:16") => {
      setRatio(detectedRatio);
      // Reset zoom when aspect ratio changes
      if (detectedRatio === "16:9") {
        setZoomPortrait(false);
      }
    },
    [],
  );

  const handleLanguageConfirm = useCallback(
    (selectedLanguage: LanguageCode, selectedModelSize: ModelSize) => {
      videoRef.current?.pause();
      setLanguage(selectedLanguage);
      setModelSize(selectedModelSize);
      setResult(null);
      setShowLanguageModal(false);
      previousResultRef.current = null;
      // Set status synchronously so the processing overlay appears in the same
      // render batch as the modal close — no idle gap.
      setTranscriptionStatus("processing");
      if (uploadedFile) {
        startTranscription(uploadedFile, selectedLanguage, selectedModelSize);
      }
    },
    [uploadedFile, startTranscription, setResult, setTranscriptionStatus],
  );

  const handleChangeLanguage = useCallback(() => {
    previousResultRef.current = result;
    setShowLanguageModal(true);
  }, [result]);

  const [exportQuality, setExportQuality] = useState<"medium" | "high">(
    "medium",
  );
  const sourceDuration = videoDuration;
  const silenceRemovalPlan = useMemo(
    () =>
      sourceDuration > 0 &&
      silenceRemovalLevel !== "off" &&
      silenceRemovedRanges.length > 0
        ? createSilenceRemovalPlan(sourceDuration, silenceRemovedRanges)
        : null,
    [sourceDuration, silenceRemovalLevel, silenceRemovedRanges],
  );
  const silenceDurationLabel =
    silenceRemovalLevel !== "off" && sourceDuration > 0
      ? `${Math.max(0, sourceDuration - (silenceRemovalPlan?.outputDuration ?? sourceDuration)).toFixed(1)}s shorter`
      : null;

  const handleSilenceRemovalLevelChange = useCallback(
    async (value: string) => {
      const nextLevel = value as SilenceRemovalLevel;
      silenceDetectionAbortRef.current?.abort();
      const runId = silenceDetectionRunIdRef.current + 1;
      silenceDetectionRunIdRef.current = runId;
      setSilenceRemovalLevel(nextLevel);
      setSilenceRemovedRanges([]);

      if (nextLevel === "off") {
        setSilenceRemovedRanges([]);
        setIsDetectingSilence(false);
        return;
      }

      if (!uploadedFile) {
        setSilenceRemovedRanges([]);
        toast.error("Upload a video before enabling silence removal.");
        return;
      }

      const levelConfig = SILENCE_REMOVAL_LEVELS[nextLevel];
      const controller = new AbortController();
      silenceDetectionAbortRef.current = controller;
      setIsDetectingSilence(true);
      try {
        const audioData = await extractAudioFromVideo(
          uploadedFile,
          controller.signal,
        );
        if (silenceDetectionRunIdRef.current !== runId) return;
        const ranges = detectSilenceRanges(audioData, levelConfig.minDuration);
        if (silenceDetectionRunIdRef.current !== runId) return;
        setSilenceRemovedRanges(ranges);
        if (ranges.length === 0) {
          toast.info("No matching silent sections found.");
        }
      } catch (error) {
        if (silenceDetectionRunIdRef.current !== runId) return;
        setSilenceRemovalLevel("off");
        setSilenceRemovedRanges([]);
        if (error instanceof NoAudioDetectedError) {
          toast.info(error.message);
          return;
        }
        setSilenceRemovedRanges([]);
        toast.error(
          `Silence detection failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (silenceDetectionRunIdRef.current === runId) {
          setIsDetectingSilence(false);
        }
      }
    },
    [uploadedFile],
  );

  const {
    downloadVideo,
    cancelDownload,
    isProcessing: isDownloadProcessing,
    progress: downloadProgress,
    status: downloadStatus,
  } = useVideoDownloadMediaBunny({
    videoRef,
    transcriptChunks: result?.chunks || [],
    subtitleStyle,
    mode,
    ratio,
    format: "mp4",
    quality: exportQuality,
    fps: 30,
    bgRemovalReady,
    videoDuration,
    cropTrackingEnabled:
      faceTrackingEnabled && ratio === "9:16" && isVideoLandscape,
    processFrame: bgProcessFrame,
    getMaskAtTime,
    buildExportTimeline:
      (faceTrackingEnabled && ratio === "9:16" && isVideoLandscape) ||
      splitActive ||
      autoZoomEnabled
        ? buildExportTimeline
        : undefined,
    silenceRemovalRanges:
      silenceRemovalLevel === "off" ? [] : silenceRemovedRanges,
    autoZoomEnabled,
  });

  const startBgRemoval = useCallback(
    async (effect: "depth" | "background") => {
      if (!videoRef.current) return;
      setSubtitleStyle((prev) => ({
        ...prev,
        backgroundRemovalEnabled: effect === "background",
        dynamicEnabled: effect === "depth",
      }));
      try {
        await processBgRemoval(videoRef.current, videoDuration);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setSubtitleStyle((previous) => ({
          ...previous,
          backgroundRemovalEnabled: false,
          dynamicEnabled: false,
        }));
        toast.error(
          "Background removal failed. This feature requires WebGPU or WASM support, which may not be available on your device.",
        );
      }
    },
    [processBgRemoval, videoDuration],
  );

  const handlePersonEffect = useCallback(
    (effect: "depth" | "background") => {
      if (!videoRef.current) return;
      if (bgRemovalReady) {
        setSubtitleStyle((previous) => ({
          ...previous,
          backgroundRemovalEnabled: effect === "background",
          dynamicEnabled: effect === "depth",
        }));
        return;
      }
      pendingPersonEffectRef.current = effect;
      const warningDuration = getBackgroundRemovalWarningDuration(
        videoRef.current.duration,
        videoDuration,
      );
      if (warningDuration !== null) {
        setBgConfirmationDuration(warningDuration);
        return;
      }
      void startBgRemoval(effect);
    },
    [bgRemovalReady, startBgRemoval, videoDuration],
  );

  const handleCancelBgRemoval = useCallback(() => {
    resetBgRemoval();
    setSubtitleStyle((prev) => ({
      ...prev,
      backgroundRemovalEnabled: false,
      dynamicEnabled: false,
    }));
  }, [resetBgRemoval]);

  // Memoized handlers for better performance
  const handleResetVideo = useCallback(() => {
    cancelDownload();
    // Reset transcription state
    resetTranscription();

    // Reset face tracking
    stopTracking();
    setIsFaceTrackingActive(false);
    setIsVideoLandscape(false);

    // Reset background removal
    resetBgRemoval();
    silenceDetectionRunIdRef.current += 1;
    silenceDetectionAbortRef.current?.abort();
    setSilenceRemovalLevel("off");
    setSilenceRemovedRanges([]);
    setIsDetectingSilence(false);
    setSubtitleStyle((prev) => ({
      ...prev,
      backgroundRemovalEnabled: false,
      dynamicEnabled: false,
    }));

    // Clear uploaded file
    setUploadedFile(null);
    setVideoDuration(0);
    setAutoZoomEnabled(false);

    // Reset current time
    setCurrentTime(0);

    // Increment key to force VideoUpload component to remount
    setUploadKey((prev) => prev + 1);

    // Reset video element
    if (videoRef.current) {
      // First pause the video to prevent any issues
      videoRef.current.pause();
      // Clear the source
      videoRef.current.removeAttribute("src");
      // Force the browser to release any object URLs
      videoRef.current.load();
    }

    onReturnToLanding?.();
  }, [
    resetTranscription,
    resetBgRemoval,
    stopTracking,
    cancelDownload,
    onReturnToLanding,
  ]);

  const handleModalClose = useCallback(() => {
    if (previousResultRef.current && !result) {
      // User cancelled "Change Language" — restore previous result
      setResult(previousResultRef.current);
      setShowLanguageModal(false);
      previousResultRef.current = null;
    } else if (!result) {
      // No transcription yet — go back to landing page
      setShowLanguageModal(false);
      previousResultRef.current = null;
      handleResetVideo();
    } else {
      setShowLanguageModal(false);
      previousResultRef.current = null;
    }
  }, [result, setResult, handleResetVideo]);

  const handleModeChange = useCallback((value: "word" | "phrase") => {
    setMode(value);
  }, []);

  const handleRatioChange = useCallback((value: string) => {
    const newRatio = value as "16:9" | "9:16";
    setRatio(newRatio);
    if (newRatio === "16:9") {
      setZoomPortrait(false);
    } else {
      setSubtitleStyle((previous) =>
        previous.splitSubtitleMode === "left-right"
          ? { ...previous, splitSubtitleMode: "none" }
          : previous,
      );
    }
  }, []);

  const handleZoomPortraitChange = useCallback((zoom: boolean) => {
    setZoomPortrait(zoom);
  }, []);

  const handleWordSelect = useCallback((timestamp: [number, number]) => {
    setSelectedWordTimestamp((prev) =>
      prev && prev[0] === timestamp[0] && prev[1] === timestamp[1]
        ? null // deselect if clicking the same word
        : timestamp,
    );
  }, []);

  const handleWordStyleChange = useCallback(
    (override: WordStyleOverride) => {
      if (!result || !selectedWordTimestamp) return;
      setResult((prev) => {
        if (!prev) return prev;
        const updatedChunks = prev.chunks.map((chunk) => {
          if (
            chunk.timestamp[0] === selectedWordTimestamp[0] &&
            chunk.timestamp[1] === selectedWordTimestamp[1]
          ) {
            return {
              ...chunk,
              styleOverride:
                Object.keys(override).length > 0 ? override : undefined,
            };
          }
          return chunk;
        });
        return { ...prev, chunks: updatedChunks };
      });
    },
    [result, selectedWordTimestamp, setResult],
  );

  const handleWordStyleReset = useCallback(() => {
    handleWordStyleChange({});
  }, [handleWordStyleChange]);

  const handleWordStyleClose = useCallback(() => {
    setSelectedWordTimestamp(null);
  }, []);

  // Get the selected word's text and current override
  const selectedWordInfo = useMemo(() => {
    if (!result || !selectedWordTimestamp) return null;
    const chunk = result.chunks.find(
      (c) =>
        c.timestamp[0] === selectedWordTimestamp[0] &&
        c.timestamp[1] === selectedWordTimestamp[1],
    );
    if (!chunk) return null;
    return { text: chunk.text, override: chunk.styleOverride ?? {} };
  }, [result, selectedWordTimestamp]);

  // Get current phrase words for the word chip bar
  // Pre-compute phrase chunks once per transcript/mode change (not per frame)
  const processedPhraseChunks = useMemo(() => {
    if (!result || mode !== "phrase") return [];
    return processTranscriptChunks(
      result,
      "phrase",
      subtitleStyle.maxWordsPerLine,
      subtitleStyle.dynamicEnabled,
    );
  }, [
    result,
    mode,
    subtitleStyle.maxWordsPerLine,
    subtitleStyle.dynamicEnabled,
  ]);

  const handleTimeUpdate = useCallback(
    (time: number) => {
      // Only call setCurrentTime when the active phrase chunk changes.
      // This prevents main-app (and all its children) from re-rendering every
      // 250ms during playback. VideoCaption uses localTime inside VideoUpload
      // and doesn't need main-app re-renders for subtitle display.
      if (processedPhraseChunks.length > 0) {
        const newChunk = binarySearchActiveChunk(processedPhraseChunks, time);
        const newKey = newChunk
          ? `${newChunk.timestamp[0]}-${newChunk.timestamp[1]}`
          : null;
        if (newKey !== lastChunkKeyRef.current) {
          lastChunkKeyRef.current = newKey;
          setCurrentTime(time);
        }
      } else {
        // Word mode or no transcript: update normally (sidebar highlighting)
        setCurrentTime(time);
      }
    },
    [processedPhraseChunks],
  );

  // Binary-search for the active chunk on each time update
  const currentPhraseWords = useMemo(() => {
    if (!processedPhraseChunks.length) return [];
    const activeChunk = binarySearchActiveChunk(
      processedPhraseChunks,
      currentTime,
    );
    if (!activeChunk?.words) return [];
    return activeChunk.words.filter((w) => !w.disabled && !w.subtitleHidden);
  }, [processedPhraseChunks, currentTime]);

  const isProcessing = status !== "idle" && status !== "ready";
  const isPreparingTranscription = isProcessing && result === null;
  const isTranscribingBanner = isProcessing && result !== null;
  const statusMessage = STATUS_MESSAGES[status] ?? "Processing video...";
  const latestTranscribedTime = result?.chunks?.at(-1)?.timestamp?.[1] ?? null;
  const visibleProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const deviceLabel = device === "webgpu" ? "WebGPU" : "CPU";

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - time) > 0.001) {
        videoRef.current.currentTime = time;
      }
      setCurrentTime(time);
    }
  }, []);
  const handleTranscriptUpdate = useCallback(
    (updated: TranscriptionResult) => {
      setResult((previous) =>
        previous ? { ...previous, ...updated } : updated,
      );
    },
    [setResult],
  );
  const showTranscript = useCallback(() => setEditorTab("subtitles"), []);
  useEffect(
    () => () => {
      silenceDetectionRunIdRef.current += 1;
      silenceDetectionAbortRef.current?.abort();
    },
    [],
  );

  return (
    <main className={styles.editor} data-editing={result !== null}>
      {!isPreparingTranscription ? (
        <h1 className="sr-only">Based Subtitles video editor</h1>
      ) : null}
      <header className={styles.header}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => setShowAboutSheet(true)}
          aria-label="About Based Subtitles"
        >
          <span className={styles.brandMark}>BS</span>
          <span>basedsubtitles</span>
        </button>
        <span className={styles.projectName} title={uploadedFile?.name}>
          {uploadedFile?.name || "Untitled Project"}
        </span>
        <div className={styles.headerActions}>
          <span className={styles.localBadge}>
            <span />
            100% Local
          </span>
          {isProcessing ? (
            <Button variant="outline" onClick={cancelTranscription}>
              Cancel
            </Button>
          ) : result ? (
            <>
              <Button
                variant="outline"
                aria-label="New video"
                onClick={() => setShowResetConfirm(true)}
                disabled={isDownloadProcessing}
              >
                <Upload />
                <span>New video</span>
              </Button>
              <Button
                onClick={downloadVideo}
                disabled={
                  isDownloadProcessing ||
                  isBgModelLoading ||
                  isBgProcessing ||
                  isDetectingSilence
                }
                title={
                  isBgModelLoading || isBgProcessing
                    ? "Wait for the person effect to finish."
                    : undefined
                }
              >
                <Download />
                {isDownloadProcessing ? "Exporting…" : "Export"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setShowResetConfirm(true)}>
              Cancel
            </Button>
          )}
        </div>
      </header>
      {error ? (
        <Alert
          variant="destructive"
          className="mx-auto my-3 w-[calc(100%-2rem)]"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!isDownloadProcessing && downloadStatus.startsWith("Error:") ? (
        <Alert
          variant="destructive"
          className="mx-auto my-3 w-[calc(100%-2rem)]"
        >
          <AlertDescription>{downloadStatus}</AlertDescription>
        </Alert>
      ) : null}
      {showLanguageModal ? (
        <LanguageSelectionModal
          open={showLanguageModal}
          onClose={handleModalClose}
          onConfirm={handleLanguageConfirm}
          defaultLanguage={language}
          defaultModelSize={modelSize}
        />
      ) : null}
      {isPreparingTranscription ? (
        <TranscriptionProgress
          status={status}
          progress={visibleProgress}
          modelLoading={modelLoading}
          device={device}
        />
      ) : null}
      <div
        className={`${styles.workspace} ${!result ? styles.emptyWorkspace : ""}`}
        hidden={isPreparingTranscription}
      >
        {result ? (
          <>
            <nav className={styles.rail} aria-label="Editor tools">
              <button
                type="button"
                data-active={editorTab === "style"}
                aria-pressed={editorTab === "style"}
                onClick={() => setEditorTab("style")}
              >
                <SlidersHorizontal />
                <span>Style</span>
              </button>
              <button
                type="button"
                data-active={editorTab === "subtitles"}
                aria-pressed={editorTab === "subtitles"}
                onClick={() => setEditorTab("subtitles")}
              >
                <Captions />
                <span>Subtitles</span>
              </button>
              <button
                type="button"
                data-active={editorTab === "video"}
                aria-pressed={editorTab === "video"}
                onClick={() => setEditorTab("video")}
              >
                <Video />
                <span>Video</span>
              </button>
              <button
                type="button"
                className={styles.aboutButton}
                aria-label="About"
                onClick={() => setShowAboutSheet(true)}
              >
                <Info />
                <span>About</span>
              </button>
            </nav>
            <aside
              className={styles.sidebar}
              data-expanded={panelExpanded}
              aria-label={
                editorTab === "style"
                  ? "Subtitle style"
                  : editorTab === "subtitles"
                    ? "Edit subtitles"
                    : "Video settings"
              }
            >
              <div className={styles.panelTools}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPanelExpanded((value) => !value)}
                  aria-label={
                    panelExpanded
                      ? "Collapse editor panel"
                      : "Expand editor panel"
                  }
                >
                  {panelExpanded ? <Minimize2 /> : <Maximize2 />}
                  {panelExpanded ? "Collapse" : "Expand"}
                </Button>
              </div>
              {editorTab === "style" ? (
                <SubtitleStyling
                  style={subtitleStyle}
                  onChange={setSubtitleStyle}
                  mode={mode}
                  onModeChange={handleModeChange}
                  personEffects={
                    <PersonSubtitleControls
                      placement={subtitleStyle.splitSubtitleMode}
                      onPlacementChange={(placement) =>
                        setSubtitleStyle((previous) => ({
                          ...previous,
                          splitSubtitleMode: placement,
                        }))
                      }
                      portrait={ratio === "9:16"}
                      depthEnabled={subtitleStyle.dynamicEnabled}
                      onDepthChange={(enabled) => {
                        if (enabled) handlePersonEffect("depth");
                        else
                          setSubtitleStyle((previous) => ({
                            ...previous,
                            dynamicEnabled: false,
                          }));
                      }}
                      modelLoading={isBgModelLoading}
                      processing={isBgProcessing}
                      progress={bgProgress}
                      onCancel={handleCancelBgRemoval}
                      disabled={isDownloadProcessing}
                    />
                  }
                />
              ) : null}
              {editorTab === "subtitles" ? (
                <>
                  <TranscriptSidebar
                    className={styles.transcriptPanel}
                    transcript={result}
                    currentTime={currentTime}
                    setCurrentTime={handleSeek}
                    onTranscriptUpdate={handleTranscriptUpdate}
                    mode={mode}
                    maxWordsPerLine={subtitleStyle.maxWordsPerLine}
                    dynamicEnabled={subtitleStyle.dynamicEnabled}
                    videoFileName={uploadedFile?.name}
                  />
                  {result.generationTime ? (
                    <p className={styles.panelFootnote}>
                      Generated in {Math.round(result.generationTime / 1000)}s ·{" "}
                      {deviceLabel}
                    </p>
                  ) : null}
                </>
              ) : null}
              {editorTab === "video" ? (
                <div className={styles.videoSettings}>
                  <div className={styles.panelHeading}>
                    <h2>Video settings</h2>
                    <p>Frame your video and refine the pace.</p>
                  </div>
                  <div className={styles.settingGroup}>
                    <label htmlFor="video-ratio">Aspect ratio</label>
                    <Select value={ratio} onValueChange={handleRatioChange}>
                      <SelectTrigger id="video-ratio">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">Landscape · 16:9</SelectItem>
                        <SelectItem value="9:16">Portrait · 9:16</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {ratio === "9:16" ? (
                    <Button
                      variant={zoomPortrait ? "default" : "outline"}
                      onClick={() => handleZoomPortraitChange(!zoomPortrait)}
                    >
                      <ZoomIn />
                      {zoomPortrait ? "Zoom to fill" : "Fit video"}
                    </Button>
                  ) : null}
                  <VideoEffectsControls
                    trackingEnabled={faceTrackingEnabled}
                    canTrackPerson={ratio === "9:16" && isVideoLandscape}
                    onTrackingChange={setFaceTrackingEnabled}
                    backgroundEnabled={subtitleStyle.backgroundRemovalEnabled}
                    backgroundReady={bgRemovalReady}
                    backgroundType={subtitleStyle.backgroundType}
                    backgroundColor={subtitleStyle.solidBackgroundColor}
                    onBackgroundTypeChange={(backgroundType) =>
                      setSubtitleStyle((previous) => ({
                        ...previous,
                        backgroundType,
                      }))
                    }
                    onBackgroundColorChange={(solidBackgroundColor) =>
                      setSubtitleStyle((previous) => ({
                        ...previous,
                        solidBackgroundColor,
                      }))
                    }
                    modelLoading={isBgModelLoading}
                    processing={isBgProcessing}
                    progress={bgProgress}
                    disabled={isDownloadProcessing}
                    onRemoveBackground={() => handlePersonEffect("background")}
                    onToggleBackground={() =>
                      setSubtitleStyle((previous) => ({
                        ...previous,
                        dynamicEnabled: false,
                        backgroundRemovalEnabled:
                          !previous.backgroundRemovalEnabled,
                      }))
                    }
                    onCancelBackground={handleCancelBgRemoval}
                  />
                  <div className={styles.settingGroup}>
                    <label htmlFor="silence-removal">Silence removal</label>
                    <p role="status" aria-live="polite">
                      {isDetectingSilence
                        ? "Finding quiet sections… Changes apply when this finishes."
                        : silenceRemovalLevel === "off"
                          ? "Off — play and export the original pauses."
                          : silenceRemovedRanges.length === 0
                            ? "No matching pauses found. The video is unchanged."
                            : `Active in preview and export · ${silenceRemovedRanges.length} cuts · ${silenceDurationLabel}`}
                    </p>
                    {silenceRemovalLevel !== "off" &&
                    !isDetectingSilence &&
                    silenceRemovedRanges.length > 0 ? (
                      <p>
                        The playhead skips the cut sections. Timeline times
                        refer to the original video.
                      </p>
                    ) : null}
                    <Select
                      value={silenceRemovalLevel}
                      onValueChange={handleSilenceRemovalLevelChange}
                      disabled={isDetectingSilence || isDownloadProcessing}
                    >
                      <SelectTrigger id="silence-removal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="aggressive">
                          {SILENCE_REMOVAL_LEVELS.aggressive.label}
                        </SelectItem>
                        <SelectItem value="default">
                          {SILENCE_REMOVAL_LEVELS.default.label}
                        </SelectItem>
                        <SelectItem value="conservative">
                          {SILENCE_REMOVAL_LEVELS.conservative.label}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant={autoZoomEnabled ? "default" : "outline"}
                    onClick={() => setAutoZoomEnabled((value) => !value)}
                  >
                    <Clapperboard />
                    Auto zoom cuts {autoZoomEnabled ? "on" : "off"}
                  </Button>
                  <div className={styles.settingGroup}>
                    <label htmlFor="export-quality">Export quality</label>
                    {videoDuration > 30 * 60 ? (
                      <p>
                        Long videos can take time to export. You can also
                        download SRT from the Subtitles panel and use a desktop
                        video app.
                      </p>
                    ) : null}
                    <Select
                      value={exportQuality}
                      onValueChange={(value) =>
                        setExportQuality(value as "medium" | "high")
                      }
                      disabled={isDownloadProcessing}
                    >
                      <SelectTrigger id="export-quality">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medium">
                          Standard · smaller file
                        </SelectItem>
                        <SelectItem value="high">
                          High quality · larger file
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleChangeLanguage}
                    disabled={isProcessing || isDownloadProcessing}
                  >
                    <RefreshCw />
                    Regenerate subtitles
                  </Button>
                </div>
              ) : null}
            </aside>
          </>
        ) : null}
        <div className={styles.canvasColumn}>
          <section
            className={styles.preview}
            data-ratio={ratio}
            aria-label="Video preview"
          >
            {result ? (
              <div className={styles.previewToolbar}>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => handleZoomPortraitChange(!zoomPortrait)}
                    disabled={ratio !== "9:16"}
                    aria-label={
                      zoomPortrait ? "Fit video in frame" : "Zoom video to fill"
                    }
                  >
                    {zoomPortrait ? <ZoomIn /> : <ZoomOut />}
                    {zoomPortrait ? "Zoom" : "Fit"}
                  </Button>
                  <Select value={ratio} onValueChange={handleRatioChange}>
                    <SelectTrigger
                      aria-label="Preview aspect ratio"
                      className="w-28 bg-white"
                    >
                      {ratio === "9:16" ? (
                        <RectangleVertical size={16} />
                      ) : (
                        <RectangleHorizontal size={16} />
                      )}
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9</SelectItem>
                      <SelectItem value="9:16">9:16</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <div className={styles.videoStage}>
              <VideoUpload
                key={uploadKey}
                className={styles.videoUpload}
                onVideoSelect={handleVideoSelect}
                onAspectRatioDetected={handleAspectRatioDetected}
                onDurationChange={setVideoDuration}
                ref={videoRef}
                onTimeUpdate={handleTimeUpdate}
                transcript={result}
                currentTime={currentTime}
                subtitleStyle={subtitleStyle}
                mode={mode}
                ratio={ratio}
                zoomPortrait={zoomPortrait}
                initialFile={initialFile}
                bgRemovalReady={bgRemovalReady}
                getMaskAtTime={getMaskAtTime}
                getCenterX={getCenterX}
                isFaceTrackingActive={isFaceTrackingActive}
                cropTrackingEnabled={
                  faceTrackingEnabled && ratio === "9:16" && isVideoLandscape
                }
                silenceRemovalRanges={
                  silenceRemovalLevel === "off" ? [] : silenceRemovedRanges
                }
                autoZoomEnabled={autoZoomEnabled}
              />
              {selectedWordInfo && selectedWordTimestamp ? (
                <WordStylePopover
                  key={`${selectedWordTimestamp[0]}-${selectedWordTimestamp[1]}`}
                  wordText={selectedWordInfo.text}
                  override={selectedWordInfo.override}
                  onChange={handleWordStyleChange}
                  onReset={handleWordStyleReset}
                  onClose={handleWordStyleClose}
                  className={styles.wordPopover}
                />
              ) : null}
            </div>
            {result ? (
              <div className={styles.wordChips}>
                {mode === "phrase" && currentPhraseWords.length > 0 ? (
                  <span>Edit word</span>
                ) : null}
                {(mode === "phrase" ? currentPhraseWords : []).map(
                  (word, index) => (
                    <Button
                      key={`${word.timestamp[0]}-${index}`}
                      size="xs"
                      variant="outline"
                      data-selected={
                        selectedWordTimestamp?.[0] === word.timestamp[0] &&
                        selectedWordTimestamp?.[1] === word.timestamp[1]
                      }
                      onClick={() => handleWordSelect(word.timestamp)}
                    >
                      {word.text}
                    </Button>
                  ),
                )}
              </div>
            ) : null}
            {isTranscribingBanner ? (
              <div className={styles.transcribingBanner} role="status">
                <Loader2 size={16} className="animate-spin" />
                {statusMessage}{" "}
                {latestTranscribedTime !== null
                  ? formatTime(latestTranscribedTime)
                  : ""}{" "}
                · {visibleProgress}%
              </div>
            ) : null}
          </section>
          {!result && !isProcessing ? (
            <div
              className={styles.emptyPrompt}
              role={notice ? "status" : undefined}
            >
              <h2>
                {notice ? "No audio detected" : "Your video. Your words."}
              </h2>
              <p>
                {notice?.replace(/^No audio detected\. /, "") ??
                  "Choose the spoken language to start. All video processing stays on this device."}
              </p>
              <Button
                onClick={() =>
                  notice ? handleResetVideo() : setShowLanguageModal(true)
                }
              >
                {notice ? "Choose another video" : "Generate subtitles"}
              </Button>
            </div>
          ) : null}
          {result ? (
            <>
              <EditorTimeline
                videoRef={videoRef}
                transcript={result}
                duration={videoDuration}
                file={uploadedFile}
                silenceRemovalRanges={
                  silenceRemovalLevel === "off"
                    ? undefined
                    : silenceRemovedRanges
                }
                fileName={uploadedFile?.name}
                maxWordsPerLine={subtitleStyle.maxWordsPerLine}
                onSeek={handleSeek}
                onEdit={showTranscript}
              />
              <div className={styles.editorBottom}>
                <span>
                  <LockKeyhole size={13} /> Your original video stays unchanged.
                </span>
                <div>
                  <Button
                    variant="outline"
                    onClick={handleChangeLanguage}
                    disabled={isProcessing || isDownloadProcessing}
                  >
                    <RefreshCw />
                    Generate subtitles
                  </Button>
                  <Button
                    className={styles.exportButton}
                    onClick={downloadVideo}
                    disabled={
                      isProcessing ||
                      isDownloadProcessing ||
                      isBgModelLoading ||
                      isBgProcessing ||
                      isDetectingSilence
                    }
                    title={
                      isBgModelLoading || isBgProcessing
                        ? "Wait for the person effect to finish."
                        : undefined
                    }
                  >
                    <Download />
                    {isDownloadProcessing ? "Exporting video…" : "Export Video"}
                  </Button>
                </div>
              </div>
              {isDownloadProcessing ? (
                <div className={styles.exportProgress} role="status">
                  <div>
                    <strong>{downloadStatus}</strong>
                    <span>{Math.round(downloadProgress)}%</span>
                  </div>
                  <progress
                    value={downloadProgress}
                    max={100}
                    aria-label="Video export progress"
                  />
                  <Button variant="outline" onClick={cancelDownload}>
                    Stop export
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <AlertDialog
        open={bgConfirmationDuration !== null}
        onOpenChange={(open) => {
          if (!open) setBgConfirmationDuration(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Long video</AlertDialogTitle>
            <AlertDialogDescription>
              This video is {formatTime(bgConfirmationDuration ?? 0)} long
              (minutes:seconds). Background removal can take some time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startBgRemoval(pendingPersonEffectRef.current)}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current subtitles and styling will be lost. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleResetVideo}>
              Upload New
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet open={showAboutSheet} onOpenChange={setShowAboutSheet}>
        <SheetContent side="right" className="rounded-l-2xl">
          <SheetHeader>
            <SheetTitle>Based Subtitles</SheetTitle>
            <SheetDescription>
              Video subtitles, made on your device.
            </SheetDescription>
          </SheetHeader>
          <div className={styles.aboutContent}>
            <p>
              Built by{" "}
              <a
                href="https://x.com/deifosv"
                target="_blank"
                rel="noopener noreferrer"
              >
                Vlad
              </a>
            </p>
            <a href="/changelog">What is new · v{APP_VERSION}</a>
            <a
              href="https://github.com/deifos/basedsubtitles"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source on GitHub
            </a>
            <a
              href="https://huggingface.co/docs/transformers.js"
              target="_blank"
              rel="noopener noreferrer"
            >
              Transformers.js
            </a>
            <a
              href="https://github.com/Vanilagy/mediabunny"
              target="_blank"
              rel="noopener noreferrer"
            >
              MediaBunny
            </a>
            <a
              href="https://www.buymeacoffee.com/vladships"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy me a coffee
            </a>
            <a
              href="https://getbasedapps.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              More from getbasedapps
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
