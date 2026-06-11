import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET() {
  const address = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS || "") as `0x${string}`;
  if (!address) return NextResponse.json({ rfps: [] });

  const client = createClient({ chain: studionet });
  try {
    const idsRaw = await client.readContract({ address, functionName: "list_rfps", args: [] });
    const ids: string[] = typeof idsRaw === "string" ? JSON.parse(idsRaw) : (idsRaw as string[]);

    // Sequential with a small delay to stay under Studionet's 30 req/min ceiling
    // and avoid silent nulls from rate-limit drops.
    const rfps: unknown[] = [];
    for (const id of ids) {
      try {
        const r = await client.readContract({ address, functionName: "get_rfp", args: [id] });
        if (typeof r === "string" && r) rfps.push(JSON.parse(r));
      } catch {
        // single-RFP failure should not poison the list; skip and continue
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
    return NextResponse.json({ rfps });
  } catch (e) {
    return NextResponse.json({ rfps: [], error: (e as Error).message }, { status: 200 });
  }
}
