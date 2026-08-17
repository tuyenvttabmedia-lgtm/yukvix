/**
 * Optional Google web search for creator name verification (Serper API).
 * Set SERPER_API_KEY in .env — https://serper.dev (Google results).
 */

export interface WebSearchSnippet {
  title: string;
  snippet: string;
  link: string;
}

const COUNTRY_BY_CATEGORY: Record<string, string> = {
  Korea: "kr",
  China: "cn",
  Japan: "jp",
  Euro: "uk",
};

export function buildCreatorSearchQuery(filename: string, category?: string): string {
  const cleaned = filename.replace(/\.(zip|rar|7z)$/i, "").replace(/\s+/g, " ").trim();
  const seriesHint =
    category === "Korea"
      ? "korean model gravure"
      : category === "China"
        ? "chinese model xiuren"
        : category === "Japan"
          ? "japanese gravure idol"
          : "model photoset";
  return `${cleaned} ${seriesHint}`.slice(0, 150);
}

export async function searchCreatorOnWeb(
  query: string,
  opts?: { category?: string; num?: number }
): Promise<WebSearchSnippet[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];

  const gl = opts?.category ? (COUNTRY_BY_CATEGORY[opts.category] ?? "us") : "us";

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: opts?.num ?? 5,
        gl,
        hl: "en",
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`[CreatorSearch] Serper HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      organic?: Array<{ title?: string; snippet?: string; link?: string }>;
    };

    return (data.organic ?? [])
      .slice(0, opts?.num ?? 5)
      .filter((r) => r.title && r.snippet)
      .map((r) => ({
        title: r.title!,
        snippet: r.snippet!,
        link: r.link ?? "",
      }));
  } catch (err) {
    console.warn(`[CreatorSearch] Failed: ${(err as Error).message}`);
    return [];
  }
}

export function formatSearchSnippetsForPrompt(snippets: WebSearchSnippet[]): string {
  if (snippets.length === 0) return "(no Google results available)";
  return snippets
    .map((s, i) => `${i + 1}. ${s.title}\n   ${s.snippet}\n   ${s.link}`)
    .join("\n");
}
