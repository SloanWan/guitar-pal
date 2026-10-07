import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavProgressProvider, NavProgressBar } from "@/components/nav-progress";
import NoFocusZoom from "@/components/NoFocusZoom";
import { mono, sans } from "./fonts/fonts";

export const metadata: Metadata = {
  title: "Guitar Pal",
  description: "Build your guitar practice, one routine at a time.",
};

// Runs synchronously during HTML parsing, before first paint, so the saved
// theme applies without a flash. Dark is the token default on :root.
const themeInitScript = `(function(){var t=localStorage.getItem("gp-theme");if(!t)t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${sans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full flex flex-col">
        <NavProgressProvider>
          <NavProgressBar />
          {children}
        </NavProgressProvider>
        <Toaster />
        <NoFocusZoom />
      </body>
    </html>
  );
}
