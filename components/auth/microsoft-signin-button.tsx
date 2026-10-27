/** Real top-level navigation (not a client transition or server action): it starts a redirect chain to Microsoft's login page. */
export function MicrosoftSignInButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/azure/authorize?next=${encodeURIComponent(next)}`}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg bg-accent px-4 text-body font-semibold text-accent-foreground transition-colors duration-[120ms] ease-standard hover:bg-accent-hover active:bg-accent-pressed"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-white">
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
