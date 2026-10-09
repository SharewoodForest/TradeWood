"use client";
import { useEffect, useState } from "react";
import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { safeStorage } from "@/lib/format";

const KEY = "tradewood.referrer";

/** Reads ?ref=0x… once and remembers it (Merry Men attribution). */
export function useReferrer(self?: Address): Address {
  const [ref, setRef] = useState<Address>(zeroAddress);
  useEffect(() => {
    const store = safeStorage();
    const param = new URLSearchParams(window.location.search).get("ref");
    if (param && isAddress(param)) store.set(KEY, getAddress(param));
    const saved = store.get(KEY);
    if (saved && isAddress(saved)) setRef(getAddress(saved));
  }, []);
  // No self-referral
  return self && ref.toLowerCase() === self.toLowerCase() ? zeroAddress : ref;
}
