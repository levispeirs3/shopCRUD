import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import CustomerBanner from "@/components/customer-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shop CRUD",
  description: "Student CRUD project with Next.js and Supabase Postgres",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-gray-900">
        <Script id="strip-extension-attrs" strategy="beforeInteractive">{`
          (function () {
            function strip() {
              try {
                document.querySelectorAll('[fdprocessedid]').forEach(function (el) {
                  el.removeAttribute('fdprocessedid');
                });
              } catch (e) {}
            }
            strip();
            var observer = new MutationObserver(strip);
            observer.observe(document.documentElement, {
              attributes: true,
              childList: true,
              subtree: true,
            });
          })();
        `}</Script>
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 py-4">
            <Link href="/select-customer" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Select Customer
            </Link>
            <Link href="/dashboard" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Customer Dashboard
            </Link>
            <Link href="/place-order" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Place Order
            </Link>
            <Link href="/orders" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Order History
            </Link>
            <Link href="/warehouse/priority" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Warehouse Priority Queue
            </Link>
            <Link href="/run-scoring" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Run Scoring
            </Link>
            <Link href="/supabase-test" className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100">
              Supabase Test
            </Link>
          </div>
          <div className="mx-auto w-full max-w-6xl border-t border-slate-200 px-4 py-2">
            <CustomerBanner />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
