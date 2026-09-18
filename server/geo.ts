import type { Express, Request } from "express";
import { countryToLanguage, readCountryFromHeaders } from "../shared/geo-locale";

function countryFromRequest(req: Request): string | null {
  return readCountryFromHeaders(req.headers as Record<string, unknown>);
}

export function registerGeoRoutes(app: Express) {
  app.get("/api/geo", (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const country = countryFromRequest(req);
    res.json({
      country,
      language: countryToLanguage(country),
    });
  });
}
