import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { BountyBanditsView } from "./BountyBanditsView";
export const metadata: Metadata = pageMeta("/bounty-bandits/", "Bounty Bandits Referrals | TradeWood", "Share your TradeWood referral link and earn a share of swap fees plus $WOOD bonuses from a fixed guild budget.");
export default function Page() {
  return <BountyBanditsView />;
}
