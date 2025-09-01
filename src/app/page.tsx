import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_800px_at_0%_-10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(900px_800px_at_100%_110%,rgba(16,185,129,0.18),transparent_55%)]" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] tracking-wide text-white/70">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                A blacksmith’s shop for modern SEO
              </p>
              <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                  SEO Foundry
                </span>
              </h1>
              <p className="max-w-2xl text-balance text-white/80">
                A collection of handcrafted tools for bootstrapping everything
                your site needs to be discoverable and fast. Forge pixel-perfect
                social previews, favicons, PWA icons, and pristine metadata.
                Then shape your structured data with schema utilities — all from
                one workshop.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                  Next.js App Router
                </span>
                <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                  Tailwind 4.1
                </span>
                <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                  tRPC • Prisma • PostgreSQL
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-wide text-white/90">
                  Tools on the Anvil
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Explore focused, production-ready utilities — forged to
                  accelerate new builds.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* First Row: Pixel Forge and Schema Smith */}
                <Link
                  href="/pixel-forge"
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-emerald-400/30 hover:bg-white/10"
                >
                  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_circle_at_0%_0%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(700px_circle_at_100%_100%,rgba(16,185,129,0.16),transparent_55%)]" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-100">
                        Image & Metadata
                      </div>
                      <h3 className="text-xl font-semibold text-white/95">
                        Pixel Forge
                      </h3>
                      <p className="mt-1 max-w-[42ch] text-sm text-white/70">
                        Generate favicons, PWA icons, OpenGraph images, and
                        plug-and-play metadata. One source image, a full kit of
                        assets — fast.
                      </p>
                    </div>
                    <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white/75 transition group-hover:border-emerald-400/30 group-hover:bg-emerald-400/10 group-hover:text-emerald-100">
                      Open
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      Favicons
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      PWA Icons
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      Social Previews
                    </div>
                  </div>
                </Link>

                <Link
                  href="/schema-smith"
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-indigo-400/30 hover:bg-white/10"
                >
                  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_circle_at_100%_0%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(700px_circle_at_0%_100%,rgba(16,185,129,0.16),transparent_55%)]" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-0.5 text-[10px] font-medium text-indigo-100">
                        Structured Data
                      </div>
                      <h3 className="text-xl font-semibold text-white/95">
                        Schema Smith
                      </h3>
                      <p className="mt-1 max-w-[42ch] text-sm text-white/70">
                        Craft JSON-LD quickly with guided presets for common
                        pages and entities. Validate, preview, and ship with
                        confidence.
                      </p>
                    </div>
                    <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white/75 transition group-hover:border-indigo-400/30 group-hover:bg-indigo-400/10 group-hover:text-indigo-100">
                      Coming Soon
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      JSON‑LD
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      Presets
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      Validation
                    </div>
                  </div>
                </Link>

                {/* Second Row: Picture Press (spans both columns) */}
                <Link
                  href="/picture-press"
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-cyan-400/30 hover:bg-white/10 md:col-span-2"
                >
                  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_circle_at_50%_0%,rgba(6,182,212,0.16),transparent_55%),radial-gradient(700px_circle_at_50%_100%,rgba(99,102,241,0.16),transparent_55%)]" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-100">
                        Image Conversion
                      </div>
                      <h3 className="text-xl font-semibold text-white/95">
                        Picture Press
                      </h3>
                      <p className="mt-1 max-w-[42ch] text-sm text-white/70">
                        Bulk convert images between formats with custom naming
                        patterns. Upload multiple files, choose formats, and
                        download optimized results.
                      </p>
                    </div>
                    <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white/75 transition group-hover:border-cyan-400/30 group-hover:bg-cyan-400/10 group-hover:text-cyan-100">
                      Open
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      WebP
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      JPEG
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-white/70">
                      PNG
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
