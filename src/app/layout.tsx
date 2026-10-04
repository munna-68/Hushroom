import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Together",
  description: "A shared study room.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Fill the safe area on notched devices. User scaling is deliberately left
  // enabled — disabling it breaks pinch-zoom for low-vision users.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}