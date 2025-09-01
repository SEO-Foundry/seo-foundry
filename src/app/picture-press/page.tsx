"use client";

import React, { useCallback, useMemo, useState } from "react";
import PicturePressOptions, {
  type PicturePressSelections,
} from "@/app/_components/PicturePressOptions";
import UploadArea, { type UploadedFile } from "@/app/_components/UploadArea";
import PicturePressResultGrid, {
  type ConvertedImageItem,
} from "@/app/_components/PicturePressResultGrid";
import { api } from "@/trpc/react";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type ConvertRes = inferRouterOutputs<AppRouter>["picturePress"]["convertImages"];
type UploadRes = inferRouterOutputs<AppRouter>["picturePress"]["uploadImages"];

const DEFAULT_SELECTIONS: PicturePressSelections = {
  outputFormat: "png",
  quality: 90,
  namingConvention: "keep-original",
  customPattern: "",
  prefix: "",
  suffix: "",
};

export default function PicturePressPage() {
  const [selections, setSelections] = useState<PicturePressSelections>(DEFAULT_SELECTIONS);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertedImages, setConvertedImages] = useState<ConvertedImageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setUploadedFilesMeta] = useState<UploadRes["uploadedFiles"]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // tRPC mutations
  const uploadImages = api.picturePress.uploadImages.useMutation();
  const cleanupSession = api.picturePress.cleanupSession.useMutation();
  const convertImagesMutation = api.picturePress.convertImages.useMutation();
  const zipImagesMutation = api.picturePress.zipConvertedImages.useMutation();

  // Progress polling for conversion
  const sid = sessionId ?? "00000000-0000-0000-0000-000000000000";
  const progressQuery = api.picturePress.getConversionProgress.useQuery(
    { sessionId: sid },
    {
      enabled: converting && !!sessionId,
      refetchInterval: converting ? 600 : false,
    },
  );
  
  const progressData = progressQuery.data;
  const progressTotal = progressData?.total ?? 100;
  const progressCurrent = progressData?.current ?? 0;
  const progressPct =
    progressTotal > 0
      ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100))
      : 0;
  const progressOp = progressData?.currentOperation ?? "Working...";
  const currentFile = progressData?.currentFile;

  const canConvert = useMemo(() => {
    return !!sessionId && uploadedFiles.length > 0;
  }, [sessionId, uploadedFiles.length]);

  const onMultiUpload = useCallback(
    async (files: UploadedFile[]) => {
      try {
        setErrorMsg(null);
        setUploadProgress({});
        
        // Set initial progress for all files
        const initialProgress: Record<string, number> = {};
        files.forEach(file => {
          initialProgress[file.id] = 0;
        });
        setUploadProgress(initialProgress);

        // Prepare files for upload
        const filesToUpload = files.map(file => ({
          fileName: file.name,
          fileData: file.dataUrl.split(",")[1] ?? "", // Remove data URL prefix
          mimeType: file.type ?? "image/png",
        }));

        // Simulate upload progress (since we don't have real progress from tRPC)
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const updated = { ...prev };
            
            files.forEach(file => {
              const currentProgress = updated[file.id] ?? 0;
              if (currentProgress < 90) {
                updated[file.id] = Math.min(90, currentProgress + Math.random() * 20);
              }
            });
            
            return updated;
          });
        }, 200);

        const res = await uploadImages.mutateAsync({
          files: filesToUpload,
          sessionId: sessionId ?? undefined,
        });

        // Complete progress
        clearInterval(progressInterval);
        const completeProgress: Record<string, number> = {};
        files.forEach(file => {
          completeProgress[file.id] = 100;
        });
        setUploadProgress(completeProgress);

        // Update state
        setSessionId(res.sessionId);
        setUploadedFilesMeta(res.uploadedFiles);
        setUploadedFiles(prev => [...prev, ...files]);
        setConvertedImages([]); // Clear previous results
        
        // Clear progress after a short delay
        setTimeout(() => {
          setUploadProgress({});
        }, 1000);

      } catch (err) {
        console.error("[picture-press] upload failed", err);
        setErrorMsg(
          readableError(err, "Upload failed. Please check file types and sizes."),
        );
        setUploadProgress({});
      }
    },
    [uploadImages, sessionId],
  );

  const onRemoveFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    setUploadProgress(prev => {
      const updated = { ...prev };
      delete updated[fileId];
      return updated;
    });
    
    // If no files left, clear session and results
    if (uploadedFiles.length <= 1) {
      setSessionId(null);
      setUploadedFilesMeta([]);
      setConvertedImages([]);
    }
  }, [uploadedFiles.length]);

  const onClearUpload = useCallback(async () => {
    try {
      if (sessionId) {
        await cleanupSession.mutateAsync({ sessionId });
      }
    } catch (err) {
      console.warn("[picture-press] cleanup warning", err);
    } finally {
      setUploadedFiles([]);
      setSessionId(null);
      setUploadedFilesMeta([]);
      setConvertedImages([]);
      setErrorMsg(null);
      setInfoMsg(null);
      setUploadProgress({});
    }
  }, [sessionId, cleanupSession]);

  const onClearResults = useCallback(() => {
    setConvertedImages([]);
  }, []);

  const convert = useCallback(async () => {
    if (!sessionId || uploadedFiles.length === 0) return;
    
    setConverting(true);
    try {
      setErrorMsg(null);
      setInfoMsg(null);
      
      const res: ConvertRes = await convertImagesMutation.mutateAsync({
        sessionId,
        options: {
          outputFormat: selections.outputFormat,
          quality: selections.quality,
          namingConvention: selections.namingConvention,
          customPattern: selections.customPattern ?? undefined,
          prefix: selections.prefix ?? undefined,
          suffix: selections.suffix ?? undefined,
        },
      });

      // Transform results to ConvertedImageItem format
      const newConvertedImages: ConvertedImageItem[] = res.convertedImages.map(
        (img) => ({
          id: `${img.originalName}-${img.convertedName}`,
          originalName: img.originalName,
          convertedName: img.convertedName,
          originalUrl: img.previewUrl, // Use preview URL for original (we don't have separate original URLs)
          convertedUrl: img.downloadUrl,
          originalSize: img.originalSize,
          convertedSize: img.convertedSize,
          format: selections.outputFormat,
          width: img.width,
          height: img.height,
        }),
      );

      setConvertedImages(newConvertedImages);

      // Show info about conversion results
      if (res.failureCount > 0) {
        const failureMsg = `Conversion completed with ${res.failureCount} failure${res.failureCount === 1 ? '' : 's'}. ${res.successCount} image${res.successCount === 1 ? '' : 's'} converted successfully.`;
        setInfoMsg(failureMsg);
      } else {
        const savingsMsg = res.totalSavings > 0 
          ? ` Saved ${formatBytes(res.totalSavings)} (${Math.round((res.totalSavings / res.totalOriginalSize) * 100)}%)`
          : res.totalSavings < 0 
            ? ` Increased by ${formatBytes(-res.totalSavings)}`
            : '';
        setInfoMsg(`Successfully converted ${res.successCount} image${res.successCount === 1 ? '' : 's'}.${savingsMsg}`);
      }

    } catch (err) {
      console.error("[picture-press] conversion failed", err);
      setErrorMsg(readableError(err, "Conversion failed. Please try again."));
    } finally {
      setConverting(false);
    }
  }, [
    sessionId,
    uploadedFiles.length,
    convertImagesMutation,
    selections,
  ]);

  const onDownloadOne = useCallback((item: ConvertedImageItem) => {
    triggerDownload(item.convertedUrl, item.convertedName);
  }, []);

  const onDownloadAll = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      setErrorMsg(null);
      const res = await zipImagesMutation.mutateAsync({ sessionId });
      if (res.downloadUrl) {
        triggerDownload(res.downloadUrl, res.fileName);
      }
    } catch (err) {
      console.error("[picture-press] zip download failed", err);
      setErrorMsg(
        readableError(
          err,
          "ZIP creation failed. Falling back to individual downloads.",
        ),
      );
      // Fallback: sequential downloads
      for (const img of convertedImages) {
        await delay(80);
        triggerDownload(img.convertedUrl, img.convertedName);
      }
    }
  }, [sessionId, convertedImages, zipImagesMutation]);

  return (
    <main className="min-h-[calc(100vh-5rem)] text-white">
      <div className="mx-auto max-w-screen-2xl px-5 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              SEO{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                Foundry • Picture Press
              </span>
            </h1>
            <p className="text-sm text-white/70">
              Upload multiple images and convert them to different formats with custom naming options.
            </p>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
              Batch Conversion
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
              ImageMagick
            </span>
          </div>
        </header>

        {/* Shell */}
        <div className="grid grid-cols-12 gap-5">
          {/* Sidebar */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3">
            <PicturePressOptions 
              value={selections} 
              onChange={setSelections}
              uploadedFiles={uploadedFiles.map(file => ({ originalName: file.name }))}
            />
          </div>

          {/* Canvas */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur">
              {/* Alerts */}
              {errorMsg ? (
                <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {errorMsg}
                </div>
              ) : null}
              {infoMsg ? (
                <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {infoMsg}
                </div>
              ) : null}

              {/* Upload Area */}
              <UploadArea
                uploadedFiles={uploadedFiles}
                onMultiUpload={onMultiUpload}
                onRemoveFile={onRemoveFile}
                maxFiles={20}
                showProgress={Object.keys(uploadProgress).length > 0}
                uploadProgress={uploadProgress}
              />

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canConvert || converting}
                    onClick={convert}
                    className={[
                      "rounded-md px-4 py-2 text-sm font-medium transition",
                      canConvert && !converting
                        ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-white/50",
                    ].join(" ")}
                  >
                    {converting ? "Converting..." : "Convert Images"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      !convertedImages.length ||
                      converting ||
                      zipImagesMutation.isPending
                    }
                    onClick={onDownloadAll}
                    className={[
                      "rounded-md px-3 py-2 text-xs font-medium transition",
                      convertedImages.length && !converting
                        ? "border border-white/10 bg-white/10 text-white/85 hover:bg-white/20"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-white/50",
                    ].join(" ")}
                  >
                    {zipImagesMutation.isPending
                      ? "Preparing ZIP..."
                      : "Download All"}
                  </button>

                  {uploadedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearUpload}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="min-w-[220px] text-xs">
                  {converting ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-white/70">{progressOp}</span>
                        <span className="text-white/50">{progressPct}%</span>
                      </div>
                      {currentFile && (
                        <div className="text-white/50 truncate">
                          Processing: {currentFile}
                        </div>
                      )}
                      <div className="mt-1 h-1.5 w-56 overflow-hidden rounded bg-white/10">
                        <div
                          className="h-full bg-emerald-400/70 transition-[width] duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-white/60">
                      {uploadedFiles.length > 0
                        ? `${uploadedFiles.length} file${uploadedFiles.length === 1 ? '' : 's'} uploaded`
                        : convertedImages.length > 0
                        ? `${convertedImages.length} image${convertedImages.length === 1 ? '' : 's'} converted`
                        : "No files uploaded"}
                    </span>
                  )}
                </div>
              </div>

              {/* Results */}
              <div className="mt-4">
                <PicturePressResultGrid
                  convertedImages={convertedImages}
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

function readableError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const withMsg = err as { message?: unknown; cause?: unknown; data?: unknown };
    
    // Check for tRPC error with data
    if (withMsg.data && typeof withMsg.data === "object") {
      const tRPCData = withMsg.data as { code?: string; httpStatus?: number };
      if (tRPCData.code === "TOO_MANY_REQUESTS") {
        return "Too many requests. Please wait a moment before trying again.";
      }
      if (tRPCData.code === "CONFLICT") {
        return "Another operation is already in progress. Please wait for it to complete.";
      }
      if (tRPCData.code === "NOT_FOUND") {
        return "Session expired or not found. Please refresh the page and try again.";
      }
    }
    
    if (
      typeof withMsg.message === "string" &&
      withMsg.message.trim().length > 0
    ) {
      const message = withMsg.message;
      
      // Provide user-friendly messages for common errors
      if (message.includes("Network Error") || message.includes("fetch")) {
        return "Network connection error. Please check your internet connection and try again.";
      }
      
      if (message.includes("timeout") || message.includes("Timeout")) {
        return "Request timed out. Please try again with fewer or smaller files.";
      }
      
      if (message.includes("413") || message.includes("Payload Too Large")) {
        return "Files are too large. Please reduce file sizes or upload fewer files at once.";
      }
      
      if (message.includes("500") || message.includes("Internal Server Error")) {
        return "Server error occurred. Please try again later or contact support if the problem persists.";
      }
      
      if (message.includes("MIME") || message.includes("format")) {
        return "One or more files have unsupported formats. Please use JPEG, PNG, GIF, WebP, TIFF, or BMP images.";
      }
      
      // Return the original message if it's already user-friendly
      return message;
    }
    
    const cause = withMsg.cause as { message?: unknown } | undefined;
    if (
      cause &&
      typeof cause.message === "string" &&
      cause.message.trim().length > 0
    ) {
      return cause.message;
    }
  }
  
  return fallback;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}