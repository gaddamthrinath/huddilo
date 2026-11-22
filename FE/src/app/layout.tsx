import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huddilo — Meet and work together",
  description:
    "Create secure video meetings with screen sharing, collaboration, and simple guest access.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
