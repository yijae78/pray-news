/**
 * 실제 크롤링 + Gemini 분석을 실행하여 데모 데이터를 생성하는 스크립트
 * Usage: node scripts/generate-demo.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// .env.local에서 API 키 로드
const envContent = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const GEMINI_API_KEY = envContent.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY not found'); process.exit(1); }

// ── RSS 소스 ──
const FEEDS = [
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

const GN_KEYWORDS = ['기독교', '한국교회', '장로교'];

const CULT_DOMAINS = [
  'newscj.com','scjnews.net','shincheonji.kr','watchtower.org','jw.org','sdanews.org',
  'ucnews.co.kr','familyfed.org','mormonkorea.co.kr','dfrk.kr','beopbo.com','pbc.co.kr',
  'cpbc.co.kr','segye.com','igoodnews.net','newspower.co.kr','hdwm.org','watv.org','wmscog.com',
];
const CULT_KEYWORDS = [
  '신천지','이만희','만민중앙','이재록','여호와의증인','안상홍','장길자','하나님의교회',
  '통일교','문선명','세계평화통일가정연합','전능신교','양향모','안식교','JMS','정명석','세계기독교통일신령협회',
];

// ── 유틸리티 ──
function extractField(item, tag) {
  const cdataRx = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const m1 = item.match(cdataRx);
  if (m1) return m1[1].trim();
  const plainRx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m2 = item.match(plainRx);
  return m2 ? m2[1].trim() : null;
}

function decodeEntities(str) {
  const ent = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&#x27;':"'",'&#x2F;':'/','&nbsp;':' ' };
  let r = str;
  for (const [e, c] of Object.entries(ent)) r = r.split(e).join(c);
  r = r.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  r = r.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return r;
}

function stripHtml(s) { return s.replace(/<br\s*\/?>/gi,' ').replace(/<\/p>/gi,' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(); }
function extractDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { const m = url.match(/https?:\/\/(?:www\.)?([^/]+)/); return m ? m[1] : ''; } }

function toKSTDateString(pubDate) {
  if (!pubDate) return '';
  try { const d = new Date(pubDate); if (isNaN(d.getTime())) return ''; return new Date(d.getTime() + 9*3600000).toISOString().slice(0, 10); } catch { return ''; }
}

function isDateMatch(pubDate, targetDate) {
  if (!pubDate) return true;
  const pub = new Date(pubDate);
  if (isNaN(pub.getTime())) return true;
  const kstDateStr = new Date(pub.getTime() + 9*3600000).toISOString().slice(0, 10);
  const target = new Date(targetDate + 'T00:00:00+09:00');
  const dayBefore = new Date(target.getTime() - 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(target.getTime() + 86400000).toISOString().slice(0, 10);
  return kstDateStr === targetDate || kstDateStr === dayBefore || kstDateStr === dayAfter;
}

function parseRss(xml, sourceName) {
  const articles = [];
  const isGN = sourceName.startsWith('구글뉴스-');
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      const title = extractField(item, 'title');
      let link = extractField(item, 'link');
      const pubDate = extractField(item, 'pubDate');
      const description = extractField(item, 'description');
      if (!title) continue;
      let source = sourceName;
      if (isGN) { const sm = item.match(/<source\s+url="([^"]*)"[^>]*>([^<]*)<\/source>/i); if (sm) { link = sm[1]; source = sm[2]; } }
      articles.push({
        id: `${source}-${i}`,
        title: decodeEntities(title),
        description: decodeEntities(stripHtml(description || '')),
        source, sourceUrl: extractDomain(link || ''),
        url: link || '', pubDate: pubDate || '', pubDateKST: toKSTDateString(pubDate || ''),
      });
    } catch { continue; }
  }
  return articles;
}

function normalizeTitle(t) { return new Set(t.replace(/[^\w\s가-힣]/g,'').toLowerCase().split(/\s+/).filter(x=>x.length>1)); }
function jaccard(a, b) { if (!a.size && !b.size) return 1; let i = 0; for (const t of a) if (b.has(t)) i++; const u = a.size + b.size - i; return u ? i/u : 0; }

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent':'Mozilla/5.0 Chrome/125.0.0.0', 'Accept':'application/rss+xml, application/xml, text/xml, */*' } });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(timer); }
}

