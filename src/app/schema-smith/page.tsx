import Link from "next/link";

export default function SchemaSmithPage() {
  return (
    <main className="min-h-[calc(100vh-5rem)] text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="text-center">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-12 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_600px_at_50%_0%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(600px_400px_at_50%_100%,rgba(16,185,129,0.18),transparent_55%)]" />
            
            <div className="relative z-10">
              {/* Status Badge */}
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-sm font-medium text-indigo-100">
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
                Structured Data
              </div>

              {/* Title */}
              <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                <span className="bg-gradient-to-r from-indigo-300 via-purple-200 to-blue-200 bg-clip-text text-transparent">
                  Schema Smith
                </span>
              </h1>

              {/* Description */}
              <p className="mx-auto mb-8 max-w-2xl text-balance text-lg text-white/80">
                Craft JSON-LD quickly with guided presets for common pages and entities. 
                Validate, preview, and ship with confidence.
              </p>

              {/* Coming Soon Message */}
              <div className="mb-8 rounded-2xl border border-indigo-400/20 bg-indigo-400/5 p-8">
                <h2 className="mb-3 text-2xl font-semibold text-white/95">
                  Coming Soon!
                </h2>
                <p className="text-white/70">
                  We&apos;re forging the perfect tool for structured data generation. 
                  Schema Smith will help you create SEO-friendly JSON-LD markup 
                  with intelligent presets and real-time validation.
                </p>
              </div>

              {/* Features Preview */}
              <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <h3 className="mb-2 font-medium text-white/90">JSON-LD Generation</h3>
                  <p className="text-sm text-white/60">
                    Smart templates for common schema types
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <h3 className="mb-2 font-medium text-white/90">Validation</h3>
                  <p className="text-sm text-white/60">
                    Real-time schema validation and testing
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <h3 className="mb-2 font-medium text-white/90">Presets</h3>
                  <p className="text-sm text-white/60">
                    Ready-made templates for pages and entities
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 py-3 font-medium text-white/90 transition hover:border-white/30 hover:bg-white/15"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}