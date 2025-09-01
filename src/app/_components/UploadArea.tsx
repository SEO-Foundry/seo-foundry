"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

type Props = {
  previewUrl?: string | null;
  onUpload: (file: File, dataUrl: string) => void;
  onClear?: () => void;
};

export default function UploadArea({ previewUrl, onUpload, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files.item(0);
      if (!file) return;
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onUpload(file, result);
      };
      reader.readAsDataURL(file);
    },
    [onUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      void handleFiles(e.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur">
      <div
        className={[
          "group relative flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed p-6 transition",
          dragOver
            ? "border-emerald-300/50 bg-emerald-400/5"
            : "border-white/15 bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10",
        ].join(" ")}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {!previewUrl ? (
          <>
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[radial-gradient(800px_circle_at_0%_0%,rgba(99,102,241,0.12),transparent_55%),radial-gradient(800px_circle_at_100%_100%,rgba(16,185,129,0.12),transparent_55%)]" />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mb-3 h-10 w-10 text-white/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.25"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5V8.25A2.25 2.25 0 0 1 5.25 6h6.879a2.25 2.25 0 0 1 1.59.659l3.621 3.621a2.25 2.25 0 0 1 .66 1.591V16.5A2.25 2.25 0 0 1 15.75 18.75H5.25A2.25 2.25 0 0 1 3 16.5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5l5.25-5.25L15 18"
              />
            </svg>
            <p className="mb-2 text-sm text-white/80">
              Drag & drop an image here
            </p>
            <p className="mb-4 text-xs text-white/60">PNG, JPG, or WebP</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          </>
        ) : (
          <div className="relative h-full w-full">
            <div className="relative h-full w-full overflow-hidden rounded-lg">
              <Image
                src={previewUrl}
                alt="Preview"
                fill
                sizes="(max-width: 768px) 100vw, 75vw"
                className="object-contain"
                unoptimized
                priority={false}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/10 ring-inset" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-white/60">
          {previewUrl
            ? "Image ready. Configure options and generate variants."
            : "No file selected."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20"
            onClick={() => inputRef.current?.click()}
          >
            {previewUrl ? "Replace image" : "Upload image"}
          </button>
          {previewUrl && onClear ? (
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
