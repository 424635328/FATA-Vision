import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "启发式优化算法动态可视化平台",
  description: "使用 Next.js + Tailwind CSS + Plotly.js 构建的 2D 搜索空间与收敛过程回放平台。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
