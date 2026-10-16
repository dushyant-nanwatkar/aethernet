import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AetherNet Studio | Air-Gapped AI & Autonomous Telemetry",
  description: "Next-generation air-gapped AI reasoning studio and autonomous telemetry NOC workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-black">
      <body className="antialiased min-h-screen bg-black text-white flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
