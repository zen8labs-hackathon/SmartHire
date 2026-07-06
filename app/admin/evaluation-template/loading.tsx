import { TemplateSkeleton } from "@/components/admin/candidate-evaluation-template/template-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 font-sans animate-pulse">
      <div>
        <div className="h-7 w-56 rounded bg-default-200" />
        <div className="mt-2 h-4 w-full max-w-xl rounded bg-default-100" />
      </div>

      <TemplateSkeleton />
    </div>
  );
}
