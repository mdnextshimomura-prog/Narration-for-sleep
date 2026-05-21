import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ぐっすり眠れる歴史 台本ジェネレーター",
  description:
    "偉人の生涯を題材にした、ぐっすり眠れる歴史ナレーション台本を自動生成し、Wordファイルとして出力します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
