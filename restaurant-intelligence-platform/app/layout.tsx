import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { EnhancedNavigation } from "@/components/layout/enhanced-navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Restaurant Intelligence Platform",
  description: "AI-powered restaurant operations analytics and automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <EnhancedNavigation />
            <main className="animate-fade-in">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}