"use client";

import { Component, type ReactNode } from "react";

interface SuspenseErrorBoundaryProps {
  children: ReactNode;
  /** Rendered in place of `children` once an error is caught. */
  fallback: ReactNode | ((error: Error) => ReactNode);
}

interface SuspenseErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic Error Boundary for wrapping a `<Suspense>` boundary whose child
 * resolves a promise via `use()`.
 *
 * Next.js's file-based `error.tsx` is scoped to the route segment, not to an
 * arbitrary `<Suspense>` region inside a page, so it won't reliably catch a
 * rejected promise thrown by `use()` deep inside a single page's component
 * tree. This class component fills that gap and can be reused anywhere a
 * `Server Component -> promise prop -> use()` pattern needs localized error
 * handling instead of crashing (or blanking) the whole route.
 */
export class SuspenseErrorBoundary extends Component<
  SuspenseErrorBoundaryProps,
  SuspenseErrorBoundaryState
> {
  state: SuspenseErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SuspenseErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("SuspenseErrorBoundary caught an error:", error);
  }

  render() {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
    return this.props.children;
  }
}
