export async function webSearch(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return [];

    const html = await res.text();
    const results = [];

    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/g;

    const links = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
      links.push({ url, title: stripHtml(match[2]) });
    }

    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(stripHtml(match[1]));
    }

    for (let i = 0; i < Math.min(links.length, 5); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || '',
      });
    }

    return results;
  } catch (err) {
    console.error('Web search error:', err.message);
    return [];
  }
}

export function formatSearchResults(results) {
  if (!results || results.length === 0) return '';
  return 'Resultados de búsqueda web:\n' + results.map((r, i) =>
    `[${i + 1}] ${r.title}: ${r.snippet} (Fuente: ${r.url})`
  ).join('\n\n');
}

function stripHtml(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
