import type { Metadata } from "next";
import { headers } from "next/headers";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "USYD Computing Unit Reviews",
  description:
    "Student reviews for computing-related units of study at The University of Sydney",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the nonce injected by middleware so Next.js can apply it to its
  // own internal hydration scripts (requires Next.js 13.4.20+).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50" {...(nonce ? { "data-nonce": nonce } : {})}>
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
          USYD Computing Unit Reviews — Built for students, by students
        </footer>
      </body>
    </html>
  );
}
