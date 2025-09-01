"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Pixel Forge", href: "/pixel-forge" },
  { name: "Picture Press", href: "/picture-press" },
  { name: "Schema Smith", href: "/schema-smith" },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-white/5 backdrop-blur-md">
      {/* edge-to-edge subtle gradient wash to blend with page background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1100px_700px_at_-10%_-20%,rgba(99,102,241,0.18),transparent_60%),radial-gradient(1100px_700px_at_110%_140%,rgba(16,185,129,0.18),transparent_60%)]" />
      <nav
        aria-label="Global"
        className="mx-auto flex w-full items-center justify-between gap-x-6 px-6 py-4 lg:px-8"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">SEO Foundry</span>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold tracking-wide text-white/90">
                <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                SEO Foundry
                </span>
              </span>
            </div>
          </Link>
        </div>

        <div className="hidden lg:flex lg:gap-x-10">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-semibold text-white/80 transition hover:text-white"
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-x-3">
          <button
            type="button"
            className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 lg:block"
          >
            Log in
          </button>
          <button
            type="button"
            className="rounded-md border border-indigo-400/30 bg-indigo-500/20 px-3 py-1.5 text-sm font-semibold text-indigo-100 shadow-[0_0_0_1px_rgba(99,102,241,0.25)_inset] hover:bg-indigo-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Sign up
          </button>
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-white/70 hover:text-white"
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
          </div>
        </div>
      </nav>

      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="lg:hidden"
      >
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-white/10 bg-[#0b0b13]/95 p-6 backdrop-blur-md sm:max-w-sm">
          <div className="flex items-center gap-x-6">
            <Link
              href="/"
              className="-m-1.5 p-1.5"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">SEO Foundry</span>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-semibold tracking-wide text-white/90">
                  SEO{" "}
                  <span className="bg-gradient-to-r from-indigo-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                    Foundry
                  </span>
                </span>
              </div>
            </Link>
            <button
              type="button"
              className="ml-auto rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-md p-2.5 text-white/70 hover:text-white"
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>

          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-white/10">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold text-white hover:bg-white/5"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="py-6">
                <button
                  type="button"
                  className="-mx-3 block w-full rounded-lg px-3 py-2.5 text-left text-base font-semibold text-white hover:bg-white/5"
                >
                  Log in
                </button>
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
