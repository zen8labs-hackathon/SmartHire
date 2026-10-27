import type { Metadata } from "next";
// Self-hosted fonts (design system §2.5): no runtime request to Google Fonts.
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css"; // wordmark only
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/600.css";
import { RequestIdFetchProvider } from "@/components/request-id-fetch-provider";
import { ToastProvider } from "@/components/admin/toast-provider";
import { I18nLocaleProvider } from "@/components/i18n-locale-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Hire",
  description: "Smart Hire — hiring workflows with secure sign-in",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col min-w-full">
        <RequestIdFetchProvider />
        <I18nLocaleProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nLocaleProvider>
      </body>
    </html>
  );
}
