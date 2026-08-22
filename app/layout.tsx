import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Team Cakra Swimming",
    template: "%s — Team Cakra Swimming",
  },
  description: "TEAM CAKRA SWIMMING — sistem manajemen atlet, absensi, event, pendaftaran, dan pembayaran.",
  icons: {
    icon: "/brand/team-cakra-logo.png",
    shortcut: "/brand/team-cakra-logo.png",
    apple: "/brand/team-cakra-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
