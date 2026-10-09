import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { MerryMenView } from "./MerryMenView";
export const metadata: Metadata = pageMeta("/merry-men/", "Merry Men Referrals | TradeWood", "Share your TradeWood referral link and earn a share of swap fees plus $WOOD bonuses from a fixed guild budget.");
export default function Page() {
  return <MerryMenView />;
}
