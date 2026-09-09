"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  LanguageSelector,
  type LanguageCode,
} from "@/components/language-selector";
import {
  Check,
  Globe2,
  Languages,
  LockKeyhole,
  Video,
  Loader2,
  Zap,
} from "lucide-react";
import type { ModelSize } from "@/hooks/useTranscription";
import panelStyles from "@/components/editor-panels.module.css";

interface LanguageSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (language: LanguageCode, modelSize: ModelSize) => void;
  defaultLanguage?: LanguageCode;
  defaultModelSize?: ModelSize;
}

const MODEL_SIZE_OPTIONS: {
  value: ModelSize;
  label: string;
  description: string;
}[] = [
  {
    value: "tiny",
    label: "Tiny (~75MB)",
    description: "Fastest, lower accuracy",
  },
  {
    value: "base",
    label: "Base (~150MB)",
    description: "Balanced speed & accuracy",
  },
  {
    value: "small",
    label: "Small (~500MB)",
    description: "Most accurate, slower",
  },
];

export function LanguageSelectionModal({
  open,
  onClose,
  onConfirm,
  defaultLanguage = "en",
  defaultModelSize = "base",
}: LanguageSelectionModalProps) {
  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguageCode>(defaultLanguage);
  const [selectedModelSize, setSelectedModelSize] =
    useState<ModelSize>(defaultModelSize);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = () => {
    setIsProcessing(true);
    onConfirm(selectedLanguage, selectedModelSize);
    // Modal will auto-close when transcription status changes
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className={panelStyles.languageModal}>
        <DialogHeader>
          <div className={panelStyles.languageIcon}>
            <Globe2 size={30} aria-hidden="true" />
          </div>
          <DialogTitle className={panelStyles.languageTitle}>
            Select video language
          </DialogTitle>
          <DialogDescription className={panelStyles.languageDescription}>
            Choose the language spoken in your video for accurate transcription.
          </DialogDescription>
        </DialogHeader>
        <div className={panelStyles.languageForm}>
          <LanguageSelector
            language={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
            disabled={isProcessing}
          />

          <div>
            <div className={panelStyles.modelHeading}>
              <p id="model-size-label" className="text-sm font-semibold">
                Model size
              </p>
              <span className={panelStyles.localPill}>
                <Zap aria-hidden="true" /> Runs in your browser
              </span>
            </div>
            <div
              className={panelStyles.modelOptions}
              role="group"
              aria-labelledby="model-size-label"
            >
              {MODEL_SIZE_OPTIONS.map((option) => {
                const isActive = selectedModelSize === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    data-model={option.value}
                    disabled={isProcessing}
                    onClick={() => setSelectedModelSize(option.value)}
                    className={panelStyles.modelCard}
                  >
                    <span>
                      <Zap size={22} fill="currentColor" aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    {isActive ? (
                      <Check
                        size={20}
                        className={panelStyles.modelCheck}
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={panelStyles.languageNote}>
            <Languages aria-hidden="true" />
            <div>
              <strong>Use the spoken language</strong>
              <p>
                Select the language you hear in the video. This helps the speech
                model write the correct words and times.
              </p>
              <p className="mt-2">
                The model downloads once. Your video stays on your device.
              </p>
            </div>
          </div>
          <div className={panelStyles.languageActions}>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  Transcribe video
                </>
              )}
            </Button>
          </div>
          <p className={panelStyles.languagePrivacy}>
            <LockKeyhole size={13} aria-hidden="true" /> Your video stays on
            your device. All processing is local.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
