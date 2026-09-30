import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harness Eval Lab · Trace → Dataset → Eval",
  description: "私有 Harness Eval 交互实验台：Trace 标注、Dataset 构建与版本回归评测。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
