import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Little Tyrants — Small worlds. Big egos.",
  description: "A multiplayer browser sandbox god-game. Rule a floating island of goblins, trollkins and mushroom folk. Build, bless, smite, throw, and invite your friends to ruin it with you.",
  applicationName: "Little Tyrants",
  openGraph: { title: "Little Tyrants", description: "An entire world. Yours to ruin.", type: "website" },
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
