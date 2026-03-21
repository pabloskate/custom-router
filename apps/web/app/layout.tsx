import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CustomRouter",
  description: "Self-hostable, OpenAI-compatible LLM router with BYOK, explainability, and Cloudflare deployment support.",
  icons: {
    icon: [
      { url: "/brand/custom-router-mark-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/custom-router-mark-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/brand/custom-router-mark-192.png"],
    apple: [{ url: "/brand/custom-router-mark-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
