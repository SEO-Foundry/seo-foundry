"use client";

import { useCallback, useMemo, useState } from "react";
import SidebarOptions, { type OptionSelections } from "@/app/_components/SidebarOptions";
import UploadArea from "@/app/_components/UploadArea";
import ResultGrid, { type VariantItem } from "@/app/_components/ResultGrid";


const DEFAULT_SELECTIONS: OptionSelections = {
  sizes: ["1:1", "4:5", "9:16"],
  styles: ["Vibrant", "Muted", "Mono"],
  formats: ["PNG"],
  padding: true,
  border: false,
};

const SIZE_TO_RATIO: Record<OptionSelections["sizes"][number], number> = {
  "1:1": 1 / 1,
  "4:5": 4 / 5, // width / height
  "9:16": 9 / 16,
};

const FORMAT_TO_MIME: Record<OptionSelections["formats"][number], string> = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  WEBP: "image/webp",
};

export default function Page() {
  const [selections, setSelections] = useState<OptionSelections>(DEFAULT_SELECTIONS);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>("image");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<VariantItem[]>([]);

  const canGenerate = useMemo(() => {
    return !!sourceUrl && selections.sizes.length && selections.styles.length && selections.formats.length;
  }, [sourceUrl, selections]);

  const onUpload = useCallback((file: File, url: string) => {
    setSourceUrl(url);
    setSourceName(file.name?.replace(/\.[a-zA-Z0-9]+$/, "") || "image");
    setVariants([]);
  }, []);

  const onClearUpload = useCallback(() => {
    setSourceUrl(null);
    setVariants([]);
  }, []);

  const onClearResults = useCallback(() => {
    setVariants([]);
  }, []);

  const generate = useCallback(async () => {
    if (!sourceUrl) return;
    setGenerating(true);

    try {
      const img = await loadImage(sourceUrl);

      // Base render width to keep file sizes sane for a mock. Height derived by ratio.
      const BASE_WIDTH = 896;

      const newVariants: VariantItem[] = [];

      for (const size of selections.sizes) {
        const ratio = SIZE_TO_RATIO[size];
        const width = BASE_WIDTH;
        const height = Math.round(width / ratio);

        for (const style of selections.styles) {
          for (const format of selections.formats) {
            const url = await renderVariant({
              img,
              width,
              height,
              style,
              padding: selections.padding,
              border: selections.border,
              mime: FORMAT_TO_MIME[format],
            });

            const suffixSize = size.replace(":", "x");
            const suffixStyle = style.toLowerCase();
            const ext = format.toLowerCase();
            const filename = `${sourceName}_${suffixSize}_${suffixStyle}.${ext}`;

            newVariants.push({
              id: `${size}-${style}-${format}-${Math.random().toString(36).slice(2, 8)}`,
              url,
              filename,
              meta: { size, style, format },
            });
          }
        }
      }

      setVariants(newVariants);
    } finally {
      setGenerating(false);
    }
  }, [sourceUrl, selections, sourceName]);

  const onDownloadOne = useCallback((v: VariantItem) => {
    triggerDownload(v.url, v.filename);
  }, []);

  const onDownloadAll = useCallback(async () => {
    // Sequential downloads (simple mock without zipping)
    for (const v of variants) {
      // Small delay helps some browsers accept multiple downloads
      await delay(80);
      triggerDownload(v.url, v.filename);
    }
  }, [variants]);

  return (
    <main className="min-h-screen bg-[radial-gradient(1600px_circle_at_0%_-10%,#4f46e5_0%,rgba(79,70,229,0.12)_35%,transparent_60%),radial-gradient(1400px_circle_at_120%_110%,#059669_0%,rgba(5,150,105,0.12)_30%,transparent_60%),linear-gradient(to_bottom,#0b0b13,#0b0b13)] text-white">
      <div className="mx-auto max-w-screen-2xl px-5 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              SEO <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">Foundry</span>
            </h1>
            <p className="text-sm text-white/70">
              Upload an image, choose options, and generate beautiful variants optimized for your needs.
            </p>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
              Tailwind 4.1
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
              Next.js App Router
            </span>
          </div>
        </header>

        {/* Shell */}
        <div className="grid grid-cols-12 gap-5">
          {/* Sidebar */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3">
            <SidebarOptions value={selections} onChange={setSelections} />
          </div>

          {/* Canvas */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur">
              {/* Upload */}
              <UploadArea previewUrl={sourceUrl ?? null} onUpload={onUpload} onClear={onClearUpload} />

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canGenerate || generating}
                    onClick={generate}
                    className={[
                      "rounded-md px-4 py-2 text-sm font-medium transition",
                      canGenerate && !generating
                        ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-white/50",
                    ].join(" ")}
                  >
                    {generating ? "Generating..." : "Generate"}
                  </button>

                  <button
                    type="button"
                    disabled={!variants.length}
                    onClick={onDownloadAll}
                    className={[
                      "rounded-md px-3 py-2 text-xs font-medium transition",
                      variants.length
                        ? "border border-white/10 bg-white/10 text-white/85 hover:bg-white/20"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-white/50",
                    ].join(" ")}
                  >
                    Download All
                  </button>
                </div>

                <div className="text-xs text-white/60">
                  {variants.length ? `${variants.length} variants ready` : "No variants yet"}
                </div>
              </div>

              {/* Results */}
              <div className="mt-4">
                <ResultGrid
                  variants={variants}
                  onDownloadOne={onDownloadOne}
                  onDownloadAll={onDownloadAll}
                  onClearResults={onClearResults}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Utilities
 */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderVariant(params: {
  img: HTMLImageElement;
  width: number;
  height: number;
  style: OptionSelections["styles"][number];
  padding: boolean;
  border: boolean;
  mime: string;
}): Promise<string> {
  const { img, width, height, style, padding, border, mime } = params;

  // Canvas and context
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // background
  ctx.fillStyle = "#0b0b13";
  ctx.fillRect(0, 0, width, height);

  // compute content box (padding as %)
  const pad = padding ? Math.round(Math.min(width, height) * 0.06) : 0;
  const contentX = pad;
  const contentY = pad;
  const contentW = width - pad * 2;
  const contentH = height - pad * 2;

  // Style filter
  switch (style) {
    case "Vibrant":
      ctx.filter = "saturate(1.3) contrast(1.1) brightness(1.05)";
      break;
    case "Muted":
      ctx.filter = "saturate(0.8) brightness(0.95) contrast(0.98)";
      break;
    case "Mono":
      ctx.filter = "grayscale(1) contrast(1.1) brightness(1)";
      break;
  }

  // draw image fitted into content box preserving aspect ratio, center crop if needed
  drawFitted(ctx, img, contentX, contentY, contentW, contentH);

  // Reset filter for overlays
  ctx.filter = "none";

  // Subtle overlay gradient for style flavor
  const grad = ctx.createLinearGradient(0, 0, width, height);
  if (style === "Vibrant") {
    grad.addColorStop(0, "rgba(79,70,229,0.14)");
    grad.addColorStop(1, "rgba(16,185,129,0.12)");
  } else if (style === "Muted") {
    grad.addColorStop(0, "rgba(148,163,184,0.10)");
    grad.addColorStop(1, "rgba(51,65,85,0.10)");
  } else {
    grad.addColorStop(0, "rgba(255,255,255,0.04)");
    grad.addColorStop(1, "rgba(0,0,0,0.12)");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(contentX, contentY, contentW, contentH);

  // Border
  if (border) {
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.006));
    ctx.strokeRect(contentX + ctx.lineWidth / 2, contentY + ctx.lineWidth / 2, contentW - ctx.lineWidth, contentH - ctx.lineWidth);
  }

  // Export
  const quality = mime === "image/jpeg" ? 0.92 : 0.95;
  return canvas.toDataURL(mime, quality);
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
) {
  const sRatio = img.width / img.height;
  const dRatio = dWidth / dHeight;

  let sx = 0;
  let sy = 0;
  let sWidth = img.width;
  let sHeight = img.height;

  if (sRatio > dRatio) {
    // Source is wider: crop horizontally
    sWidth = img.height * dRatio;
    sx = (img.width - sWidth) / 2;
  } else if (sRatio < dRatio) {
    // Source is taller: crop vertically
    sHeight = img.width / dRatio;
    sy = (img.height - sHeight) / 2;
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}
