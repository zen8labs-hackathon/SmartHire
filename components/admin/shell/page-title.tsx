"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Crumb = { label: React.ReactNode; href?: string };

type BreadcrumbState = {
  crumbs: Crumb[] | null;
  setCrumbs: (crumbs: Crumb[] | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbState>({
  crumbs: null,
  setCrumbs: () => {},
});

/** Lets a page publish a breadcrumb trail into the root header. */
export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbs() {
  return useContext(BreadcrumbContext).crumbs;
}

/** Sets the header breadcrumb while mounted. Pass a stable key per trail. */
export function useSetBreadcrumbs(crumbs: Crumb[] | null) {
  const { setCrumbs } = useContext(BreadcrumbContext);
  const key = crumbs ? JSON.stringify(crumbs.map((c) => [typeof c.label === "string" ? c.label : "", c.href ?? ""])) : "";
  useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
}
