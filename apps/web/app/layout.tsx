import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PWARegister } from "@/components/pwa-register";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Autonomous Realtor Intelligence Copilot",
  description: "Columbus public-data real estate copilot",
  manifest: "/manifest.webmanifest",
  applicationName: "Autonomous Realtor Intelligence Copilot",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Realtor Copilot"
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#12576a"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Realtor Copilot" />
        <meta name="theme-color" content="#12576a" />
      </head>
      <body className="text-foreground">
        <Providers>
          <PWARegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
