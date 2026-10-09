import type { Metadata } from "next";
import { MerryMenView } from "./MerryMenView";
export const metadata: Metadata = { title: "Merry Men Referrals | TradeWood" };
export default function Page() {
  return <MerryMenView />;
}
