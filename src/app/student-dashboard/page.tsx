"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function StudentDashboardAlias() {
  const r = useRouter();
  useEffect(() => { r.replace("/student"); }, [r]);
  return null;
}
