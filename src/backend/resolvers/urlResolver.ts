import { requestUrl } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class URLResolver {
  static async resolveURL(url: string): Promise<Partial<ReferenceMetadata>> {
    const cleanUrl = url.trim();

    // 1. YouTube Video Resolver via oEmbed
    if (/youtube\.com|youtu\.be/i.test(cleanUrl)) {
      try {
        const oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(cleanUrl) + '&format=json';
        const res = await requestUrl({ url: oembedUrl });
        if (res.status === 200 && res.json) {
          const title = res.json.title || 'YouTube Video';
          const channel = res.json.author_name || 'YouTube Channel';
          const year = new Date().getFullYear();
          const authors = [channel];
          return {
            citekey: CitationEngine.generateCitekey(authors, year, title),
            title,
            authors,
            year,
            publication: 'YouTube',
            publisher: channel,
            url: cleanUrl,
            accessedDate: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
            type: 'video'
          };
        }
      } catch (e) {
        console.warn('[CitationManager] YouTube oEmbed failed:', e);
      }
    }

    // 2. Generic HTML Scraping
    try {
      const res = await requestUrl({ url: cleanUrl });
      if (res.status === 200 && res.text) {
        const html = res.text;
        let title = 'Untitled Webpage';
        const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
        const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (ogTitle && ogTitle[1]) title = ogTitle[1].trim();
        else if (htmlTitle && htmlTitle[1]) title = htmlTitle[1].trim();

        let author = '';
        const metaAuthor = html.match(/<meta\s+(?:name=["']author["']|property=["']article:author["'])\s+content=["'](.*?)["']/i);
        if (metaAuthor && metaAuthor[1]) author = metaAuthor[1].trim();

        let siteName = '';
        const ogSite = html.match(/<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i);
        if (ogSite && ogSite[1]) siteName = ogSite[1].trim();
        else {
          try { siteName = new URL(cleanUrl).hostname; } catch {}
        }

        const authors = author ? [author] : (siteName ? [siteName] : ['Website']);
        const year = new Date().getFullYear();

        return {
          citekey: CitationEngine.generateCitekey(authors, year, title),
          title,
          authors,
          year,
          publication: siteName,
          url: cleanUrl,
          accessedDate: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
          type: 'webpage'
        };
      }
    } catch (e) {
      console.warn('[CitationManager] URL fetch failed:', e);
    }

    // Fallback URL
    let hostname = 'Webpage';
    try { hostname = new URL(cleanUrl).hostname; } catch {}
    return {
      citekey: 'Web' + new Date().getFullYear(),
      title: cleanUrl,
      authors: [hostname],
      year: new Date().getFullYear(),
      url: cleanUrl,
      accessedDate: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
      type: 'webpage'
    };
  }
}
