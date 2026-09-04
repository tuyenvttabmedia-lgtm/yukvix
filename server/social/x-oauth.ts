import { createHmac, randomBytes } from "node:crypto";

export type OAuth1Credentials = {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
};

export function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export function oauth1SignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const merged: Record<string, string> = { ...params };
  parsed.searchParams.forEach((value, key) => {
    merged[key] = value;
  });
  const paramString = Object.keys(merged)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(merged[key] ?? "")}`)
    .join("&");
  return [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join("&");
}

export function signOAuth1HmacSha1(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string
): string {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(baseString).digest("base64");
}

export function buildOAuth1AuthorizationHeader(
  method: string,
  url: string,
  credentials: OAuth1Credentials,
  extraParams: Record<string, string> = {},
  clock?: { nonce: string; timestamp: string }
): string {
  const nonce = clock?.nonce ?? randomBytes(16).toString("hex");
  const timestamp = clock?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: credentials.token,
    oauth_version: "1.0",
  };
  const signature = signOAuth1HmacSha1(
    oauth1SignatureBaseString(method, url, { ...oauthParams, ...extraParams }),
    credentials.consumerSecret,
    credentials.tokenSecret
  );
  const header: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map(key => `${percentEncode(key)}="${percentEncode(header[key] ?? "")}"`)
      .join(", ")
  );
}
