"use client";

export type VariantItem = {
  id: string;
  url: string;
  filename: string;
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

export default function ResultGrid({
  variants,
  onDownloadOne,
  onDownloadAll,
  onClearResults,
}: Props) {
  if (!variants?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
        Generated variants will appear here after you upload an image and click Generate.
      </div>
    );
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {variants.map((v) => (
          <figure
            key={v.id}
            className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5"
          >
            <img
              src={v.url}
              alt={v.filename}
              className="h-48 w-full object-cover transition will-change-transform group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_0%_0%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(600px_circle_at_100%_100%,rgba(16,185,129,0.08),transparent_50%)]" />
            <figcaption className="flex items-center justify-between gap-2 border-t border-white/10 bg-gradient-to-b from-white/0 to-white/5 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] text-white/80">{v.filename}</p>
                {v.meta ? (
                  <p className="truncate text-[10px] text-white/50">
                    {v.meta.size} • {v.meta.style} • {v.meta.format}
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => onDownloadOne(v)}
                className="shrink-0 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/85 hover:bg-white/20"
              >
                Download
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}