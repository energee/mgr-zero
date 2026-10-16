"use client";

import { lazy } from "react";

const LazyWrapper = lazy(() => import("./delegated"));

export default function LazyUnused() {
  void LazyWrapper;
  return <div>separate drawing</div>;
}
