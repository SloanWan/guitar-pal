import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavProgressProvider, NavProgressBar } from "@/components/nav-progress";
import NoFocusZoom from "@/components/NoFocusZoom";
import { GrainDefs } from "@/components/ui/grain";
import { figtree, mono } from "./fonts/fonts";

export const metadata: Metadata = {
  title: "Guitar Pal",
  description: "Build your guitar practice, one routine at a time.",
};

// `cover` lets the page reach the screen's edges, so the safe-area insets the
// shell pads with (the tab bar, sheets, the editor's dock) read their real
// values; without it an iPhone reports them as 0 (#446).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs synchronously during HTML parsing, before first paint, so the saved
// theme applies without a flash. Light is the default (#356): only a visitor who
// chose dark gets it. The attribute is always set, so the tokens never fall back
// to the system's preference on a visitor who picked a theme.
const themeInitScript = `(function(){var t;try{t=localStorage.getItem("gp-theme")}catch(e){}document.documentElement.dataset.theme=t==="dark"?"dark":"light";})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${figtree.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full flex flex-col">
        <GrainDefs />
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
