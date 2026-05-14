import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── 타입 ──
interface Article {
  id: string;
  title: string;
  description: string;
  content?: string;
  source: string;
  sourceUrl: string;
  url: string;
  pubDate: string;
  pubDateKST: string;
}

interface FeedInfo {
  name: string;
  url: string;
  isGoogleNews?: boolean;
}

// ── RSS 소스 ──
const DIRECT_RSS_FEEDS: FeedInfo[] = [
  { name: '한국기독공보', url: 'https://www.pckworld.com/rss/allArticle.xml' },
  { name: '국민일보', url: 'https://www.kmib.co.kr/rss/data/kmibRssAll.xml' },
  { name: '장로신문', url: 'https://www.jangro.kr/feed' },
  { name: '뉴스앤조이', url: 'https://www.newsnjoy.or.kr/rss/allArticle.xml' },
  { name: '시대와목회', url: 'https://www.t-mhn.com/rss/allArticle.xml' },
  { name: '복음과상황', url: 'https://www.gospeltoday.co.kr/rss/allArticle.xml' },
  { name: '교회와신앙', url: 'https://www.amennews.com/rss/allArticle.xml' },
  { name: '평화교회신문', url: 'https://www.penews.co.kr/rss/allArticle.xml' },
  { name: '기독교한국신문', url: 'https://www.cknews.co.kr/rss/allArticle.xml' },
  { name: '크리스천투데이', url: 'https://www.christiantoday.co.kr/rss/' },
  { name: '기독신문', url: 'https://www.kidok.com/rss/allArticle.xml' },
];

const GOOGLE_NEWS_KEYWORDS = ['기독교', '한국교회', '장로교'];

// ── 이단 블랙리스트 ──
const CULT_DOMAINS = [
  'newscj.com', 'scjnews.net', 'shincheonji.kr',
  'watchtower.org', 'jw.org', 'sdanews.org',
  'ucnews.co.kr', 'familyfed.org', 'mormonkorea.co.kr',
  'dfrk.kr', 'beopbo.com', 'pbc.co.kr', 'cpbc.co.kr',
  'segye.com', 'igoodnews.net', 'newspower.co.kr',
  'hdwm.org', 'watv.org', 'wmscog.com',
];

const CULT_KEYWORDS = [
  '신천지', '이만희', '만민중앙', '이재록',
  '여호와의증인', '안상홍', '장길자', '하나님의교회',
  '통일교', '문선명', '세계평화통일가정연합',
  '전능신교', '양향모', '안식교',
  'JMS', '정명석', '세계기독교통일신령협회',
];

// ── 유틸리티 함수 ──

function extractField(item: string, tag: string): string | null {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = item.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = item.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();

  return null;
}

function decodeEntities(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&#x27;': "'", '&#x2F;': '/', '&nbsp;': ' ',
  };
  let result = str;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  result = result.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return result;
}

function stripHtml(str: string): string {
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const match = url.match(/https?:\/\/(?:www\.)?([^/]+)/);
    return match ? match[1] : '';
  }
}

