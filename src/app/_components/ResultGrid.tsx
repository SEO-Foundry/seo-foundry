"use client";

import { useState } from "react";
import Image from "next/image";

export type VariantItem = {
  id: string;
  url: string;
  filename: string;
  // Enhanced data from server
  category?: string;
  width?: number;
  height?: number;
  bytes?: number;
  // Back-compat meta summary used by older UI
  meta: {
    size: string;
    style: string;
    format: string;
  };
};

type Props = {
  variants: VariantItem[];
  onDownloadOne: (v: VariantItem) => void;
  onDownloadAll: () => void;
  onClearResults?: () => void;
};

const CATEGORY_ORDER = ["favicon", "pwa", "social", "web", "seo", "transparent", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  favicon: "Favicon",
  pwa: "PWA",
  social: "Social",
  web: "Web",
  seo: "SEO",
  transparent: "Transparent",
  other: "Other",
};

function formatBytes(n?: number): string {
  if (!n || n <= 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResultGrid({
  variants,
  onDownloadOne,
  onDownloadAll,
  onClearResults,
}: Props) {
  const [active, setActive] = useState<VariantItem | null>(null);

  if (!variants?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
        Generated variants will appear here after you upload an image and click Generate.
      </div>
    );
  }

  // Group variants by category
  const buckets = variants.reduce((acc, v) => {
    const key = (v.category ?? v.meta?.style ?? "other").toLowerCase();
    (acc[key] ??= []).push(v);
    return acc;
  }, {} as Record<string, VariantItem[]>);

  const orderedGroups: Array<{ key: string; label: string; items: VariantItem[] }> = [];
  for (const k of CATEGORY_ORDER) {
    const items = buckets[k];
    if (items?.length) {
      orderedGroups.push({ key: k, label: CATEGORY_LABEL[k] ?? k, items });
    }
  }
  // Append any unexpected categories at the end
  const remaining = Object.keys(buckets).filter(
    (k) => !CATEGORY_ORDER.includes(k as (typeof CATEGORY_ORDER)[number]),
  );
  for (const k of remaining) {
    orderedGroups.push({ key: k, label: CATEGORY_LABEL[k] ?? k, items: buckets[k]! });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/90">Generated Variants</h3>
          <p className="text-xs text-white/60">{variants.length} images</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadAll}
            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-400/15"
          >
            Download All
          </button>
          {onClearResults ? (
            <button
              onClick={onClearResults}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-6">
        {orderedGroups.map((group) => (
          <div key={group.key}>
            <div className="mb-2 flex items-center justify-between">
              <h4
                className="text-xs font-semibold uppercase tracking-wide text-white/60"
                title={`Category: ${group.label}`}
              >
                {group.label} ({group.items.length})
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {group.items.map((v) => {
                const resolution =
                  v.width && v.height ? `${v.width}x${v.height}` : v.meta?.size || "";
                const sizeStr = formatBytes(v.bytes);
                const tooltip = `${v.filename}\n${group.label} • ${resolution} • ${sizeStr}`;
                return (
                  <figure
                    key={v.id}
                    className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5"
                    title={tooltip}
                  >
                    <button
                      type="button"
                      className="relative h-48 w-full text-left"
                      onClick={() => setActive(v)}
                    >
                      <Image
                        src={v.url}
                        alt={v.filename}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
                        className="object-cover transition will-change-transform group-hover:scale-[1.02]"
                        unoptimized
                        priority={false}
                      />
                    </button>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_0%_0%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(600px_circle_at_100%_100%,rgba(16,185,129,0.08),transparent_50%)]" />
                    <figcaption className="flex items-center justify-between gap-2 border-t border-white/10 bg-gradient-to-b from-white/0 to-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-white/80">{v.filename}</p>
                        <p className="truncate text-[10px] text-white/50">
                          {group.label}
                          {resolution ? ` • ${resolution}` : ""} • {sizeStr}
                        </p>
                      </div>
                      <button
                        onClick={() => onDownloadOne(v)}
                        className="shrink-0 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/85 hover:bg-white/20"
                        title="Download this asset"
                      >
                        Download
                      </button>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActive(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl rounded-xl border border-white/10 bg-[#0b0b13] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm text-white/90">{active.filename}</p>
                <p className="truncate text-xs text-white/60">
                  {(active.category ?? active.meta?.style) || ""} •{" "}
                  {active.width && active.height ? `${active.width}x${active.height}` : active.meta?.size}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDownloadOne(active)}
                  className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white/85 hover:bg-white/20"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="relative mx-auto aspect-[16/9] w-full max-w-4xl">
              <Image
                src={active.url}
                alt={active.filename}
                fill
                sizes="100vw"
                className="object-contain"
                unoptimized
                priority
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}