"use client";

import useSWR from "swr";
import type { TherapySessionWithClient } from "@/lib/db/types";
import { fetcher } from "@/lib/utils";

export function useSessions() {
  const { data, error, isLoading, mutate } = useSWR<{
    sessions: TherapySessionWithClient[];
  }>("/api/sessions", fetcher);

  return {
    sessions: data?.sessions ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
