/** Real top-level navigation (not a client transition or server action): it starts a redirect chain to Microsoft's login page. */
export function MicrosoftSignInButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/azure/authorize?next=${encodeURIComponent(next)}`}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-divider bg-surface-secondary/40 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:border-accent/40 hover:bg-background active:scale-[0.98]"
    >
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      <span>Sign in with Microsoft</span>
    </a>
  );
}
