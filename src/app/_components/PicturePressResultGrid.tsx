"use client";

import React, { useState } from "react";
import Image from "next/image";

export type ConvertedImageItem = {
  id: string;
  originalName: string;
  convertedName: string;
  originalUrl: string;
  convertedUrl: string;
  originalSize: number;
  convertedSize: number;
  format: string;
  width?: number;
  height?: number;
};

type Props = {
  convertedImages: ConvertedImageItem[];
  onDownloadOne: (item: ConvertedImageItem) => void;
  onDownloadAll: () => void;
  onClearResults?: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function calculateSavings(originalSize: number, convertedSize: number): {
  savings: number;
  percentage: number;
  isReduction: boolean;
} {
  const savings = originalSize - convertedSize;
  const percentage = originalSize > 0 ? (savings / originalSize) * 100 : 0;
  return {
    savings: Math.abs(savings),
    percentage: Math.abs(percentage),
    isReduction: savings > 0,
  };
}

export default function PicturePressResultGrid({
  convertedImages,
  onDownloadOne,
  onDownloadAll,
  onClearResults,
}: Props) {
  const [activeImage, setActiveImage] = useState<ConvertedImageItem | null>(null);

  if (!convertedImages?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
        Converted images will appear here after you upload images and convert them.
      </div>
    );
  }

  // Calculate total statistics
  const totalOriginalSize = convertedImages.reduce((sum, img) => sum + img.originalSize, 0);
  const totalConvertedSize = convertedImages.reduce((sum, img) => sum + img.convertedSize, 0);
  const totalSavings = calculateSavings(totalOriginalSize, totalConvertedSize);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/90">
            Converted Images
          </h3>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <span>{convertedImages.length} images</span>
            <span>
              {formatBytes(totalOriginalSize)} → {formatBytes(totalConvertedSize)}
            </span>
            <span className={totalSavings.isReduction ? "text-emerald-400" : "text-amber-400"}>
              {totalSavings.isReduction ? "↓" : "↑"} {formatBytes(totalSavings.savings)} 
              ({totalSavings.percentage.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadAll}
            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-400/15"
          >
            Download All
          </button>
          {onClearResults && (
            <button
              onClick={onClearResults}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {convertedImages.map((item) => {
          const savings = calculateSavings(item.originalSize, item.convertedSize);
          const resolution = item.width && item.height ? `${item.width}×${item.height}` : "";
          
          return (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5"
            >
              {/* Before/After Comparison */}
              <div className="relative h-48">
                <div className="absolute inset-0 grid grid-cols-2 gap-px">
                  {/* Original Image */}
                  <div className="relative overflow-hidden">
                    <button
                      type="button"
                      className="relative h-full w-full"
                      onClick={() => setActiveImage(item)}
                    >
                      <Image
                        src={item.originalUrl}
                        alt={`Original: ${item.originalName}`}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
                        className="object-cover transition will-change-transform group-hover:scale-[1.02]"
                        unoptimized
                      />
                      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                        Original
                      </div>
                    </button>
                  </div>
                  
                  {/* Converted Image */}
                  <div className="relative overflow-hidden">
                    <button
                      type="button"
                      className="relative h-full w-full"
                      onClick={() => setActiveImage(item)}
                    >
                      <Image
                        src={item.convertedUrl}
                        alt={`Converted: ${item.convertedName}`}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
                        className="object-cover transition will-change-transform group-hover:scale-[1.02]"
                        unoptimized
                      />
                      <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                        {item.format.toUpperCase()}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Image Information */}
              <div className="border-t border-white/10 bg-gradient-to-b from-white/0 to-white/5 p-3">
                <div className="mb-2">
                  <p className="truncate text-xs font-medium text-white/90">
                    {item.convertedName}
                  </p>
                  {resolution && (
                    <p className="text-[10px] text-white/60">{resolution}</p>
                  )}
                </div>

                {/* Size Comparison */}
                <div className="mb-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/60">Original:</span>
                    <span className="text-white/80">{formatBytes(item.originalSize)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/60">Converted:</span>
                    <span className="text-white/80">{formatBytes(item.convertedSize)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-medium">
                    <span className="text-white/60">
                      {savings.isReduction ? "Saved:" : "Increased:"}
                    </span>
                    <span className={savings.isReduction ? "text-emerald-400" : "text-amber-400"}>
                      {savings.isReduction ? "↓" : "↑"} {formatBytes(savings.savings)} 
                      ({savings.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Download Button */}
                <button
                  onClick={() => onDownloadOne(item)}
                  className="w-full rounded-md border border-white/10 bg-white/10 py-1.5 text-xs font-medium text-white/85 hover:bg-white/20"
                >
                  Download
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActiveImage(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-6xl rounded-xl border border-white/10 bg-[#0b0b13] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/90">
                  {activeImage.convertedName}
                </p>
                <div className="flex items-center gap-4 text-xs text-white/60">
                  <span>{activeImage.format.toUpperCase()}</span>
                  {activeImage.width && activeImage.height && (
                    <span>{activeImage.width}×{activeImage.height}</span>
                  )}
                  <span>
                    {formatBytes(activeImage.originalSize)} → {formatBytes(activeImage.convertedSize)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDownloadOne(activeImage)}
                  className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-400/15"
                >
                  Download
                </button>
                <button
                  onClick={() => setActiveImage(null)}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Before/After Comparison in Modal */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Original Image */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-white/80">Original</h4>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10">
                  <Image
                    src={activeImage.originalUrl}
                    alt={`Original: ${activeImage.originalName}`}
                    fill
                    sizes="50vw"
                    className="object-contain"
                    unoptimized
                    priority
                  />
                </div>
                <div className="text-xs text-white/60">
                  <p>{activeImage.originalName}</p>
                  <p>{formatBytes(activeImage.originalSize)}</p>
                </div>
              </div>

              {/* Converted Image */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-white/80">
                  Converted ({activeImage.format.toUpperCase()})
                </h4>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10">
                  <Image
                    src={activeImage.convertedUrl}
                    alt={`Converted: ${activeImage.convertedName}`}
                    fill
                    sizes="50vw"
                    className="object-contain"
                    unoptimized
                    priority
                  />
                </div>
                <div className="text-xs text-white/60">
                  <p>{activeImage.convertedName}</p>
                  <p>{formatBytes(activeImage.convertedSize)}</p>
                  {(() => {
                    const savings = calculateSavings(activeImage.originalSize, activeImage.convertedSize);
                    return (
                      <p className={savings.isReduction ? "text-emerald-400" : "text-amber-400"}>
                        {savings.isReduction ? "↓" : "↑"} {formatBytes(savings.savings)} 
                        ({savings.percentage.toFixed(1)}%)
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}