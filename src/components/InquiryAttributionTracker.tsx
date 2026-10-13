"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { readOrCreateLandingAttribution } from "@/lib/inquiry-attribution";

export function InquiryAttributionTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try { readOrCreateLandingAttribution(window.sessionStorage, pathname, document.referrer); } catch { /* storage unavailable */ }
  }, [pathname]);
  return null;
}
