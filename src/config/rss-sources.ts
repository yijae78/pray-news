export const DIRECT_RSS_FEEDS: { name: string; url: string }[] = [
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

export const GOOGLE_NEWS_KEYWORDS = ['기독교', '한국교회', '장로교'];

export function buildGoogleNewsUrl(keyword: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}+when:1d&hl=ko&gl=KR&ceid=KR:ko`;
}

export function isPastDate(dateStr: string): boolean {
  const target = new Date(dateStr + 'T00:00:00+09:00');
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  return diffMs > 2 * 24 * 60 * 60 * 1000;
}
