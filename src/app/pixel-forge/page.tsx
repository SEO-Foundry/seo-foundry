"use client";

import { useCallback, useMemo, useState } from "react";
import SidebarOptions, { type PixelForgeSelections } from "@/app/_components/SidebarOptions";
import UploadArea from "@/app/_components/UploadArea";
import ResultGrid from "@/app/_components/ResultGrid";
import { api } from "@/trpc/react";

type VariantItem = {
  id: string;
  url: string;
  filename: string;
  meta: {
    size: string;
    style: string;
    format: string;
  };
};

type ServerAsset = {
  fileName: string;
  category: string;
  downloadUrl: string;
  previewUrl?: string;
};

const DEFAULT_SELECTIONS: PixelForgeSelections = {
  generationTypes: ["all"],
  transparent: false,
  appName: "",
  description: "",
  themeColor: "",
  backgroundColor: "",
  format: "png",
  quality: 90,
  urlPrefix: "",
};



export default function Page() {
  const [selections, setSelections] = useState<PixelForgeSelections>(DEFAULT_SELECTIONS);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storedPath, setStoredPath] = useState<string | null>(null);

  const uploadImage = api.pixelForge.uploadImage.useMutation();
  const cleanupSession = api.pixelForge.cleanupSession.useMutation();
  const generateAssetsMutation = api.pixelForge.generateAssets.useMutation();

  const canGenerate = useMemo(() => {
    return !!sessionId && !!storedPath;
  }, [sessionId, storedPath]);

  const onUpload = useCallback(async (file: File, dataUrl: string) => {
    try {
      const base64 = dataUrl.split(",")[1] ?? "";
      const res = await uploadImage.mutateAsync({
        fileName: file.name,
        fileData: base64,
        mimeType: file.type || "image/png",
        sessionId: sessionId ?? undefined,
      });
      setSessionId(res.sessionId);
      setStoredPath(res.storedPath);
      setSourceUrl(res.previewUrl);
      setVariants([]);
    } catch (err) {
      console.error("[pixel-forge] upload failed", err);
    }
  }, [uploadImage, sessionId]);

  const onClearUpload = useCallback(async () => {
    try {
      if (sessionId) {
        await cleanupSession.mutateAsync({ sessionId });
      }
    } catch (err) {
      console.warn("[pixel-forge] cleanup warning", err);
    } finally {
      setSourceUrl(null);
      setSessionId(null);
      setStoredPath(null);
      setVariants([]);
    }
  }, [sessionId, cleanupSession]);

  const onClearResults = useCallback(() => {
    setVariants([]);
  }, []);

  const generate = useCallback(async () => {
    if (!sessionId || !storedPath) return;
    setGenerating(true);
    try {
      const res = (await generateAssetsMutation.mutateAsync({
        sessionId,
        imagePath: storedPath,
        options: {
          generationTypes:
            (selections.generationTypes?.length ?? 0) > 0 ? selections.generationTypes : ["all"],
          transparent: Boolean(selections.transparent),
          appName: selections.appName ?? undefined,
          description: selections.description ?? undefined,
          themeColor: selections.themeColor ?? undefined,
          backgroundColor: selections.backgroundColor ?? undefined,
          format: selections.format,
          quality: selections.quality,
          urlPrefix: selections.urlPrefix ?? undefined,
        },
      })) as { assets: ServerAsset[] };

      const newVariants: VariantItem[] = res.assets.map((a: ServerAsset) => {
        const ext = a.fileName.split(".").pop()?.toUpperCase() ?? "PNG";
        const re = /(\d{2,4})x(\d{2,4})/;
        const dimsMatch = re.exec(a.fileName);
        const dimStr = dimsMatch ? `${dimsMatch[1]}x${dimsMatch[2]}` : "";
        return {
          id: `${a.category}-${a.fileName}`,
          url: a.previewUrl ?? a.downloadUrl,
          filename: a.fileName,
          meta: {
            size: dimStr || a.category,
            style: a.category,
            format: ext,
          },
        };
      });
      setVariants(newVariants);
    } catch (err) {
      console.error("[pixel-forge] generation failed", err);
    } finally {
      setGenerating(false);
    }
  }, [
    sessionId,
    storedPath,
    generateAssetsMutation,
    selections.generationTypes,
    selections.transparent,
    selections.appName,
    selections.description,
    selections.themeColor,
    selections.backgroundColor,
    selections.format,
    selections.quality,
    selections.urlPrefix,
  ]);

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
    <main className="min-h-[calc(100vh-5rem)] text-white">
      <div className="mx-auto max-w-screen-2xl px-5 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              SEO <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">Foundry • Pixel Forge</span>
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
