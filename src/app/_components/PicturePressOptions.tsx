"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";

export type PicturePressSelections = {
  outputFormat: "jpeg" | "png" | "webp" | "gif" | "tiff" | "bmp";
  quality?: number; // 1-100, only for lossy formats
  namingConvention: "keep-original" | "custom-pattern";
  customPattern?: string;
  prefix?: string;
  suffix?: string;
};

type Props = {
  value: PicturePressSelections;
  onChange: (next: PicturePressSelections) => void;
  uploadedFiles?: Array<{ originalName: string }>;
};

const FORMAT_OPTIONS: Array<{
  value: PicturePressSelections["outputFormat"];
  label: string;
  isLossy: boolean;
}> = [
  { value: "jpeg", label: "JPEG", isLossy: true },
  { value: "png", label: "PNG", isLossy: false },
  { value: "webp", label: "WebP", isLossy: true },
  { value: "gif", label: "GIF", isLossy: false },
  { value: "tiff", label: "TIFF", isLossy: false },
  { value: "bmp", label: "BMP", isLossy: false },
];

export default function PicturePressOptions({
  value,
  onChange,
  uploadedFiles = [],
}: Props) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validateOptions = useCallback((options: PicturePressSelections): string[] => {
    const errors: string[] = [];

    // Validate quality for lossy formats only
    if (options.quality !== undefined && ["jpeg", "webp"].includes(options.outputFormat)) {
      if (options.quality < 1 || options.quality > 100) {
        errors.push("Quality must be between 1 and 100");
      }
    }

    // Validate custom naming options
    if (options.namingConvention === "custom-pattern") {
      const hasPattern = options.customPattern && options.customPattern.trim().length > 0;
      const hasPrefix = options.prefix && options.prefix.trim().length > 0;
      const hasSuffix = options.suffix && options.suffix.trim().length > 0;

      if (!hasPattern && !hasPrefix && !hasSuffix) {
        errors.push("Custom naming requires at least one of: pattern, prefix, or suffix");
      }

      // Validate custom pattern
      if (options.customPattern) {
        const pattern = options.customPattern.trim();
        
        if (pattern.length > 200) {
          errors.push("Custom pattern is too long (max 200 characters)");
        }

        const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
        if (invalidChars.test(pattern)) {
          errors.push("Custom pattern contains invalid characters");
        }

        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
        if (reservedNames.test(pattern)) {
          errors.push("Custom pattern uses reserved system names");
        }
      }

      // Validate prefix and suffix
      if (options.prefix && options.prefix.length > 50) {
        errors.push("Prefix is too long (max 50 characters)");
      }
      
      if (options.suffix && options.suffix.length > 50) {
        errors.push("Suffix is too long (max 50 characters)");
      }

      const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
      if (options.prefix && invalidChars.test(options.prefix)) {
        errors.push("Prefix contains invalid characters");
      }
      
      if (options.suffix && invalidChars.test(options.suffix)) {
        errors.push("Suffix contains invalid characters");
      }
    }

    return errors;
  }, []);

  const setField = useCallback(
    (key: keyof PicturePressSelections, v: string | number | undefined) => {
      const newValue = { ...value, [key]: v } as PicturePressSelections;
      
      // Validate the new value
      const errors = validateOptions(newValue);
      setValidationErrors(errors);
      
      onChange(newValue);
    },
    [value, onChange, validateOptions],
  );

  // Validate on mount and when value changes
  useEffect(() => {
    const errors = validateOptions(value);
    setValidationErrors(errors);
  }, [value, validateOptions]);

  const toggleNamingConvention = useCallback(() => {
    const newConvention =
      value.namingConvention === "keep-original"
        ? "custom-pattern"
        : "keep-original";
    onChange({ ...value, namingConvention: newConvention });
  }, [value, onChange]);

  const reset = () => {
    onChange({
      outputFormat: "png",
      quality: 90,
      namingConvention: "keep-original",
      customPattern: "",
      prefix: "",
      suffix: "",
    });
  };

  const selectedFormat = FORMAT_OPTIONS.find(
    (f) => f.value === value.outputFormat,
  );
  const isLossyFormat = selectedFormat?.isLossy ?? false;
  const quality = clampNumber(value.quality ?? 90, 1, 100);

  // Generate preview of naming convention
  const namingPreview = useMemo(() => {
    if (uploadedFiles.length === 0) return "No files uploaded";
    
    const sampleFile = uploadedFiles[0];
    if (!sampleFile) return "No files uploaded";
    
    const baseName = sampleFile.originalName.replace(/\.[^/.]+$/, "");
    const extension = value.outputFormat;
    
    if (value.namingConvention === "keep-original") {
      return `${baseName}.${extension}`;
    }
    
    // Custom pattern preview
    let preview = value.customPattern ?? "{name}";
    preview = preview.replace("{name}", baseName);
    preview = preview.replace("{index}", "1");
    preview = preview.replace("{format}", extension);
    
    // Add prefix/suffix if provided
    if (value.prefix) preview = `${value.prefix}${preview}`;
    if (value.suffix) preview = `${preview}${value.suffix}`;
    
    return `${preview}.${extension}`;
  }, [uploadedFiles, value.outputFormat, value.namingConvention, value.customPattern, value.prefix, value.suffix]);

  return (
    <aside className="h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-white/70 uppercase">
          Conversion Options
        </h2>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
        >
          Reset
        </button>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-300">Configuration Issues</h4>
              <ul className="mt-1 text-xs text-red-200">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Section title="Output Format">
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((format) => (
            <FormatPill
              key={format.value}
              label={format.label}
              isLossy={format.isLossy}
              selected={value.outputFormat === format.value}
              onChange={() => setField("outputFormat", format.value)}
            />
          ))}
        </div>

        <div className="mt-3">
          {/* Reserve space for tooltip to prevent content shift */}
          <div className="h-4 mb-1">
            {!isLossyFormat && (
              <div className="text-[10px] text-white/50 italic">
                Quality setting not available for lossless formats
              </div>
            )}
          </div>
          <label className={[
            "mb-1 block text-[11px]",
            isLossyFormat ? "text-white/60" : "text-white/30"
          ].join(" ")}>
            Quality: {quality}%
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setField("quality", Number(e.target.value))}
            disabled={!isLossyFormat}
            className={[
              "w-full",
              isLossyFormat 
                ? "accent-emerald-400" 
                : "accent-white/20 opacity-40 cursor-not-allowed"
            ].join(" ")}
          />
        </div>
      </Section>

      <Section title="Naming Convention">
        <div className="space-y-3">
          <Toggle
            label="Keep original names"
            checked={value.namingConvention === "keep-original"}
            onChange={toggleNamingConvention}
          />

          {value.namingConvention === "custom-pattern" && (
            <div className="space-y-2">
              <InputText
                label="Custom Pattern"
                placeholder="{name}_{format}"
                value={value.customPattern ?? ""}
                onChange={(v) => setField("customPattern", v)}
                helpText="Use {name}, {index}, {format} as placeholders"
              />
              <div className="grid grid-cols-2 gap-2">
                <InputText
                  label="Prefix"
                  placeholder="converted_"
                  value={value.prefix ?? ""}
                  onChange={(v) => setField("prefix", v)}
                />
                <InputText
                  label="Suffix"
                  placeholder="_optimized"
                  value={value.suffix ?? ""}
                  onChange={(v) => setField("suffix", v)}
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/60 mb-1">Preview:</div>
            <div className="text-xs text-emerald-200 font-mono">
              {namingPreview}
            </div>
          </div>
        </div>
      </Section>

      <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(1200px_circle_at_0%_0%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(1200px_circle_at_100%_100%,rgba(16,185,129,0.08),transparent_50%)]" />
    </aside>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-white/60">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

function FormatPill(props: {
  label: string;
  isLossy: boolean;
  selected: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onChange}
      className={[
        "w-full rounded-lg px-3 py-2 text-xs font-medium relative",
        "border transition",
        props.selected
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10",
      ].join(" ")}
      aria-pressed={props.selected}
    >
      {props.label}
      {props.isLossy && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-400/60" />
      )}
    </button>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
      <span>{props.label}</span>
      <span
        className={[
          "inline-flex h-5 w-10 items-center rounded-full p-0.5 transition",
          props.checked ? "bg-emerald-400/40" : "bg-white/10",
        ].join(" ")}
      >
        <span
          className={[
            "h-4 w-4 rounded-full bg-white transition",
            props.checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={props.checked}
        onChange={props.onChange}
      />
    </label>
  );
}

function InputText(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helpText?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-white/60">
        {props.label}
      </span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 outline-none placeholder:text-white/40 focus:border-emerald-400/40"
      />
      {props.helpText && (
        <span className="mt-1 block text-[10px] text-white/50">
          {props.helpText}
        </span>
      )}
    </label>
  );
}

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}