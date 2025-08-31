"use client";

import { useCallback } from "react";

export type PixelForgeSelections = {
  generationTypes: ("favicon" | "pwa" | "social" | "seo" | "web" | "all")[];
  transparent?: boolean;

  // Advanced metadata (reserved for future use by server)
  appName?: string;
  description?: string;
  themeColor?: string;
  backgroundColor?: string;

  // Output options
  format?: "png" | "jpeg" | "webp";
  quality?: number; // 1-100
  urlPrefix?: string;
};

type Props = {
  value: PixelForgeSelections;
  onChange: (next: PixelForgeSelections) => void;
};

const GENERATION_OPTIONS: Array<PixelForgeSelections["generationTypes"][number]> = [
  "all",
  "favicon",
  "pwa",
  "social",
  "seo",
  "web",
];

export default function SidebarOptions({ value, onChange }: Props) {
  const toggleType = useCallback(
    (item: PixelForgeSelections["generationTypes"][number]) => {
      const current = value.generationTypes ?? [];
      const exists = current.includes(item);
      const nextArr = exists ? current.filter((i) => i !== item) : [...current, item];
      onChange({ ...value, generationTypes: nextArr });
    },
    [value, onChange],
  );

  const toggleBool = useCallback(
    (key: keyof PixelForgeSelections) => {
      const cur = Boolean(value[key]);
      onChange({ ...value, [key]: !cur });
    },
    [value, onChange],
  );

  const setField = useCallback(
    (key: keyof PixelForgeSelections, v: string | number | undefined) => {
      onChange({ ...value, [key]: v } as PixelForgeSelections);
    },
    [value, onChange],
  );

  const reset = () => {
    onChange({
      generationTypes: ["all"],
      transparent: false,
      appName: "",
      description: "",
      themeColor: "",
      backgroundColor: "",
      format: "png",
      quality: 90,
      urlPrefix: "",
    });
  };

  const quality = clampNumber(value.quality ?? 90, 1, 100);

  return (
    <aside className="h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Options</h2>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
        >
          Reset
        </button>
      </div>

      <Section title="Generate">
        <div className="grid grid-cols-3 gap-2">
          {GENERATION_OPTIONS.map((opt) => (
            <CheckPill
              key={opt}
              label={labelFor(opt)}
              checked={(value.generationTypes ?? []).includes(opt)}
              onChange={() => toggleType(opt)}
            />
          ))}
        </div>

        <div className="mt-3 grid gap-2">
          <Toggle label="Transparent (post-process)" checked={Boolean(value.transparent)} onChange={() => toggleBool("transparent")} />
        </div>
      </Section>

      <Section title="Metadata">
        <div className="space-y-2">
          <InputText
            label="App Name"
            placeholder="My App"
            value={value.appName ?? ""}
            onChange={(v) => setField("appName", v)}
          />
          <InputText
            label="Description"
            placeholder="Short description"
            value={value.description ?? ""}
            onChange={(v) => setField("description", v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <InputText
              label="Theme Color"
              placeholder="#0ea5e9"
              value={value.themeColor ?? ""}
              onChange={(v) => setField("themeColor", v)}
            />
            <InputText
              label="Background"
              placeholder="#0b0b13"
              value={value.backgroundColor ?? ""}
              onChange={(v) => setField("backgroundColor", v)}
            />
          </div>
        </div>
      </Section>

      <Section title="Output">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Format"
            value={value.format ?? "png"}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" },
              { value: "webp", label: "WebP" },
            ]}
            onChange={(v) => setField("format", v as PixelForgeSelections["format"])}
          />
          <div>
            <label className="mb-1 block text-[11px] text-white/60">Quality: {quality}</label>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setField("quality", Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
          </div>
        </div>
        <div className="mt-2">
          <InputText
            label="URL Prefix"
            placeholder="/api/pixel-forge/files/:session/generated/"
            value={value.urlPrefix ?? ""}
            onChange={(v) => setField("urlPrefix", v)}
          />
        </div>
      </Section>

      <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(1200px_circle_at_0%_0%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(1200px_circle_at_100%_100%,rgba(16,185,129,0.08),transparent_50%)]" />
    </aside>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-white/60">{props.title}</h3>
      {props.children}
    </div>
  );
}

function CheckPill(props: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onChange}
      className={[
        "w-full rounded-lg px-3 py-2 text-xs font-medium",
        "border transition",
        props.checked
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10",
      ].join(" ")}
      aria-pressed={props.checked}
    >
      {props.label}
    </button>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: () => void }) {
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
      <input type="checkbox" className="sr-only" checked={props.checked} onChange={props.onChange} />
    </label>
  );
}

function InputText(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-white/60">{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/40 outline-none focus:border-emerald-400/40"
      />
    </label>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-white/60">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 outline-none focus:border-emerald-400/40"
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#0b0b13]">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function labelFor(k: PixelForgeSelections["generationTypes"][number]): string {
  switch (k) {
    case "all":
      return "All";
    case "favicon":
      return "Favicon";
    case "pwa":
      return "PWA";
    case "social":
      return "Social";
    case "seo":
      return "SEO";
    case "web":
      return "Web";
    default:
      return k;
  }
}

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}