import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const title = "IDSW 2026 | Indonesia Software Developer Conference, Jakarta";
const description =
  "Watch the IDSW 2026 livestream and recordings. Indonesia's biggest community-led developer conference, run by PERKODI in Jakarta.";

export const metadata: Metadata = {
  metadataBase: new URL("https://stream.idsw.dev"),
  title,
  description,
  keywords: [
    "Indonesia Software Developer Conference",
    "IDSW 2026",
    "PERKODI",
    "developer conference",
    "Jakarta",
    "software engineering",
    "livestream",
  ],
  authors: [{ name: "IDSW Organizers" }],
  alternates: { canonical: "/" },
  robots: { index: false, follow: false },
  openGraph: {
    title,
    description,
    url: "/",
    type: "website",
    siteName: "IDSW",
    locale: "en_US",
    images: [
      {
        url: "/assets/og.jpg",
        width: 1200,
        height: 630,
        alt: "IDSW 2026. Indonesia Software Developer Conference.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@idswdev",
    title,
    description,
    images: ["/assets/og.jpg"],
  },
  icons: {
    icon: [
      {
        url: "/assets/favicon.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/assets/favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/assets/favicon.png",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/assets/favicon-dark.png",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const viewport: Viewport = { themeColor: "#003ac2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
