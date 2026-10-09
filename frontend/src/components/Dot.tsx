/** Solid status dot with a ping halo (stays visible mid-animation). */
export function Dot({ tone = "bg-neonGreen", size = "w-2 h-2" }: { tone?: string; size?: string }) {
  return (
    <span className={`relative inline-flex ${size} shrink-0`}>
      <span className={`absolute inline-flex h-full w-full rounded-full ${tone} opacity-60 animate-ping`} />
      <span className={`relative inline-flex rounded-full h-full w-full ${tone}`} />
    </span>
  );
}
