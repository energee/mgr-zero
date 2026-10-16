"use client";

import { lazy } from "react";

const LazyWrapper = lazy(() => import("./delegated"));

export default function LazyDelegated() {
  return <LazyWrapper />;
}
