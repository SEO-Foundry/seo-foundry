"use client";

import { useCallback } from "react";

export type OptionSelections = {
  sizes: ("1:1" | "4:5" | "9:16")[];
  styles: ("Vibrant" | "Muted" | "Mono")[];
  formats: ("PNG" | "JPEG" | "WEBP")[];
  padding: boolean;
  border: boolean;
};

type Props = {
  value: OptionSelections;
  onChange: (next: OptionSelections) => void;
};

const SIZE_OPTIONS: Array<OptionSelections["sizes"][number]> = ["1:1", "4:5", "9:16"];
const STYLE_OPTIONS: Array<OptionSelections["styles"][number]> = ["Vibrant", "Muted", "Mono"];
const FORMAT_OPTIONS: Array<OptionSelections["formats"][number]> = ["PNG", "JPEG", "WEBP"];

export default function SidebarOptions({ value, onChange }: Props) {
  const toggle = useCallback(
    <T extends string>(key: keyof OptionSelections, item: T) => {
      const current = value[key];
      if (!Array.isArray(current)) return;
      const exists = (current as unknown as T[]).includes(item);
      const nextArr = exists
        ? (current as unknown as T[]).filter((i) => i !== item)
        : [...(current as unknown as T[]), item];
      onChange({ ...value, [key]: nextArr } as OptionSelections);
    },
    [value, onChange],
  );

  const toggleBool = useCallback(
    (key: keyof OptionSelections) => {
      const current = value[key] as unknown as boolean;
      onChange({ ...value, [key]: !current });
    },
    [value, onChange],
  );

  const reset = () => {
    onChange({
      sizes: ["1:1", "4:5", "9:16"],
      styles: ["Vibrant", "Muted", "Mono"],
      formats: ["PNG"],
      padding: true,
      border: false,
    });
  };

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

      <Section title="Output Sizes">
        <div className="grid grid-cols-2 gap-2">
          {SIZE_OPTIONS.map((opt) => (
            <CheckPill
              key={opt}
              label={opt}
              checked={value.sizes.includes(opt)}
              onChange={() => toggle("sizes", opt)}
            />
          ))}
        </div>
      </Section>

      <Section title="Style">
        <div className="grid grid-cols-3 gap-2">
          {STYLE_OPTIONS.map((opt) => (
            <CheckPill
              key={opt}
              label={opt}
              checked={value.styles.includes(opt)}
              onChange={() => toggle("styles", opt)}
            />
          ))}
        </div>
      </Section>

      <Section title="Format">
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => (
            <CheckPill
              key={opt}
              label={opt}
              checked={value.formats.includes(opt)}
              onChange={() => toggle("formats", opt)}
            />
          ))}
        </div>
      </Section>

      <Section title="Presentation">
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Padding" checked={value.padding} onChange={() => toggleBool("padding")} />
          <Toggle label="Border" checked={value.border} onChange={() => toggleBool("border")} />
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