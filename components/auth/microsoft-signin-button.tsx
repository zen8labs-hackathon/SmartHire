/** Real top-level navigation (not a client transition or server action): it starts a redirect chain to Microsoft's login page. */
export function MicrosoftSignInButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/azure/authorize?next=${encodeURIComponent(next)}`}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-gold-foreground shadow-md shadow-black/15 transition-all duration-200 hover:bg-brand-gold-hover hover:shadow-lg active:scale-[0.98]"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-white">
        <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
      </span>
      <span>Sign in with Microsoft</span>
    </a>
  );
}
