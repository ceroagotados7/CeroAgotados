import type { Metadata } from "next";
import { Figtree, Inter } from "next/font/google";
import "./globals.css";

// Tipografía pactada en el design system: Figtree (títulos) + Inter (cuerpo).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cero Agotados",
  description: "Marketplace farmacéutico B2B — el mejor precio para tu farmacia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${figtree.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-canvas text-ink font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
