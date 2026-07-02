/**
 * SeoTracking — Injects GTM snippet and GSC verification meta from seo_settings.
 * Rendered once in App.tsx at root level.
 */
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { trpc } from "@/lib/trpc";

export default function SeoTracking() {
  const { data: settings } = trpc.seo.getSettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: false,
  });

  // Inject GTM <script> into <head> once when containerId is available
  useEffect(() => {
    const containerId = settings?.gtmContainerId;
    if (!containerId) return;
    if (document.getElementById("gtm-script")) return; // already injected

    // GTM head script
    const script = document.createElement("script");
    script.id = "gtm-script";
    script.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');`;
    document.head.appendChild(script);

    // GTM noscript iframe in body
    if (!document.getElementById("gtm-noscript")) {
      const noscript = document.createElement("noscript");
      noscript.id = "gtm-noscript";
      noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
      document.body.insertBefore(noscript, document.body.firstChild);
    }
  }, [settings?.gtmContainerId]);

  // GSC verification meta via react-helmet-async
  if (!settings?.gscVerificationMeta) return null;

  return (
    <Helmet>
      <meta name="google-site-verification" content={settings.gscVerificationMeta} />
    </Helmet>
  );
}
