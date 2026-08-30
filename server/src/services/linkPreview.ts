import ogs from "open-graph-scraper";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    const { result } = await ogs({ url, timeout: 5000, fetchOptions: { headers: { "user-agent": "PingBot/1.0" } } });
    return {
      url,
      title: result.ogTitle ?? result.twitterTitle ?? null,
      description: result.ogDescription ?? result.twitterDescription ?? null,
      image: result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url ?? null,
      siteName: result.ogSiteName ?? null,
    };
  } catch {
    return { url, title: null, description: null, image: null, siteName: null };
  }
}
