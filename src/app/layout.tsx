import "./globals.css";
import type { Metadata } from "next";
import { Bebas_Neue, Atkinson_Hyperlegible, Share_Tech_Mono } from "next/font/google";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { ProcuraFooter } from "@/components/layout/ProcuraFooter";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-atkinson" });
const share = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-share" });

export const metadata: Metadata = {
  title: "PROCURA — Bid evaluation by rubric, evidence, and consensus",
  description: "GenLayer-powered procurement bid evaluator and vendor selection consensus layer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${atkinson.variable} ${share.variable}`}>
      <body>
        <TopNavigation />
        <main className="min-h-[calc(100vh-180px)]">{children}</main>
        <ProcuraFooter />
      </body>
    </html>
  );
}
