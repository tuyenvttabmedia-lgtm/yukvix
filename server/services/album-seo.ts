import { callAi } from "./ai-provider";
import {
  mergeAiAlbumSeo,
  mergeAiCreatorSeo,
  type AlbumSeoContext,
  type AlbumSeoFields,
} from "./seo-title";

export type { AlbumSeoContext, AlbumSeoFields };

async function parseJsonFields(raw: string | undefined): Promise<Partial<AlbumSeoFields>> {
  if (!raw) throw new Error("Empty AI response");
  return JSON.parse(raw) as Partial<AlbumSeoFields>;
}

/** Bulk / suggest album SEO: title stays on the original name; AI writes description. */
export async function generateAlbumSeo(album: AlbumSeoContext, tagNames: string): Promise<AlbumSeoFields> {
  const natural = mergeAiAlbumSeo(album, undefined, { tagNames });
  const contextParts: string[] = [];
  if (album.title) contextParts.push(`Original title (keep this order, do not rearrange): ${album.title}`);
  if (album.cosplayer) contextParts.push(`Creator: ${album.cosplayer}`);
  if (album.character) contextParts.push(`Character: ${album.character}`);
  if (album.series) contextParts.push(`Series/Franchise: ${album.series}`);
  if (tagNames) contextParts.push(`Tags: ${tagNames}`);

  try {
    const result = await callAi({
      messages: [
        {
          role: "system",
          content: `You write short factual SEO copy for a photo gallery.
Rules:
- focusKeyword: 2-4 words from the original title or creator name. Do NOT add "cosplay" unless the original title already contains it.
- metaTitle: ignored by the server. Repeat the original title if you must fill this field. Do not invent a new title or reorder names.
- metaDescription: 140-160 characters, factual. Mention the original album name. No hype adjectives (stunning, captivating, breathtaking, premium). No VIP. No call-to-action spam.
- Use English. Keep Chinese/Japanese/Korean names exactly as given.
- Return valid JSON only.`,
        },
        {
          role: "user",
          content: `Generate SEO keyword and description for this album:\n\n${contextParts.join("\n")}`,
        },
      ],
      temperature: 0.4,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "album_seo",
          strict: true,
          schema: {
            type: "object",
            properties: {
              focusKeyword: { type: "string", description: "Primary SEO keyword phrase (2-4 words)" },
              metaTitle: { type: "string", description: "Ignored; original album title is used" },
              metaDescription: { type: "string", description: "SEO meta description (140-160 chars)" },
            },
            required: ["focusKeyword", "metaTitle", "metaDescription"],
            additionalProperties: false,
          },
        },
      },
    });
    const parsed = await parseJsonFields(result.content);
    return mergeAiAlbumSeo(album, parsed, { tagNames });
  } catch {
    return natural;
  }
}

export async function generateCreatorSeo(creator: {
  id?: number;
  name: string;
  bio?: string | null;
  country?: string | null;
}): Promise<AlbumSeoFields> {
  const natural = mergeAiCreatorSeo(creator);
  const contextParts: string[] = [];
  if (creator.name) contextParts.push(`Name: ${creator.name}`);
  if (creator.bio) contextParts.push(`Bio: ${creator.bio}`);
  if (creator.country) contextParts.push(`Country: ${creator.country}`);

  try {
    const result = await callAi({
      messages: [
        {
          role: "system",
          content: `You write short factual SEO copy for a photographer or model profile.
Rules:
- focusKeyword: 2-4 words based on the person's name. Do not add "cosplay" unless their name already includes it.
- metaTitle: ignored. The server uses "[Name] | Yukvix".
- metaDescription: 140-160 characters, factual. Mention the name. No hype adjectives.
- Use English. Return valid JSON only.`,
        },
        {
          role: "user",
          content: `Generate SEO keyword and description for this creator:\n\n${contextParts.join("\n")}`,
        },
      ],
      temperature: 0.4,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "creator_seo",
          strict: true,
          schema: {
            type: "object",
            properties: {
              focusKeyword: { type: "string", description: "Primary SEO keyword phrase (2-4 words)" },
              metaTitle: { type: "string", description: "Ignored; original name is used" },
              metaDescription: { type: "string", description: "SEO meta description (140-160 chars)" },
            },
            required: ["focusKeyword", "metaTitle", "metaDescription"],
            additionalProperties: false,
          },
        },
      },
    });
    const parsed = await parseJsonFields(result.content);
    return mergeAiCreatorSeo(creator, parsed);
  } catch {
    return natural;
  }
}