// ── 메인 ──
async function main() {
  const today = new Date(Date.now() + 9*3600000).toISOString().slice(0, 10);
  console.log(`\n=== 크롤링 시작: ${today} ===\n`);

  // 피드 URL 빌드
  const feedInfos = [...FEEDS.map(f => ({ ...f }))];
  for (const kw of GN_KEYWORDS) {
    feedInfos.push({ name: `구글뉴스-${kw}`, url: `https://news.google.com/rss/search?q=${encodeURIComponent(kw)}+when:1d&hl=ko&gl=KR&ceid=KR:ko` });
  }

  // 크롤링
  const results = await Promise.allSettled(feedInfos.map(f => fetchWithTimeout(f.url, 8000)));
  const allArticles = [];
  const failedFeeds = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      const parsed = parseRss(r.value, feedInfos[i].name);
      console.log(`  ${feedInfos[i].name}: ${parsed.length}건`);
      allArticles.push(...parsed);
    } else {
      failedFeeds.push(feedInfos[i].name);
      console.log(`  ${feedInfos[i].name}: 실패`);
    }
  }

  console.log(`\n총 수집: ${allArticles.length}건`);

  // 이단 필터링
  let cultCount = 0;
  const filtered = allArticles.filter(a => {
    const d = extractDomain(a.url);
    if (CULT_DOMAINS.some(c => d.includes(c))) { cultCount++; return false; }
    const t = `${a.title} ${a.description}`;
    if (CULT_KEYWORDS.some(k => t.includes(k))) { cultCount++; return false; }
    return true;
  });
  console.log(`이단 차단: ${cultCount}건`);

  // 날짜 필터
  const dateFiltered = filtered.filter(a => isDateMatch(a.pubDate, today));
  console.log(`날짜 필터: ${dateFiltered.length}건`);

  // 중복 제거
  const deduped = [];
  for (const a of dateFiltered) {
    const tokens = normalizeTitle(a.title);
    if (!deduped.some(e => jaccard(tokens, normalizeTitle(e.title)) >= 0.6)) deduped.push(a);
  }
  console.log(`중복 제거 후: ${deduped.length}건`);

  const final = deduped.slice(0, 50);

  const crawlMeta = {
    totalFetched: allArticles.length,
    filteredCult: cultCount,
    filteredDuplicate: dateFiltered.length - deduped.length,
    finalCount: final.length,
    failedFeeds,
    isPartial: false,
  };

  console.log(`\n최종 기사: ${final.length}건\n`);

  if (final.length === 0) {
    console.error('수집된 기사가 없습니다. 데모 데이터 생성 불가.');
    process.exit(1);
  }

  // ── Gemini 분석 ──
  console.log('=== Gemini AI 분석 시작 ===\n');

  const SYSTEM = `당신은 한국 개신교(장로교 통합 교단) 관점의 뉴스 분석 전문가입니다.
분석 시 다음 원칙을 따릅니다:
1. 개혁신학(칼빈주의) 관점에서 분석
2. WCC/NCCK 에큐메니컬 운동에 우호적 입장
3. 이단/사이비 판별은 통합 교단 공식 입장 따름
4. 정치적으로 중립, 사회정의에 관심
5. 목회적 돌봄과 위로의 언어 사용`;

  const articlesSummary = final.map((a, i) => `[${i+1}] ${a.title} (${a.source})\n${a.description}`).join('\n\n');

  const prompt = `오늘 날짜: ${today}
아래는 오늘 수집된 한국 기독교 뉴스 ${final.length}건입니다.

${articlesSummary}

다음 7가지 항목을 분석해주세요:
1. stats: 매체별 기사 수 (source, count)
2. summary: 주요 이슈 3~5개 (title, description, relatedArticleIds)
3. categories: 카테고리별 분류 (name, articles[{id, title}])
4. sentiment: 각 기사 긍정/부정/중립 + 전체 비율 + 종합 평가
5. keywords: 핵심 키워드 Top 10 (word, count)
6. prediction: 단기(1~2주), 중기(1~3개월) 전망
7. prayer: 개인기도(personal), 공동기도(communal), 수요기도회(wednesday) 기도문

기도문 작성 원칙:
- 개혁신학 관점 (하나님의 주권, 은혜, 성경 권위)
- 오늘 뉴스의 구체적 내용을 반영
- 경건하고 격식 있는 문체 (합쇼체)
- 각 기도문 200자 이상`;

  const schema = {
    type: 'OBJECT',
    properties: {
      stats: { type: 'ARRAY', items: { type: 'OBJECT', properties: { source: { type: 'STRING' }, count: { type: 'INTEGER' } }, required: ['source', 'count'] } },
      summary: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, description: { type: 'STRING' }, relatedArticleIds: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'description', 'relatedArticleIds'] } },
      categories: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, articles: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, title: { type: 'STRING' } }, required: ['id', 'title'] } } }, required: ['name', 'articles'] } },
      sentiment: { type: 'OBJECT', properties: { articles: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, title: { type: 'STRING' }, sentiment: { type: 'STRING', enum: ['positive', 'negative', 'neutral'] } }, required: ['id', 'title', 'sentiment'] } }, overall: { type: 'OBJECT', properties: { positive: { type: 'INTEGER' }, negative: { type: 'INTEGER' }, neutral: { type: 'INTEGER' } }, required: ['positive', 'negative', 'neutral'] }, overallAssessment: { type: 'STRING' } }, required: ['articles', 'overall', 'overallAssessment'] },
      keywords: { type: 'ARRAY', items: { type: 'OBJECT', properties: { word: { type: 'STRING' }, count: { type: 'INTEGER' } }, required: ['word', 'count'] } },
      prediction: { type: 'OBJECT', properties: { shortTerm: { type: 'STRING' }, midTerm: { type: 'STRING' } }, required: ['shortTerm', 'midTerm'] },
      prayer: { type: 'OBJECT', properties: { personal: { type: 'STRING' }, communal: { type: 'STRING' }, wednesday: { type: 'STRING' } }, required: ['personal', 'communal', 'wednesday'] },
    },
    required: ['stats', 'summary', 'categories', 'sentiment', 'keywords', 'prediction', 'prayer'],
  };

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM }] },
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini API 오류:', res.status, errText);
    process.exit(1);
  }

  const geminiData = await res.json();
  const analysisText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!analysisText) {
    console.error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
    process.exit(1);
  }

  const analysis = JSON.parse(analysisText);
  console.log('분석 완료!');
  console.log(`  이슈: ${analysis.summary?.length || 0}건`);
  console.log(`  카테고리: ${analysis.categories?.length || 0}개`);
  console.log(`  키워드: ${analysis.keywords?.length || 0}개`);
  console.log(`  기도문: personal ${analysis.prayer?.personal?.length || 0}자, communal ${analysis.prayer?.communal?.length || 0}자, wednesday ${analysis.prayer?.wednesday?.length || 0}자`);

  // 결과 저장
  const output = {
    date: today,
    articles: final,
    analysis,
    meta: crawlMeta,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(ROOT, 'src', 'demo-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n데모 데이터 저장: ${outPath}`);
  console.log(`기사 ${final.length}건 + 분석 결과 + 기도문 3종`);
}

main().catch(e => { console.error(e); process.exit(1); });
