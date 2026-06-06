import type { Metadata } from "next";
import { Lexend, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteNav } from "@/components/site-nav";

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lexend",
  display: "swap",
});

// Body sans is exposed as --font-sans so shadcn's `font-sans` utility uses it.
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IRAS Tax Assistant",
  description:
    "Conversational assistant for Singapore tax questions: GST, income tax, corporate tax, and SRS. Estimates and human escalation included.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("h-full", lexend.variable, sourceSans.variable, "font-sans")}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to main content
        </a>
        <TooltipProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteNav />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
