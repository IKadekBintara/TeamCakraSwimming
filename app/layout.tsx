import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Team Cakra Swimming",
    template: "%s — Team Cakra Swimming",
  },
  description: "TEAM CAKRA SWIMMING — sistem manajemen atlet, absensi, event, pendaftaran, dan pembayaran.",
  icons: {
    icon: "/brand/team-cakra-mark.png",
    shortcut: "/brand/team-cakra-mark.png",
    apple: "/brand/team-cakra-mark.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('team-cakra-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}" }} />
      </head>
      <body className="min-h-screen text-slate-900 antialiased">
        <a href="#main-content" className="skip-link">Lewati ke konten</a>
        {children}
      </body>
    </html>
  );
}
