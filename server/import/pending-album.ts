/** Album metadata stored on job until AlbumCreationStep (V2). */
export interface PendingAlbumData {
  slug: string;
  title: string;
  creator?: string | null;
  creatorId?: number | null;
  collectionName?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  category: "Japan" | "China" | "Korea" | "Euro" | "Cosplay" | "Gravure";
  tags?: string[] | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  focusKeyword?: string | null;
  relatedKeywords?: string[] | null;
  altTextTemplate?: string | null;
  originalFileName: string;
  isVip?: boolean;
  freePreviewCount?: number;
  publishMode?: string;
}

export function parsePendingAlbumData(raw: string | null | undefined): PendingAlbumData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAlbumData;
  } catch {
    return null;
  }
}

export function serializePendingAlbumData(data: PendingAlbumData): string {
  return JSON.stringify(data);
}
