import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavProgressProvider, NavProgressBar } from "@/components/nav-progress";
import NoFocusZoom from "@/components/NoFocusZoom";
import WebVitals from "@/components/WebVitals";
import OfflineSupport from "@/components/OfflineSupport";
import { GrainDefs } from "@/components/ui/grain";
import { figtree, mono } from "./fonts/fonts";
import { APP_DESCRIPTION } from "@/lib/brand/app";
import { launchImages } from "@/lib/pwa/launchScreens";
import { PickMark } from "@/components/ui/pick";
import LaunchCurtain from "@/components/LaunchCurtain";

export const metadata: Metadata = {
  title: "Guitar Pal",
  description: APP_DESCRIPTION,
  // Installed from Safari's Share menu, the app opens without the browser's bars (#468),
  // and on its launch image rather than black until the first paint (#490).
  appleWebApp: {
    capable: true,
    title: "Guitar Pal",
    statusBarStyle: "default",
    startupImage: launchImages().map(({ url, media }) => ({ url, media })),
  },
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

// The launch curtain (#490): on the installed app's cold start only — the first page of a
// session in standalone — the launch image's mark comes to life until the page is ready
// (LaunchCurtain lifts it). Set before first paint, like the theme.
const launchInitScript = `(function(){try{if((matchMedia("(display-mode: standalone)").matches||navigator.standalone===true)&&!sessionStorage.getItem("gp-launched")){sessionStorage.setItem("gp-launched","1");document.documentElement.dataset.launch="";}}catch(e){}})()`;

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
        <script dangerouslySetInnerHTML={{ __html: launchInitScript }} />
      </head>
      <body className="h-full flex flex-col">
        {/* Keeps iPadOS from blurring the header in the installed app (#478, shell.css). */}
        <div className="gp-edge-band" aria-hidden />
        <GrainDefs />
        <div className="gp-launch" aria-hidden>
          <PickMark className="gp-launch-mark" />
        </div>
        <LaunchCurtain />
        <NavProgressProvider>
          <NavProgressBar />
          {children}
        </NavProgressProvider>
        <Toaster />
        {/* After the Toaster, so its offline line has somewhere to show on a page opened offline. */}
        <OfflineSupport />
        <NoFocusZoom />
        <WebVitals />
      </body>
    </html>
  );
}
