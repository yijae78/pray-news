export interface Article {
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

export interface IssueSummary {
  title: string;
  description: string;
  relatedArticleIds: string[];
}

export interface CategoryGroup {
  name: string;
  articles: { id: string; title: string }[];
}

export interface SentimentResult {
  articles: { id: string; title: string; sentiment: 'positive' | 'negative' | 'neutral' }[];
  overall: { positive: number; negative: number; neutral: number };
  overallAssessment: string;
}

export interface AnalysisResult {
  stats: { source: string; count: number }[];
  summary: IssueSummary[];
  categories: CategoryGroup[];
  sentiment: SentimentResult;
  keywords: { word: string; count: number }[];
  prediction: { shortTerm: string; midTerm: string };
  prayer: {
    personal: string;
    communal: string;
    wednesday: string;
  };
  _partial?: boolean;
}

export type AppState = 'idle' | 'crawling' | 'analyzing' | 'done' | 'error';

export interface CrawlMeta {
  totalFetched: number;
  filteredCult: number;
  filteredDuplicate: number;
  finalCount: number;
  failedFeeds: string[];
  isPartial: boolean;
  warning?: string;
}

export interface CrawlResponse {
  articles: Article[];
  meta: CrawlMeta;
}

export interface CachedReport {
  date: string;
  articles: Article[];
  analysis: AnalysisResult;
  meta: CrawlMeta;
  cachedAt: number;
}
