/**
 * Eigener aggregierter News-RSS-Feed.
 * Bonus für SEO + andere Tools können uns abonnieren.
 */

import { getRecentNews } from "@/lib/news/store";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const revalidate = 300;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const items = await getRecentNews({ limit: 50 }).catch(() => []);
  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ligabase – Bundesliga-News</title>
    <link>${baseUrl}/news</link>
    <description>News, Verletzungen, Aufstellungen und Transfers für deine Kickbase-Strategie.</description>
    <language>de-DE</language>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${baseUrl}/news/feed.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <pubDate>${item.publishedAt.toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(item.externalId)}</guid>
      <source>${escapeXml(item.sourceDisplayName)}</source>
      ${item.body ? `<description><![CDATA[${item.body}]]></description>` : ""}
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
