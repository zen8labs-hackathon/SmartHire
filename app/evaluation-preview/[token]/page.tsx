import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ token: string }>;
};

export const metadata: Metadata = {
  title: "Evaluation preview",
  robots: { index: false, follow: false },
};

export default async function EvaluationPreviewPage({ params }: PageProps) {
  const { token } = await params;
  const clean = token?.trim() ?? "";
  if (!/^[0-9a-f]{48}$/i.test(clean)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted">This evaluation link is invalid.</p>
      </div>
    );
  }

  const src = `/api/public/evaluation-preview/${clean}`;

  return (
    <div className="flex min-h-screen flex-col bg-surface-secondary">
      <header className="border-b border-divider bg-background px-4 py-3">
        <p className="text-center text-sm font-medium text-foreground">
          Interview evaluation preview
        </p>
        <p className="mt-0.5 text-center text-xs text-muted">
          Shared read-only document. Do not forward if confidential.
        </p>
      </header>
      <iframe
        title="Evaluation PDF"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
