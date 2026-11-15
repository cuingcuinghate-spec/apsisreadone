import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "APSIS — Aplikasi Pembuat Soal dan Analisis",
  description:
    "Platform cerdas terintegrasi untuk guru: pembuat naskah soal, kisi-kisi, kunci jawaban, kartu soal, analisis butir soal (CTT), analisis nilai (KKTP), kuis interaktif, dan simulasi TKA 2026.",
  keywords: ["APSIS", "pembuat soal", "kartu soal", "kisi-kisi", "CTT", "KKTP", "TKA 2026", "guru"],
  authors: [{ name: "APSIS" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
