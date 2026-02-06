"use client";

import useSWR from "swr";
import type { Client } from "@/lib/db/types";
import { fetcher } from "@/lib/utils";

export function useClients() {
  const { data, error, isLoading, mutate } = useSWR<Client[]>(
    "/api/clients",
    fetcher
  );

  return {
    clients: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
