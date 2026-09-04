function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Free-text name on the album when no creator row is joined. */
export function albumCosplayerHint(album: {
  cosplayer?: string | null;
  creator?: string | null;
}): string | null {
  return trimOrNull(album.cosplayer) || trimOrNull(album.creator);
}

/**
 * Display / SEO / social name. Prefer the Cosplayer catalog name
 * when the album is linked via creatorId.
 */
export function displayCosplayerName(album: {
  cosplayer?: string | null;
  creator?: string | null;
  creatorName?: string | null;
}): string | null {
  return trimOrNull(album.creatorName) || albumCosplayerHint(album);
}
