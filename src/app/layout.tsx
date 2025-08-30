import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";
import Header from "@/app/_components/Header";

export const metadata: Metadata = {
  title: "SEO Foundry",
  description: "A blacksmith’s shop for modern SEO",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="min-h-screen bg-[radial-gradient(1600px_circle_at_0%_-10%,#4f46e5_0%,rgba(79,70,229,0.12)_35%,transparent_60%),radial-gradient(1400px_circle_at_120%_110%,#059669_0%,rgba(5,150,105,0.12)_30%,transparent_60%),linear-gradient(to_bottom,#0b0b13,#0b0b13)] text-white">
        <TRPCReactProvider>
          <Header />
          <div className="pt-20">{children}</div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