function toKSTDateString(pubDate: string): string {
  if (!pubDate) return '';
  try {
    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return '';
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function isPastDate(dateStr: string): boolean {
  const target = new Date(dateStr + 'T00:00:00+09:00');
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  return diffMs > 2 * 24 * 60 * 60 * 1000;
}

function isDateMatch(pubDate: string, targetDate: string): boolean {
  if (!pubDate) return true;
  const pub = new Date(pubDate);
  if (isNaN(pub.getTime())) return true;

  const kstPub = new Date(pub.getTime() + 9 * 60 * 60 * 1000);
  const kstDateStr = kstPub.toISOString().slice(0, 10);

  const target = new Date(targetDate + 'T00:00:00+09:00');
  const dayBefore = new Date(target.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dayAfter = new Date(target.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return kstDateStr === targetDate || kstDateStr === dayBefore || kstDateStr === dayAfter;
}

// ── RSS 파싱 ──

function parseRssXml(xml: string, sourceName: string): Article[] {
  const articles: Article[] = [];
  const isGoogleNews = sourceName.startsWith('구글뉴스-');
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      const title = extractField(item, 'title');
      let link = extractField(item, 'link');
      const pubDate = extractField(item, 'pubDate');
      const description = extractField(item, 'description');
      const content = extractField(item, 'content:encoded');

      if (!title) continue;

      let source = sourceName;
      if (isGoogleNews) {
        const sourceMatch = item.match(/<source\s+url="([^"]*)"[^>]*>([^<]*)<\/source>/i);
        if (sourceMatch) {
          link = sourceMatch[1];
          source = sourceMatch[2];
        }
      }

      articles.push({
        id: `${source}-${i}`,
        title: decodeEntities(title),
        description: decodeEntities(stripHtml(description || '')),
        content: content ? decodeEntities(stripHtml(content)).slice(0, 500) : undefined,
        source,
        sourceUrl: extractDomain(link || ''),
        url: link || '',
        pubDate: pubDate || '',
        pubDateKST: toKSTDateString(pubDate || ''),
      });
    } catch {
      continue;
    }
  }

  return articles;
}

// ── 필터링 ──

function filterCultArticles(articles: Article[]): { filtered: Article[]; cultCount: number } {
  let cultCount = 0;
  const filtered = articles.filter(article => {
    const domain = extractDomain(article.url);
    if (CULT_DOMAINS.some(cult => domain.includes(cult))) {
      cultCount++;
      return false;
    }
    const text = `${article.title} ${article.description}`;
    if (CULT_KEYWORDS.some(keyword => text.includes(keyword))) {
      cultCount++;
      return false;
    }
    return true;
  });
  return { filtered, cultCount };
}

function normalizeTitle(title: string): Set<string> {
  const cleaned = title
    .replace(/[^\w\s가-힣]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1);
  return new Set(cleaned);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function deduplicateArticles(articles: Article[]): Article[] {
  const result: Article[] = [];
  for (const article of articles) {
    const tokens = normalizeTitle(article.title);
    const isDuplicate = result.some(existing => {
      const existingTokens = normalizeTitle(existing.title);
      return jaccardSimilarity(tokens, existingTokens) >= 0.6;
    });
    if (!isDuplicate) {
      result.push(article);
    }
  }
  return result;
}

// ── fetch ──

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 피드 URL 빌드 ──

function buildFeedUrls(date: string): FeedInfo[] {
  const feeds: FeedInfo[] = DIRECT_RSS_FEEDS.map(f => ({ ...f }));
  if (!isPastDate(date)) {
    for (const keyword of GOOGLE_NEWS_KEYWORDS) {
      feeds.push({
        name: `구글뉴스-${keyword}`,
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}+when:1d&hl=ko&gl=KR&ceid=KR:ko`,
        isGoogleNews: true,
      });
    }
  }
  return feeds;
}

// ── 경고 메시지 ──

function buildWarning(articleCount: number, isPast: boolean, failedCount: number): string | undefined {
  if (articleCount === 0) {
    return '해당 날짜에 수집된 뉴스가 없습니다. 주말이나 공휴일에는 뉴스가 적을 수 있습니다.';
  }
  const warnings: string[] = [];
  if (isPast) warnings.push('과거 날짜의 뉴스는 일부만 제공될 수 있습니다');
  if (articleCount < 5) warnings.push(`수집된 뉴스가 ${articleCount}건으로 적어 분석이 제한적일 수 있습니다`);
  if (failedCount > 5) warnings.push(`${failedCount}개 매체 연결에 실패하여 일부 뉴스가 누락되었을 수 있습니다`);
  return warnings.length > 0 ? warnings.join('. ') + '.' : undefined;
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
  }

  const feedUrls = buildFeedUrls(date);

  const results = await Promise.allSettled(
    feedUrls.map(feed => fetchWithTimeout(feed.url, 5000))
  );

  const articles: Article[] = [];
  const failedFeeds: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      try {
        const parsed = parseRssXml(result.value, feedUrls[i].name);
        articles.push(...parsed);
      } catch {
        failedFeeds.push(feedUrls[i].name);
      }
    } else {
      failedFeeds.push(feedUrls[i].name);
    }
  }

  const { filtered, cultCount } = filterCultArticles(articles);
  const dateFiltered = filtered.filter(a => isDateMatch(a.pubDate, date));
  const deduplicated = deduplicateArticles(dateFiltered);
  const final = deduplicated.slice(0, 50);
  const warning = buildWarning(final.length, isPastDate(date), failedFeeds.length);

  return res.status(200).json({
    articles: final,
    meta: {
      totalFetched: articles.length,
      filteredCult: cultCount,
      filteredDuplicate: dateFiltered.length - deduplicated.length,
      finalCount: final.length,
      failedFeeds,
      isPartial: isPastDate(date),
      warning,
    },
  });
}
