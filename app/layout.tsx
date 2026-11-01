import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Little Tyrants — Small worlds. Big egos.",
  description: "A multiplayer browser sandbox god-game. Rule a floating island of goblins, trollkins and mushroom folk. Build, bless, smite, throw, and invite your friends to ruin it with you.",
  applicationName: "Little Tyrants",
  openGraph: {
    title: "Little Tyrants",
    description: "An entire world. Yours to ruin. Rule a floating island of goblins, trollkins and mushroom folk — solo or with friends.",
    type: "website",
    siteName: "Little Tyrants",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Little Tyrants", description: "An entire world. Yours to ruin." },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d1220",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
