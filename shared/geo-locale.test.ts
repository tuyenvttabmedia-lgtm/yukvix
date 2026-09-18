import { describe, expect, it } from "vitest";
import { countryToLanguage, parseCloudflareTrace, readCountryFromHeaders } from "./geo-locale";

describe("countryToLanguage", () => {
  it("maps English-speaking and CJK countries onto the six site languages", () => {
    expect(countryToLanguage("US")).toBe("en");
    expect(countryToLanguage("gb")).toBe("en");
    expect(countryToLanguage("JP")).toBe("ja");
    expect(countryToLanguage("KR")).toBe("ko");
    expect(countryToLanguage("VN")).toBe("vi");
    expect(countryToLanguage("TW")).toBe("zh-TW");
    expect(countryToLanguage("HK")).toBe("zh-TW");
    expect(countryToLanguage("CN")).toBe("zh-CN");
  });

  it("ignores unknown, Tor, and empty country codes so the browser locale can win", () => {
    expect(countryToLanguage("FR")).toBeNull();
    expect(countryToLanguage("XX")).toBeNull();
    expect(countryToLanguage("T1")).toBeNull();
    expect(countryToLanguage("")).toBeNull();
    expect(countryToLanguage(null)).toBeNull();
  });
});

describe("parseCloudflareTrace / readCountryFromHeaders", () => {
  it("reads loc= from cdn-cgi/trace", () => {
    expect(parseCloudflareTrace("ip=1.1.1.1\nloc=US\ncolo=EWR\n")).toBe("US");
    expect(parseCloudflareTrace("loc=vn\n")).toBeNull();
  });

  it("prefers Cloudflare CF-IPCountry", () => {
    expect(readCountryFromHeaders({ "cf-ipcountry": "JP" })).toBe("JP");
    expect(
      readCountryFromHeaders({
        get: (name: string) => (name.toLowerCase() === "cf-ipcountry" ? "KR" : null),
      })
    ).toBe("KR");
  });
});
