import { useState, useRef, useEffect } from 'react';
import {
  Calendar, Loader2, Copy, Share2,
  AlertTriangle, ChevronDown, ChevronUp, RefreshCw, ExternalLink,
  Newspaper, ShieldCheck, Brain, BookOpen, ChevronRight,
  Rss, Cpu, FileText, Menu, X, TrendingUp,
  Cross, Sparkles, Smartphone, Tablet, Monitor, Home, Zap, Download, Trash2,
} from 'lucide-react';
import type { Article, AnalysisResult, AppState, CrawlMeta, CachedReport } from './types';
import rawDemoData from './demo-data.json';

// ── 오늘 날짜 ──
const TODAY = (() => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
})();

// ── 실제 크롤링+분석으로 생성된 데모 데이터 ──
const DEMO_ARTICLES: Article[] = rawDemoData.articles as Article[];
const DEMO_META: CrawlMeta = rawDemoData.meta as CrawlMeta;
const DEMO_ANALYSIS: AnalysisResult = (() => {
  const a = rawDemoData.analysis as AnalysisResult;
  const total = (a.sentiment.overall.positive + a.sentiment.overall.negative + a.sentiment.overall.neutral) || 1;
  if (total !== 100) {
    a.sentiment.overall = {
      positive: Math.round(a.sentiment.overall.positive / total * 100),
      negative: Math.round(a.sentiment.overall.negative / total * 100),
      neutral: Math.round(a.sentiment.overall.neutral / total * 100),
    };
    const diff = 100 - (a.sentiment.overall.positive + a.sentiment.overall.negative + a.sentiment.overall.neutral);
    a.sentiment.overall.neutral += diff;
  }
  return a;
})();

// ── 유틸 ──
function todayKST(): string { return TODAY; }

function getMinDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - 7);
  return kst.toISOString().slice(0, 10);
}

function formatDateKR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr + 'T00:00:00+09:00').getDay()];
}

function getCachedReport(date: string): CachedReport | null {
  try {
    const raw = localStorage.getItem(`cached-report-${date}`);
    if (!raw) return null;
    const cached: CachedReport = JSON.parse(raw);
    if (Date.now() - cached.cachedAt > 86400000) { localStorage.removeItem(`cached-report-${date}`); return null; }
    return cached;
  } catch { return null; }
}

function saveCachedReport(date: string, articles: Article[], analysis: AnalysisResult, meta: CrawlMeta) {
  try { localStorage.setItem(`cached-report-${date}`, JSON.stringify({ date, articles, analysis, meta, cachedAt: Date.now() } satisfies CachedReport)); } catch {}
}

// ── 사이드바 섹션 ──
const SECTIONS = [
  { id: 'sec-stats', icon: Rss, label: '수집 현황' },
  { id: 'sec-issues', icon: Newspaper, label: '주요 이슈' },
  { id: 'sec-categories', icon: FileText, label: '카테고리 분류' },
  { id: 'sec-sentiment', icon: TrendingUp, label: '긍정·부정 평가' },
  { id: 'sec-keywords', icon: Sparkles, label: '핵심 키워드' },
  { id: 'sec-prediction', icon: Cpu, label: '미래 전망' },
  { id: 'sec-prayer', icon: BookOpen, label: '기도문' },
  { id: 'sec-articles', icon: ExternalLink, label: '전체 기사' },
];

type View = 'landing' | 'result';
type DeviceMode = 'phone' | 'tablet' | 'desktop';
type DateMode = 'single' | 'range' | 'month';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 앱
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function App() {
  const [date, setDate] = useState(todayKST());
  const [dateEnd, setDateEnd] = useState(todayKST());
  const [dateMonth, setDateMonth] = useState(todayKST().slice(0, 7));
  const [dateMode, setDateMode] = useState<DateMode>('single');
  const [state, setState] = useState<AppState>('idle');
  const [articles, setArticles] = useState<Article[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [meta, setMeta] = useState<CrawlMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [activeId, setActiveId] = useState('sec-stats');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [catTab, setCatTab] = useState(0);
  const [prayerTab, setPrayerTab] = useState<'personal' | 'communal' | 'wednesday'>('personal');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(() => {
    if (typeof window === 'undefined') return 'phone';
    const w = window.innerWidth;
    if (w >= 1024) return 'desktop';
    if (w >= 600) return 'tablet';
    return 'phone';
  });
  const prayerRef = useRef<HTMLDivElement>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  // PWA 설치 프롬프트 캡처
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!localStorage.getItem('pwa-install-dismissed')) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowInstallBanner(false);
        flash('앱이 설치되었습니다!');
      }
      setInstallPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  }

  function dismissInstall() {
    setShowInstallBanner(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  const canGo = state === 'idle' || state === 'done' || state === 'error';
  const disabled = !canGo || cooldown;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const isPhone = deviceMode === 'phone';

  function enterDemo() {
    setArticles(DEMO_ARTICLES); setAnalysis(DEMO_ANALYSIS); setMeta(DEMO_META);
    setIsDemo(true); setState('done'); setView('result'); setError(null);
    setActiveId('sec-stats');
  }

  function goHome() {
    setView('landing'); setState('idle'); setArticles([]); setAnalysis(null);
    setMeta(null); setIsDemo(false); setError(null); setSidebarOpen(false);
  }

  // 날짜 범위 계산
  function getDateList(): string[] {
    if (dateMode === 'single') return [date];
    let start: string, end: string;
    if (dateMode === 'range') {
      start = date <= dateEnd ? date : dateEnd;
      end = date <= dateEnd ? dateEnd : date;
    } else {
      start = dateMonth + '-01';
      const [y, m] = dateMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      end = dateMonth + '-' + String(lastDay).padStart(2, '0');
      // 미래 날짜는 오늘까지만
      if (end > todayKST()) end = todayKST();
    }
    const list: string[] = [];
    const cur = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    while (cur <= endD) {
      list.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }

  function getDateLabel(): string {
    if (dateMode === 'single') return formatDateKR(date);
    if (dateMode === 'range') {
      const s = date <= dateEnd ? date : dateEnd;
      const e = date <= dateEnd ? dateEnd : date;
      return `${formatDateKR(s)} ~ ${formatDateKR(e)}`;
    }
    const [y, m] = dateMonth.split('-');
    return `${y}년 ${Number(m)}월`;
  }

  function changeDate(d: string) {
    setDate(d);
    if (dateMode === 'single') {
      const c = getCachedReport(d);
      if (c) { setArticles(c.articles); setAnalysis(c.analysis); setMeta(c.meta); setError(null); setState('done'); setIsDemo(false); setView('result'); }
    }
  }

  function clearReport() {
    // 캐시 삭제
    const dates = getDateList();
    dates.forEach(d => localStorage.removeItem(`cached-report-${d}`));
    // 상태 초기화
    setArticles([]); setAnalysis(null); setMeta(null); setError(null); setState('idle');
    flash(`${dates.length > 1 ? dates.length + '일분' : formatDateKR(dates[0])} 분석 결과가 삭제되었습니다`);
  }

  async function analyze(force = false) {
    if (disabled) return;
    const dates = getDateList();
    if (dates.length > 31) { setError('최대 31일까지 선택 가능합니다.'); setState('error'); setView('result'); return; }

    // 단일 날짜 캐시 체크
    if (!force && dates.length === 1) {
      const c = getCachedReport(dates[0]);
      if (c) { setArticles(c.articles); setAnalysis(c.analysis); setMeta(c.meta); setError(null); setState('done'); setIsDemo(false); setView('result'); return; }
    }

    setCooldown(true); setTimeout(() => setCooldown(false), 15000);
    setError(null); setIsDemo(false); setView('result'); setState('crawling');
    try {
      // 모든 날짜에 대해 크롤링
      const allArticles: Article[] = [];
      let totalFetched = 0, totalCult = 0, totalDup = 0;
      const allFailed: string[] = [];
      let anyPartial = false;

      for (const d of dates) {
        const r1 = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: d }) });
        if (!r1.ok) continue;
        const d1 = await r1.json();
        allArticles.push(...d1.articles);
        totalFetched += d1.meta.totalFetched;
        totalCult += d1.meta.filteredCult;
        totalDup += d1.meta.filteredDuplicate;
        if (d1.meta.failedFeeds) allFailed.push(...d1.meta.failedFeeds);
        if (d1.meta.isPartial) anyPartial = true;
      }

      // 중복 제거 (다른 날짜에서 같은 기사 수집 가능)
      const seen = new Set<string>();
      const deduped = allArticles.filter(a => {
        const key = a.title.slice(0, 30);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      const finalArticles = deduped.slice(0, 50);

      const combinedMeta: CrawlMeta = {
        totalFetched, filteredCult: totalCult, filteredDuplicate: totalDup + (deduped.length < allArticles.length ? allArticles.length - deduped.length : 0),
        finalCount: finalArticles.length, failedFeeds: [...new Set(allFailed)], isPartial: anyPartial,
      };
      setArticles(finalArticles); setMeta(combinedMeta);

      if (!finalArticles.length) { setError('해당 기간에 수집된 뉴스가 없습니다.'); setState('error'); return; }
      setState('analyzing');

      const dateLabel = dates.length === 1 ? dates[0] : `${dates[0]}~${dates[dates.length - 1]}`;
      const r2 = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: finalArticles, date: dateLabel }) });
      if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.error || '분석에 실패했습니다.'); }
      const d2: AnalysisResult = await r2.json();
      setAnalysis(d2);
      // 캐시 저장 (단일 날짜만)
      if (dates.length === 1) saveCachedReport(dates[0], finalArticles, d2, combinedMeta);
      setState('done');
    } catch (e) {
      const m = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(m.includes('fetch') || m.includes('Network') ? '인터넷 연결을 확인해주세요.' : m);
      setState('error');
    }
  }

  async function copy(text: string) { try { await navigator.clipboard.writeText(text); flash('복사되었습니다'); } catch { flash('복사 실패'); } }
  async function share(text: string, title: string) { if (navigator.share) { try { await navigator.share({ title, text }); return; } catch { return; } } copy(text); }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }
  function selectSection(id: string) { setActiveId(id); setSidebarOpen(false); }
  const [dlMenuOpen, setDlMenuOpen] = useState(false);

  function getLabel(type: string) { return type === 'personal' ? '개인기도' : type === 'communal' ? '공동기도' : '수요기도회'; }

  function downloadAsTxt(text: string, type: string) {
    const label = getLabel(type);
    const content = `${formatDateKR(date)} ${label}\n${'─'.repeat(30)}\n\n${text}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerDownload(blob, `기도문_${label}_${date}.txt`);
  }

  function downloadAsImage(text: string, type: string, fmt: 'png' | 'jpg') {
    const label = getLabel(type);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const padding = 60; const lineH = 36; const maxW = 700;
    canvas.width = maxW + padding * 2;
    const lines = wrapText(ctx, text, maxW, '18px "Noto Sans KR", sans-serif');
    const titleH = 70;
    canvas.height = titleH + lines.length * lineH + padding * 2;
    // Background
    ctx.fillStyle = '#FFF8E7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1E40AF'; ctx.fillRect(0, 0, canvas.width, 4);
    // Title
    ctx.font = 'bold 22px "Noto Sans KR", sans-serif'; ctx.fillStyle = '#1E3A5F';
    ctx.fillText(`${formatDateKR(date)} ${label}`, padding, padding + 28);
    ctx.strokeStyle = '#E8D5A3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padding, padding + 45); ctx.lineTo(canvas.width - padding, padding + 45); ctx.stroke();
    // Body
    ctx.font = '18px "Noto Sans KR", sans-serif'; ctx.fillStyle = '#1A1A1A';
    lines.forEach((line, i) => ctx.fillText(line, padding, titleH + padding + i * lineH));
    // Export
    const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    canvas.toBlob(blob => { if (blob) triggerDownload(blob, `기도문_${label}_${date}.${fmt}`); }, mime, 0.95);
  }

  function downloadAsPdf(text: string, type: string) {
    const label = getLabel(type);
    const title = `${formatDateKR(date)} ${label}`;
    const lines = text.split('\n');
    // Simple PDF generation
    const ptPerLine = 20; const margin = 50; const pageW = 595; const pageH = 842;
    const contentW = pageW - margin * 2;
    const allLines: string[] = [];
    lines.forEach(l => { if (l.length === 0) { allLines.push(''); } else { for (let i = 0; i < l.length; i += 35) allLines.push(l.slice(i, i + 35)); } });
    const totalH = margin + 60 + allLines.length * ptPerLine + margin;
    const pages = Math.ceil(totalH / pageH) || 1;

    let pdf = '%PDF-1.4\\n';
    const offsets: number[] = [];
    let objNum = 1;
    const addObj = (content: string) => { offsets.push(pdf.length); pdf += `${objNum} 0 obj\\n${content}\\nendobj\\n`; objNum++; };

    // 1: Catalog
    addObj('<< /Type /Catalog /Pages 2 0 R >>');
    // 2: Pages (placeholder)
    const pagesObjIdx = offsets.length;
    addObj(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
    // 3: Page
    addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>`);
    // 4: Font
    addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    // 5: Content stream
    let stream = `BT /F1 20 Tf ${margin} ${pageH - margin - 20} Td (${escPdf(title)}) Tj ET\\n`;
    stream += `${margin} ${pageH - margin - 40} m ${pageW - margin} ${pageH - margin - 40} l 0.8 0.8 0.8 RG 0.5 w S\\n`;
    let y = pageH - margin - 70;
    allLines.forEach(line => {
      if (y < margin) { y = pageH - margin - 20; }
      stream += `BT /F1 11 Tf ${margin} ${y} Td (${escPdf(line)}) Tj ET\\n`;
      y -= ptPerLine;
    });
    const streamBytes = new TextEncoder().encode(stream);
    addObj(`<< /Length ${streamBytes.length} >>\\nstream\\n${stream}endstream`);

    const xrefOffset = pdf.length;
    pdf += `xref\\n0 ${objNum}\\n0000000000 65535 f \\n`;
    offsets.forEach(o => pdf += `${String(o).padStart(10, '0')} 00000 n \\n`);
    pdf += `trailer << /Size ${objNum} /Root 1 0 R >>\\nstartxref\\n${xrefOffset}\\n%%EOF`;

    const blob = new Blob([pdf], { type: 'application/pdf' });
    triggerDownload(blob, `기도문_${label}_${date}.pdf`);
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); flash('다운로드 완료'); setDlMenuOpen(false);
  }

  function escPdf(s: string) {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string): string[] {
    ctx.font = font;
    const result: string[] = [];
    text.split('\n').forEach(para => {
      if (para.length === 0) { result.push(''); return; }
      let line = '';
      for (const char of para) {
        const test = line + char;
        if (ctx.measureText(test).width > maxW && line) { result.push(line); line = char; }
        else line = test;
      }
      if (line) result.push(line);
    });
    return result;
  }

  // ── 디바이스 토글 ──
  const DeviceToggle = () => (
    <div className="device-toggle">
      <button className={`dt-btn ${deviceMode === 'phone' ? 'dt-btn--active' : ''}`} onClick={() => setDeviceMode('phone')} title="Phone"><Smartphone size={15} /></button>
      <button className={`dt-btn ${deviceMode === 'tablet' ? 'dt-btn--active' : ''}`} onClick={() => setDeviceMode('tablet')} title="Tablet"><Tablet size={15} /></button>
      <button className={`dt-btn ${deviceMode === 'desktop' ? 'dt-btn--active' : ''}`} onClick={() => setDeviceMode('desktop')} title="Desktop"><Monitor size={15} /></button>
    </div>
  );

  // ── 활성 섹션 렌더링 ──
  const renderActiveSection = () => {
    if (!analysis || !meta) return null;

    switch (activeId) {
      case 'sec-stats':
        return (
          <section className="result-section anim-fadeUp" key="stats">
            <STitle n={1}>수집 현황</STitle>
            <div className={`kpi-grid ${deviceMode !== 'phone' ? 'kpi-grid--wide' : ''}`}>
              <KPI icon={<Newspaper size={22} />} label="수집된 뉴스" value={`${meta.finalCount}건`} color="#3B82F6" />
              <KPI icon={<ShieldCheck size={22} />} label="이단 차단" value={`${meta.filteredCult}건`} color="#3B82F6" />
              <KPI icon={<Brain size={22} />} label="분석 매체" value={`${analysis.stats.length}개`} color="#B8860B" />
            </div>
            <div className="card">
              <div className="stat-chips">
                {analysis.stats.map(s => <span key={s.source} className="stat-chip">{s.source} <strong>{s.count}건</strong></span>)}
              </div>
              {meta.filteredDuplicate > 0 && <p className="stat-note">중복 기사 {meta.filteredDuplicate}건 제거</p>}
              {meta.failedFeeds.length > 0 && <p className="stat-note muted">연결 실패: {meta.failedFeeds.slice(0, 5).join(', ')}{meta.failedFeeds.length > 5 && ` 외 ${meta.failedFeeds.length - 5}개`}</p>}
            </div>
          </section>
        );

      case 'sec-issues':
        return (
          <section className="result-section anim-fadeUp" key="issues">
            <STitle n={2}>오늘의 주요 이슈</STitle>
            {analysis.summary[0] && (
              <div className="issue-hero">
                <span className="issue-hero-badge">핵심 이슈</span>
                <h4 className="issue-hero-title">{analysis.summary[0].title}</h4>
                <p className="issue-hero-desc">{analysis.summary[0].description}</p>
              </div>
            )}
            {analysis.summary.length > 1 && (
              <div className={`issue-grid ${deviceMode !== 'phone' ? 'issue-grid--wide' : ''}`}>
                {analysis.summary.slice(1).map((iss, i) => (
                  <div key={i} className="issue-card card">
                    <h4 className="issue-card-title">{iss.title}</h4>
                    <p className="issue-card-desc">{iss.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );

      case 'sec-categories':
        return (
          <section className="result-section anim-fadeUp" key="cat">
            <STitle n={3}>카테고리별 분류</STitle>
            <div className="card">
              <div className="cat-tabs">{analysis.categories.map((c, i) => (
                <button key={c.name} className={`cat-tab ${catTab === i ? 'cat-tab--active' : ''}`} onClick={() => setCatTab(i)}>{c.name} ({c.articles.length})</button>
              ))}</div>
              {analysis.categories[catTab] && (
                <ul className="cat-list">{analysis.categories[catTab].articles.map(a => (
                  <li key={a.id} className="cat-item">{a.title}</li>
                ))}</ul>
              )}
            </div>
          </section>
        );

      case 'sec-sentiment':
        return (
          <section className="result-section anim-fadeUp" key="sent">
            <STitle n={4}>긍정·부정 평가</STitle>
            <div className="card">
              <div className="sent-bar">
                {analysis.sentiment.overall.positive > 0 && <div className="sent-seg sent-pos" style={{ width: `${analysis.sentiment.overall.positive}%` }}>{analysis.sentiment.overall.positive}%</div>}
                {analysis.sentiment.overall.neutral > 0 && <div className="sent-seg sent-neu" style={{ width: `${analysis.sentiment.overall.neutral}%` }}>{analysis.sentiment.overall.neutral}%</div>}
                {analysis.sentiment.overall.negative > 0 && <div className="sent-seg sent-neg" style={{ width: `${analysis.sentiment.overall.negative}%` }}>{analysis.sentiment.overall.negative}%</div>}
              </div>
              <div className="sent-labels"><span className="c-pos">긍정</span><span className="c-neu">중립</span><span className="c-neg">부정</span></div>
              <p className="sent-assessment">{analysis.sentiment.overallAssessment}</p>
            </div>
          </section>
        );

      case 'sec-keywords':
        return (
          <section className="result-section anim-fadeUp" key="kw">
            <STitle n={5}>핵심 키워드 Top 10</STitle>
            <div className="card">
              <div className="kw-cloud">{analysis.keywords.map((kw, i) => (
                <span key={kw.word} className="kw-chip" style={{ fontSize: `${Math.max(14, 24 - i * 1.5)}px` }}>
                  {kw.word}<span className="kw-count">({kw.count})</span>
                </span>
              ))}</div>
            </div>
          </section>
        );

      case 'sec-prediction':
        return (
          <section className="result-section anim-fadeUp" key="pred">
            <STitle n={6}>미래 전망</STitle>
            <div className={`pred-grid ${deviceMode !== 'phone' ? 'pred-grid--wide' : ''}`}>
              <div className="card pred-card"><span className="pred-badge pred-badge--short">단기 1~2주</span><p className="pred-text">{analysis.prediction.shortTerm}</p></div>
              <div className="card pred-card"><span className="pred-badge pred-badge--mid">중기 1~3개월</span><p className="pred-text">{analysis.prediction.midTerm}</p></div>
            </div>
          </section>
        );

      case 'sec-prayer':
        return (
          <section className="result-section anim-fadeUp" key="prayer" ref={prayerRef}>
            <STitle n={7}>기도문</STitle>
            <div className="prayer-wrap">
              <div className="prayer-tabs">
                {([['personal', '개인 기도'], ['communal', '공동 기도'], ['wednesday', '수요 기도회']] as const).map(([k, l]) => (
                  <button key={k} className={`prayer-tab ${prayerTab === k ? 'prayer-tab--active' : ''}`} onClick={() => setPrayerTab(k)}>{l}</button>
                ))}
              </div>
              <div className="prayer-body">{analysis.prayer[prayerTab]}</div>
              <div className="prayer-actions">
                <button className="btn-prayer btn-prayer--copy" onClick={() => copy(analysis.prayer[prayerTab])}><Copy size={16} /> 복사</button>
                <div className="dl-menu-wrap">
                  <button className="btn-prayer btn-prayer--download" onClick={() => setDlMenuOpen(!dlMenuOpen)}><Download size={16} /> 다운로드 ▾</button>
                  {dlMenuOpen && (
                    <div className="dl-menu">
                      <button onClick={() => downloadAsTxt(analysis.prayer[prayerTab], prayerTab)}>📄 텍스트 (.txt)</button>
                      <button onClick={() => downloadAsPdf(analysis.prayer[prayerTab], prayerTab)}>📑 PDF (.pdf)</button>
                      <button onClick={() => downloadAsImage(analysis.prayer[prayerTab], prayerTab, 'png')}>🖼️ 이미지 (.png)</button>
                      <button onClick={() => downloadAsImage(analysis.prayer[prayerTab], prayerTab, 'jpg')}>📷 이미지 (.jpg)</button>
                    </div>
                  )}
                </div>
                <button className="btn-prayer btn-prayer--share" onClick={() => share(analysis.prayer[prayerTab], `${formatDateKR(date)} 기도문`)}><Share2 size={16} /> {canShare ? '공유' : '공유'}</button>
              </div>
            </div>
          </section>
        );

      case 'sec-articles':
        return (
          <section className="result-section anim-fadeUp" key="articles">
            <STitle n={8}>전체 기사 목록</STitle>
            <div className="card">
              <p className="article-count">총 {articles.length}건의 기사</p>
              <div className="article-table-wrap">
                <table className="article-table">
                  <thead><tr><th>제목</th><th style={{ width: 72 }}>매체</th><th style={{ width: 46 }}>감성</th><th style={{ width: 32 }}>↗</th></tr></thead>
                  <tbody>{articles.map(a => {
                    const s = analysis.sentiment.articles.find(x => x.id === a.id);
                    return (
                      <tr key={a.id}>
                        <td>{a.title}</td>
                        <td className="td-source">{a.source}</td>
                        <td className={`td-sent ${s?.sentiment === 'positive' ? 'c-pos' : s?.sentiment === 'negative' ? 'c-neg' : 'c-neu'}`}>{s?.sentiment === 'positive' ? '긍정' : s?.sentiment === 'negative' ? '부정' : '중립'}</td>
                        <td>{a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="td-link"><ExternalLink size={14} /></a>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          </section>
        );

      default: return null;
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━
  // 랜딩
  // ━━━━━━━━━━━━━━━━━━━━
  if (view === 'landing') return (
    <>
      <style>{GLOBAL_CSS}</style>
      <DeviceToggle />
      <div className={`device-viewport device--${deviceMode}`}>
        <div className="landing-root">
          <section className="hero hero--full">
            {/* Background mesh */}
            <div className="hero-mesh" />
            {/* Glow rings */}
            <div className="hero-glow hero-glow--1" />
            <div className="hero-glow hero-glow--2" />
            <div className="hero-glow hero-glow--3" />
            <div className="hero-glow hero-glow--4" />
            {/* Particles */}
            {[...Array(8)].map((_, i) => <div key={i} className={`hero-particle hero-particle--${i + 1}`} />)}
            {/* News ticker */}
            <div className="hero-ticker">
              <div className="hero-ticker-inner">
                CHRISTIAN NEWS · AI ANALYSIS · PRAYER · REFORMED THEOLOGY · CHRISTIAN NEWS · AI ANALYSIS · PRAYER · REFORMED THEOLOGY ·&nbsp;
              </div>
            </div>
            <div className="hero-ticker hero-ticker--bottom">
              <div className="hero-ticker-inner hero-ticker-inner--rev">
                기독교 · 뉴스분석 · 인공지능 · 기도문 · 개혁신학 · 기독교 · 뉴스분석 · 인공지능 · 기도문 · 개혁신학 ·&nbsp;
              </div>
            </div>

            <div className="hero-inner">
              <div className="hero-live-wrap">
                <span className="hero-live-dot" />
                <span className="hero-live-text"><Zap size={14} /> LIVE AI ANALYSIS</span>
              </div>

              <div className="hero-icon-wrap">
                <div className="hero-icon-glow" />
                <div className="hero-icon-ring" />
                <Cross size={48} />
              </div>
              <h1 className="hero-title">
                <span className="hero-line1">AI가 분석하는</span>
                <span className="hero-line2">기도로 읽는 뉴스</span>
              </h1>
              <p className="hero-sub">매일의 기독교 뉴스를 AI가 자동 수집·분석하고<br />개혁신학 관점의 기도문을 작성해 드립니다</p>

              <div className="hero-actions">
                {/* 날짜 모드 토글 */}
                <div className="date-mode-toggle">
                  <button className={`dmt-btn ${dateMode === 'single' ? 'dmt-btn--active' : ''}`} onClick={() => setDateMode('single')}>하루</button>
                  <button className={`dmt-btn ${dateMode === 'range' ? 'dmt-btn--active' : ''}`} onClick={() => setDateMode('range')}>기간</button>
                  <button className={`dmt-btn ${dateMode === 'month' ? 'dmt-btn--active' : ''}`} onClick={() => setDateMode('month')}>월별</button>
                </div>

                {dateMode === 'single' && (
                  <div className="hero-date-wrap">
                    <Calendar size={20} />
                    <input type="date" value={date} onChange={e => changeDate(e.target.value)} max="2099-12-31" min="2020-01-01" className="hero-date-input" />
                  </div>
                )}
                {dateMode === 'range' && (
                  <div className="hero-date-range">
                    <div className="hero-date-wrap">
                      <Calendar size={18} />
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} max="2099-12-31" min="2020-01-01" className="hero-date-input" />
                    </div>
                    <span className="date-range-sep">~</span>
                    <div className="hero-date-wrap">
                      <Calendar size={18} />
                      <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} max="2099-12-31" min="2020-01-01" className="hero-date-input" />
                    </div>
                  </div>
                )}
                {dateMode === 'month' && (
                  <div className="hero-date-wrap">
                    <Calendar size={20} />
                    <input type="month" value={dateMonth} onChange={e => setDateMonth(e.target.value)} max="2099-12" min="2020-01" className="hero-date-input" />
                  </div>
                )}

                <button className="btn-hero-primary" onClick={() => analyze()} disabled={disabled}>
                  <Newspaper size={20} /> {dateMode === 'single' ? '뉴스 분석 시작' : `${getDateList().length}일간 뉴스 분석`}
                </button>
                <button className="btn-hero-secondary" onClick={enterDemo}>
                  <BookOpen size={18} /> 샘플 미리보기
                </button>
              </div>

              <p className="hero-disclaimer">
                <AlertTriangle size={14} />
                AI 분석은 참고용이며, 기도문은 개혁신학 관점에서 생성됩니다
              </p>

              <div className="hero-steps">
                <div className="hero-step"><Rss size={15} /><span>11개 매체 수집</span></div>
                <ChevronRight size={14} className="hero-step-arrow" />
                <div className="hero-step"><Cpu size={15} /><span>AI 분석</span></div>
                <ChevronRight size={14} className="hero-step-arrow" />
                <div className="hero-step"><BookOpen size={15} /><span>기도문 생성</span></div>
              </div>
            </div>

            {/* PWA 자동 설치 배너 */}
            {showInstallBanner && (
              <div className="install-banner">
                <div className="install-banner-content">
                  <div className="install-banner-icon"><Cross size={24} /></div>
                  <div className="install-banner-text">
                    <strong>기도뉴스 앱 설치</strong>
                    <span>홈 화면에 추가하고 앱처럼 사용하세요</span>
                  </div>
                </div>
                <div className="install-banner-actions">
                  <button className="install-btn" onClick={handleInstall}>설치하기</button>
                  <button className="install-dismiss" onClick={dismissInstall}>나중에</button>
                </div>
              </div>
            )}

            {/* 하단 고정 앱 설치 버튼 (이미 설치된 경우 숨김) */}
            {!isStandalone && (
              <div className="install-fixed">
                <button className="install-fixed-btn" onClick={handleInstall}>
                  <Download size={16} />
                  <span>앱 설치하기</span>
                </button>
              </div>
            )}

            {/* iOS 설치 안내 모달 */}
            {showIosGuide && (
              <div className="ios-guide-overlay" onClick={() => setShowIosGuide(false)}>
                <div className="ios-guide" onClick={e => e.stopPropagation()}>
                  <h3 className="ios-guide-title">iPhone에서 앱 설치하기</h3>
                  <div className="ios-guide-steps">
                    <div className="ios-guide-step">
                      <span className="ios-guide-num">1</span>
                      <span>하단의 <strong>공유 버튼</strong> (□↑)을 탭하세요</span>
                    </div>
                    <div className="ios-guide-step">
                      <span className="ios-guide-num">2</span>
                      <span>스크롤하여 <strong>"홈 화면에 추가"</strong>를 탭하세요</span>
                    </div>
                    <div className="ios-guide-step">
                      <span className="ios-guide-num">3</span>
                      <span>우측 상단 <strong>"추가"</strong>를 탭하면 완료!</span>
                    </div>
                  </div>
                  <button className="ios-guide-close" onClick={() => setShowIosGuide(false)}>확인</button>
                </div>
              </div>
            )}

            <footer className="hero-footer">
              <p>2026 기도로 읽는 뉴스 · Developed by Yijae Shin</p>
            </footer>
          </section>
        </div>
      </div>
    </>
  );

  // ━━━━━━━━━━━━━━━━━━━━
  // 결과
  // ━━━━━━━━━━━━━━━━━━━━
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <DeviceToggle />
      <div className={`device-viewport device--${deviceMode}`}>
        <div className="result-root">
          {/* AppBar */}
          <header className="appbar">
            <div className="appbar-left">
              {isPhone && (
                <button className="appbar-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              )}
              <button className="appbar-logo" onClick={goHome}>
                <Cross size={18} /> <span className="appbar-logo-text">기도로 읽는 뉴스</span>
              </button>
            </div>
            <div className="appbar-right">
              {isDemo && <span className="appbar-demo-badge">SAMPLE</span>}
              <span className="appbar-date">{dateMode === 'single' ? `${formatDateKR(date)} (${getDayOfWeek(date)})` : getDateLabel()}</span>
              {state === 'done' && !isDemo && (
                <button className="appbar-clear-btn" onClick={clearReport} title="결과 삭제">
                  <Trash2 size={15} />
                </button>
              )}
              <button className="appbar-home-btn" onClick={goHome} title="메인으로">
                <Home size={18} />
              </button>
            </div>
          </header>

          <div className="layout">
            {/* Sidebar overlay (phone) */}
            {isPhone && sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* Staircase Sidebar */}
            <aside className={`sidebar ${isPhone ? 'sidebar--phone' : ''} ${isPhone && sidebarOpen ? 'sidebar--open' : ''}`}>
              <div className="sidebar-date-section">
                <label className="sidebar-label">분석 날짜</label>
                <div className="sidebar-date-mode">
                  <button className={`sdm-btn ${dateMode === 'single' ? 'sdm-btn--active' : ''}`} onClick={() => setDateMode('single')}>하루</button>
                  <button className={`sdm-btn ${dateMode === 'range' ? 'sdm-btn--active' : ''}`} onClick={() => setDateMode('range')}>기간</button>
                  <button className={`sdm-btn ${dateMode === 'month' ? 'sdm-btn--active' : ''}`} onClick={() => setDateMode('month')}>월별</button>
                </div>
                {dateMode === 'single' && (
                  <div className="sidebar-date-input-wrap">
                    <Calendar size={14} />
                    <input type="date" value={date} onChange={e => changeDate(e.target.value)} max="2099-12-31" min="2020-01-01" className="sidebar-date-input" />
                  </div>
                )}
                {dateMode === 'range' && (<>
                  <div className="sidebar-date-input-wrap">
                    <Calendar size={14} />
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} max="2099-12-31" min="2020-01-01" className="sidebar-date-input" />
                  </div>
                  <span className="sidebar-range-sep">~</span>
                  <div className="sidebar-date-input-wrap">
                    <Calendar size={14} />
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} max="2099-12-31" min="2020-01-01" className="sidebar-date-input" />
                  </div>
                </>)}
                {dateMode === 'month' && (
                  <div className="sidebar-date-input-wrap">
                    <Calendar size={14} />
                    <input type="month" value={dateMonth} onChange={e => setDateMonth(e.target.value)} max="2099-12" min="2020-01" className="sidebar-date-input" />
                  </div>
                )}
                <button className="sidebar-analyze-btn" onClick={() => analyze()} disabled={disabled}>
                  {state === 'crawling' || state === 'analyzing' ? <><Loader2 size={14} className="spin" /> 분석 중...</> : dateMode === 'single' ? '분석하기' : `${getDateList().length}일 분석`}
                </button>
              </div>

              {/* Staircase navigation */}
              <nav className="stair-nav">
                <span className="stair-nav-label">분석 결과</span>
                <div className="stair-list">
                  <div className="stair-line" />
                  {SECTIONS.map((s, idx) => {
                    const Icon = s.icon;
                    const isActive = activeId === s.id;
                    return (
                      <button key={s.id} className={`stair-item ${isActive ? 'stair-item--active' : ''}`} onClick={() => selectSection(s.id)}>
                        <span className={`stair-dot ${isActive ? 'stair-dot--active' : ''}`}>
                          {idx + 1}
                        </span>
                        <Icon size={14} className="stair-icon" />
                        <span className="stair-label-text">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div className="sidebar-bottom">
                <button className="sidebar-home-btn" onClick={goHome}>메인 화면으로</button>
              </div>
            </aside>

            {/* Content */}
            <main className="content">
              {/* Demo banner */}
              {isDemo && (
                <div className="demo-banner">
                  <div><Sparkles size={16} /><span>샘플 데이터입니다</span></div>
                  <button className="demo-banner-btn" onClick={() => { setIsDemo(false); analyze(); }}>실제 분석</button>
                </div>
              )}

              {/* Progress */}
              {(state === 'crawling' || state === 'analyzing') && (
                <div className="card progress-card">
                  <div className="progress-steps">
                    <StepIndicator active={state === 'crawling'} done={state === 'analyzing'} text="뉴스를 수집하고 있습니다" doneText="뉴스 수집 완료" />
                    {state === 'analyzing' && <StepIndicator active done={false} text="AI가 분석하고 있습니다" />}
                  </div>
                  <p className="progress-hint">보통 10~20초 정도 걸립니다</p>
                </div>
              )}

              {/* Error */}
              {state === 'error' && error && (
                <div className="card error-card">
                  <AlertTriangle size={22} />
                  <div>
                    <p className="error-text">{error}</p>
                    {!error.includes('소진') && !error.includes('관리자') && (
                      <button className="error-retry" onClick={() => analyze(true)} disabled={cooldown}>다시 시도</button>
                    )}
                  </div>
                </div>
              )}

              {/* Active section */}
              {state === 'done' && analysis && meta && (
                <div className="results">
                  {meta.warning && <div className="warning-banner"><AlertTriangle size={16} /><span>{meta.warning}</span></div>}
                  {renderActiveSection()}
                  {!isDemo && (
                    <div className="refresh-row">
                      <button className="refresh-btn" onClick={() => analyze(true)} disabled={disabled}><RefreshCw size={14} /> 새로 분석</button>
                      <button className="refresh-btn refresh-btn--del" onClick={clearReport}><Trash2 size={14} /> 결과 삭제</button>
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>

          {/* FAB - prayer shortcut */}
          {state === 'done' && analysis && activeId !== 'sec-prayer' && (
            <button className="fab" onClick={() => selectSection('sec-prayer')}>
              <BookOpen size={18} /> 기도문
            </button>
          )}

          {/* Toast */}
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </>
  );
}

// ── 서브 컴포넌트 ──

function STitle({ n, children }: { n: number; children: React.ReactNode }) {
  return <h3 className="s-title"><span className="s-title-num">{n}</span>{children}</h3>;
}

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="kpi-card" style={{ '--kpi-color': color } as React.CSSProperties}>
      <div className="kpi-icon">{icon}</div>
      <div><p className="kpi-label">{label}</p><p className="kpi-value">{value}</p></div>
    </div>
  );
}

function StepIndicator({ active, done, text, doneText }: { active: boolean; done: boolean; text: string; doneText?: string }) {
  return (
    <div className="step-ind">
      {done ? (
        <div className="step-done"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#276749" strokeWidth={3} strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg></div>
      ) : active ? (
        <Loader2 size={24} className="spin step-spin" />
      ) : <div className="step-idle" />}
      <span className={`step-text ${done ? 'step-text--done' : active ? 'step-text--active' : ''}`}>{done && doneText ? doneText : text}</span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GLOBAL_CSS = `
/* ── Reset & Tokens ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#F8F6F1; --card:#FFFFFF; --navy:#1E3A5F; --navy-light:#2C5282;
  --gold:#B8860B; --gold-glow:rgba(184,134,11,0.25);
  --ocean:#1E40AF; --ocean-glow:rgba(30,64,175,0.3);
  --text:#1A1A1A; --text-sub:#4A4A4A; --text-muted:#8A8A8A;
  --prayer-bg:#FFF8E7; --prayer-border:#E8D5A3;
  --border:#E2DED6; --border-hover:#CBC7BD;
  --error:#C53030; --success:#276749;
  --radius:14px; --radius-sm:10px; --radius-xl:20px;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.06);
  --shadow:0 2px 12px rgba(0,0,0,0.08);
  --shadow-md:0 4px 24px rgba(0,0,0,0.10);
  --shadow-lg:0 8px 40px rgba(0,0,0,0.14);
  --shadow-glow:0 0 24px var(--gold-glow);
  --transition:250ms cubic-bezier(.4,0,.2,1);
  --font:'Noto Sans KR',sans-serif;
  --font-serif:'Noto Serif KR',serif;
}

/* ── Animations ── */
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes glowPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes heroRing{0%{transform:scale(.6);opacity:.6}100%{transform:scale(1.8);opacity:0}}
@keyframes particleDrift{0%{transform:translate(0,0) scale(1);opacity:.4}50%{opacity:.7}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes livePulse{0%,100%{transform:scale(1);opacity:1;box-shadow:0 0 12px rgba(59,130,246,.8)}50%{transform:scale(1.6);opacity:.2;box-shadow:0 0 24px rgba(59,130,246,.4)}}
@keyframes iconRing{0%{transform:scale(1);opacity:.6}50%{transform:scale(1.15);opacity:.3}100%{transform:scale(1);opacity:.6}}
@keyframes tickerRev{0%{transform:translateX(-50%)}100%{transform:translateX(0)}}
@keyframes neonShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}

.spin{animation:spin 1s linear infinite}
.anim-fadeUp{animation:fadeUp .4s ease both}

/* ══════════════════════════════
   DEVICE TOGGLE
   ══════════════════════════════ */
.device-toggle{
  position:fixed;top:8px;right:8px;z-index:9999;
  display:flex;gap:2px;background:rgba(0,0,0,.75);backdrop-filter:blur(10px);
  border-radius:24px;padding:3px;border:1px solid rgba(255,255,255,.08);
}
.dt-btn{
  width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  background:transparent;color:rgba(255,255,255,.35);transition:all .2s;
}
.dt-btn:hover{color:rgba(255,255,255,.65)}
.dt-btn--active{background:var(--ocean);color:#fff;box-shadow:0 0 12px var(--ocean-glow)}

/* ══════════════════════════════
   DEVICE VIEWPORT
   ══════════════════════════════ */
.device-viewport{margin:0 auto;transition:max-width .4s ease}
.device--phone{max-width:100%}
.device--tablet{max-width:768px}
.device--desktop{max-width:100%}

/* ══════════════════════════════
   LANDING / HERO (Deep Ocean)
   ══════════════════════════════ */
.landing-root{font-family:var(--font);color:var(--text);background:#060a14;min-height:100vh}

.hero{
  position:relative;overflow:hidden;text-align:center;
  padding:80px 20px 80px;
  background:
    radial-gradient(ellipse at 30% 20%,rgba(30,64,175,0.18),transparent 50%),
    radial-gradient(ellipse at 70% 80%,rgba(59,130,246,0.08),transparent 50%),
    radial-gradient(ellipse at 50% 40%,rgba(30,64,175,0.1),transparent 40%),
    radial-gradient(ellipse at 50% 50%,rgba(184,134,11,0.03),transparent 60%),
    linear-gradient(135deg,#060a14 0%,#0a1228 30%,#0d1832 60%,#081020 100%);
}
.hero--full{
  min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:40px 18px;
}

/* Background mesh grid */
.hero-mesh{
  position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(rgba(30,64,175,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(30,64,175,.04) 1px,transparent 1px);
  background-size:60px 60px;
  mask-image:radial-gradient(ellipse at center,rgba(0,0,0,.4) 0%,transparent 70%);
  -webkit-mask-image:radial-gradient(ellipse at center,rgba(0,0,0,.4) 0%,transparent 70%);
}

/* News ticker */
.hero-ticker{
  position:absolute;top:0;left:0;right:0;height:28px;overflow:hidden;pointer-events:none;
  background:rgba(30,64,175,.05);border-bottom:1px solid rgba(59,130,246,.08);
}
.hero-ticker--bottom{
  top:auto;bottom:0;border-bottom:none;border-top:1px solid rgba(59,130,246,.06);
  background:rgba(30,64,175,.03);
}
.hero-ticker-inner{
  display:inline-block;white-space:nowrap;
  font-size:.6rem;font-weight:600;color:rgba(59,130,246,.3);letter-spacing:4px;
  line-height:28px;animation:ticker 25s linear infinite;
}
.hero-ticker-inner--rev{animation:tickerRev 30s linear infinite;color:rgba(59,130,246,.2)}

/* LIVE badge - NEON GRADIENT */
.hero-live-wrap{
  display:inline-flex;align-items:center;gap:10px;margin-bottom:24px;animation:fadeUp .6s ease both;
  background:linear-gradient(135deg,rgba(6,182,212,.1),rgba(59,130,246,.1),rgba(168,85,247,.1));
  border:1.5px solid transparent;border-radius:30px;padding:9px 24px;backdrop-filter:blur(8px);
  background-clip:padding-box;position:relative;
}
.hero-live-wrap::before{
  content:'';position:absolute;inset:-1.5px;border-radius:30px;padding:1.5px;
  background:linear-gradient(135deg,#06b6d4,#3b82f6,#a855f7,#ec4899);
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
  background-size:300% 300%;animation:neonShift 4s ease infinite;
}
.hero-live-dot{
  width:12px;height:12px;border-radius:50%;
  background:linear-gradient(135deg,#06b6d4,#3b82f6);
  animation:livePulse 1.2s ease-in-out infinite;
  box-shadow:0 0 14px rgba(6,182,212,.6),0 0 28px rgba(59,130,246,.3);
}
.hero-live-text{
  font-size:.88rem;font-weight:800;letter-spacing:4px;
  background:linear-gradient(135deg,#67e8f9,#93c5fd,#c4b5fd,#f0abfc);
  background-size:300% 300%;animation:neonShift 4s ease infinite;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  display:flex;align-items:center;gap:6px;
  filter:drop-shadow(0 0 12px rgba(59,130,246,.4));
}
.hero-live-text svg{-webkit-text-fill-color:initial;color:#67e8f9;filter:drop-shadow(0 0 8px rgba(6,182,212,.6))}

/* Glow rings */
.hero-glow{
  position:absolute;border-radius:50%;
  border:1.5px solid rgba(30,64,175,.12);
  animation:heroRing 5s ease-out infinite;pointer-events:none;
}
.hero-glow--1{width:300px;height:300px;top:50%;left:50%;margin:-150px 0 0 -150px;animation-delay:0s;border-color:rgba(59,130,246,.2)}
.hero-glow--2{width:480px;height:480px;top:50%;left:50%;margin:-240px 0 0 -240px;animation-delay:1s;border-color:rgba(30,64,175,.12)}
.hero-glow--3{width:660px;height:660px;top:50%;left:50%;margin:-330px 0 0 -330px;animation-delay:2s;border-color:rgba(59,130,246,.06)}
.hero-glow--4{width:840px;height:840px;top:50%;left:50%;margin:-420px 0 0 -420px;animation-delay:3s;border-color:rgba(30,64,175,.04)}

/* Particles - 8 total */
.hero-particle{position:absolute;border-radius:50%;pointer-events:none;animation:particleDrift 8s ease-in-out infinite}
.hero-particle--1{width:7px;height:7px;background:rgba(59,130,246,.5);top:18%;left:12%;--dx:50px;--dy:-70px;animation-delay:0s}
.hero-particle--2{width:5px;height:5px;background:rgba(96,165,250,.4);top:25%;right:18%;--dx:-40px;--dy:60px;animation-delay:1s}
.hero-particle--3{width:8px;height:8px;background:rgba(184,134,11,.3);bottom:28%;left:22%;--dx:70px;--dy:-50px;animation-delay:2s}
.hero-particle--4{width:6px;height:6px;background:rgba(59,130,246,.4);top:55%;right:12%;--dx:-60px;--dy:-40px;animation-delay:3s}
.hero-particle--5{width:4px;height:4px;background:rgba(251,191,36,.25);bottom:18%;right:30%;--dx:35px;--dy:45px;animation-delay:4s}
.hero-particle--6{width:5px;height:5px;background:rgba(59,130,246,.35);top:40%;left:8%;--dx:45px;--dy:35px;animation-delay:5s}
.hero-particle--7{width:3px;height:3px;background:rgba(96,165,250,.3);bottom:40%;right:8%;--dx:-35px;--dy:-55px;animation-delay:6s}
.hero-particle--8{width:6px;height:6px;background:rgba(30,64,175,.3);top:12%;left:50%;--dx:-20px;--dy:60px;animation-delay:7s}

.hero-inner{position:relative;z-index:1;max-width:520px;margin:0 auto}
.hero-icon-wrap{
  display:inline-flex;align-items:center;justify-content:center;position:relative;
  width:90px;height:90px;border-radius:50%;color:#fff;margin-bottom:26px;
  background:rgba(30,64,175,.12);backdrop-filter:blur(10px);
  border:1.5px solid rgba(59,130,246,.2);
  box-shadow:0 0 40px rgba(30,64,175,.2),inset 0 0 30px rgba(30,64,175,.08);
}
.hero-icon-glow{
  position:absolute;inset:-18px;border-radius:50%;
  background:radial-gradient(circle,rgba(59,130,246,.25) 0%,transparent 65%);
  animation:glowPulse 3s ease-in-out infinite;
}
.hero-icon-ring{
  position:absolute;inset:-6px;border-radius:50%;
  border:1px solid rgba(59,130,246,.15);
  animation:iconRing 4s ease-in-out infinite;
}
.hero-title{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px}
.hero-line1{font-size:1.2rem;color:rgba(147,197,253,.75);font-weight:500;letter-spacing:2px;animation:fadeUp .8s ease both}
.hero-line2{
  font-size:2.4rem;font-weight:800;line-height:1.15;
  background:linear-gradient(135deg,#FFFFFF 0%,#93c5fd 35%,#60a5fa 50%,#FFFFFF 80%);
  background-size:200% 200%;animation:fadeUp .8s ease .15s both,gradientShift 5s ease infinite;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  filter:drop-shadow(0 2px 16px rgba(59,130,246,.3));
}
.hero-sub{font-size:1rem;color:rgba(186,200,220,.75);line-height:1.8;margin-bottom:32px;animation:fadeUp .8s ease .3s both}
.hero-actions{display:flex;flex-direction:column;gap:12px;align-items:center;max-width:360px;margin:0 auto;animation:fadeUp .8s ease .45s both}

/* Date mode toggle (hero) */
.date-mode-toggle{
  display:flex;width:100%;gap:2px;background:rgba(30,64,175,.06);border-radius:var(--radius);padding:3px;
  border:1px solid rgba(30,64,175,.1);
}
.dmt-btn{
  flex:1;min-height:36px;border:none;border-radius:10px;cursor:pointer;
  font-size:.82rem;font-weight:600;color:rgba(255,255,255,.4);
  background:transparent;transition:all .2s;
}
.dmt-btn:hover{color:rgba(255,255,255,.6)}
.dmt-btn--active{background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;box-shadow:0 2px 8px rgba(30,64,175,.3)}

.hero-date-range{display:flex;align-items:center;gap:6px;width:100%}
.hero-date-range .hero-date-wrap{flex:1}
.date-range-sep{color:rgba(255,255,255,.4);font-size:1.1rem;font-weight:700;flex-shrink:0}

.hero-date-wrap{
  display:flex;align-items:center;gap:8px;width:100%;
  background:rgba(30,64,175,.05);backdrop-filter:blur(8px);
  border:1px solid rgba(30,64,175,.15);border-radius:var(--radius);
  padding:10px 16px;color:#fff;transition:border-color var(--transition);
}
.hero-date-wrap:focus-within{border-color:rgba(30,64,175,.35)}
.hero-date-input{background:none;border:none;color:#fff;font-size:.95rem;outline:none;width:100%;color-scheme:dark}

.btn-hero-primary{
  width:100%;min-height:52px;border-radius:var(--radius);border:none;cursor:pointer;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;font-size:1.05rem;font-weight:700;
  display:flex;align-items:center;justify-content:center;gap:8px;
  box-shadow:0 4px 20px rgba(30,64,175,.3);transition:all var(--transition);
}
.btn-hero-primary:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(30,64,175,.4)}
.btn-hero-primary:disabled{opacity:.4;cursor:not-allowed;transform:none}

.btn-hero-secondary{
  width:100%;min-height:46px;border-radius:var(--radius);cursor:pointer;
  background:rgba(30,64,175,.05);color:rgba(255,255,255,.8);font-size:.95rem;font-weight:500;
  border:1.5px solid rgba(30,64,175,.18);
  display:flex;align-items:center;justify-content:center;gap:8px;
  transition:all var(--transition);
}
.btn-hero-secondary:hover{background:rgba(30,64,175,.1);border-color:rgba(30,64,175,.35)}

.hero-disclaimer{
  margin-top:22px;display:inline-flex;align-items:center;gap:6px;
  font-size:.72rem;color:rgba(251,191,36,.5);
  background:linear-gradient(135deg,rgba(251,191,36,.06),rgba(251,191,36,.02));
  border:1px solid rgba(251,191,36,.1);border-radius:20px;
  padding:6px 14px;animation:fadeUp .8s ease .6s both;
}

.hero-steps{
  display:flex;align-items:center;justify-content:center;gap:5px;
  margin-top:26px;animation:fadeUp .8s ease .75s both;flex-wrap:wrap;
}
.hero-step{
  display:flex;align-items:center;gap:4px;
  background:rgba(30,64,175,.05);border:1px solid rgba(30,64,175,.1);
  border-radius:20px;padding:6px 12px;
  color:rgba(147,180,220,.55);font-size:.75rem;font-weight:500;
}
.hero-step-arrow{color:rgba(30,64,175,.2);flex-shrink:0}

/* PWA Install Banner */
.install-banner{
  position:relative;z-index:2;max-width:380px;margin:24px auto 0;
  background:rgba(30,64,175,.12);backdrop-filter:blur(16px);
  border:1.5px solid rgba(59,130,246,.25);border-radius:var(--radius);
  padding:16px;animation:fadeUp .5s ease both;
}
.install-banner-content{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.install-banner-icon{
  width:48px;height:48px;border-radius:12px;flex-shrink:0;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 12px rgba(30,64,175,.3);
}
.install-banner-text{display:flex;flex-direction:column;gap:2px}
.install-banner-text strong{font-size:.95rem;color:#fff;font-weight:700}
.install-banner-text span{font-size:.78rem;color:rgba(186,200,220,.7)}
.install-banner-actions{display:flex;gap:8px}
.install-btn{
  flex:1;min-height:40px;border:none;border-radius:10px;cursor:pointer;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;font-size:.88rem;font-weight:700;
  box-shadow:0 4px 14px rgba(30,64,175,.3);transition:all .2s;
}
.install-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(30,64,175,.4)}
.install-dismiss{
  min-height:40px;padding:0 16px;border:1px solid rgba(255,255,255,.15);border-radius:10px;
  background:none;color:rgba(255,255,255,.5);font-size:.82rem;cursor:pointer;transition:all .2s;
}
.install-dismiss:hover{background:rgba(255,255,255,.05);color:rgba(255,255,255,.7)}

/* 하단 고정 앱 설치 버튼 */
.install-fixed{
  position:relative;z-index:2;text-align:center;margin-top:20px;
  animation:fadeUp .8s ease .85s both;
}
.install-fixed-btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:10px 28px;border-radius:50px;border:1.5px solid rgba(59,130,246,.25);
  background:rgba(30,64,175,.08);backdrop-filter:blur(8px);
  color:rgba(147,197,253,.85);font-size:.85rem;font-weight:600;
  cursor:pointer;transition:all .25s;
}
.install-fixed-btn:hover{
  background:rgba(30,64,175,.15);border-color:rgba(59,130,246,.45);
  color:#fff;transform:translateY(-2px);
  box-shadow:0 4px 20px rgba(30,64,175,.25);
}

/* iOS 설치 안내 모달 */
.ios-guide-overlay{
  position:fixed;inset:0;z-index:9999;
  background:rgba(0,0,0,.65);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;
  padding:20px;animation:fadeIn .2s ease;
}
.ios-guide{
  background:linear-gradient(135deg,#1a1a2e,#16213e);
  border:1px solid rgba(59,130,246,.2);border-radius:20px;
  padding:28px 24px;max-width:340px;width:100%;
  box-shadow:0 20px 60px rgba(0,0,0,.5);animation:fadeUp .3s ease;
}
.ios-guide-title{
  font-size:1.1rem;font-weight:700;color:#fff;text-align:center;margin-bottom:20px;
}
.ios-guide-steps{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.ios-guide-step{display:flex;align-items:flex-start;gap:10px;color:rgba(200,210,230,.85);font-size:.88rem;line-height:1.5}
.ios-guide-num{
  width:26px;height:26px;border-radius:50%;flex-shrink:0;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;
  font-size:.72rem;font-weight:700;
  display:flex;align-items:center;justify-content:center;
}
.ios-guide-step strong{color:#93c5fd}
.ios-guide-close{
  width:100%;min-height:42px;border:none;border-radius:12px;cursor:pointer;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;
  font-size:.92rem;font-weight:700;transition:all .2s;
}
.ios-guide-close:hover{opacity:.9}

.hero-footer{
  position:absolute;bottom:14px;left:0;right:0;text-align:center;
  animation:fadeUp .8s ease .9s both;
}
.hero-footer p{font-size:.65rem;color:rgba(180,170,175,.3);letter-spacing:.5px}

/* ══════════════════════════════
   RESULT LAYOUT
   ══════════════════════════════ */
.result-root{font-family:var(--font);color:var(--text);background:var(--bg);min-height:100vh}

/* AppBar */
.appbar{
  position:sticky;top:0;z-index:100;height:50px;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 14px;border-bottom:1px solid rgba(30,64,175,.06);
  background:rgba(15,15,19,.95);backdrop-filter:blur(12px);
  box-shadow:0 1px 6px rgba(0,0,0,.2);
}
.appbar-left{display:flex;align-items:center;gap:6px}
.appbar-menu{background:none;border:none;color:#fff;cursor:pointer;padding:4px;display:flex;align-items:center}
.appbar-logo{background:none;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;gap:6px;font-weight:700;font-size:.85rem}
.appbar-logo-text{color:rgba(255,255,255,.85)}
.appbar-right{display:flex;align-items:center;gap:8px}
.appbar-demo-badge{font-size:.6rem;font-weight:700;color:var(--gold);background:color-mix(in srgb,var(--gold) 15%,transparent);border-radius:20px;padding:2px 8px;letter-spacing:1px}
.appbar-date{font-size:.75rem;color:rgba(255,255,255,.55)}
.appbar-clear-btn{
  background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.2);
  color:rgba(252,165,165,.9);cursor:pointer;padding:5px 7px;border-radius:8px;
  display:flex;align-items:center;transition:all .2s;
}
.appbar-clear-btn:hover{background:rgba(239,68,68,.25);border-color:rgba(239,68,68,.4)}
.appbar-home-btn{
  background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2);
  color:rgba(147,197,253,.9);cursor:pointer;padding:5px 7px;border-radius:8px;
  display:flex;align-items:center;transition:all .2s;
}
.appbar-home-btn:hover{background:rgba(59,130,246,.2);border-color:rgba(59,130,246,.4)}

/* Layout */
.layout{display:flex;min-height:calc(100vh - 50px);position:relative}

/* ══════════════════════════════
   STAIRCASE SIDEBAR
   ══════════════════════════════ */
.sidebar{
  width:220px;min-width:220px;
  background:linear-gradient(180deg,#141420 0%,#1a1a28 100%);
  border-right:1px solid rgba(255,255,255,.05);
  position:sticky;top:50px;height:calc(100vh - 50px);
  overflow-y:auto;display:flex;flex-direction:column;
  transition:transform .3s cubic-bezier(.4,0,.2,1);
}
.sidebar--phone{
  position:fixed;top:50px;left:0;bottom:0;z-index:30;width:260px;
  transform:translateX(-100%);
}
.sidebar--phone.sidebar--open{transform:translateX(0)}
.sidebar-overlay{
  position:fixed;inset:0;top:50px;background:rgba(0,0,0,.45);
  z-index:25;backdrop-filter:blur(2px);
}

/* Sidebar date mode */
.sidebar-date-mode{display:flex;gap:2px;margin-bottom:8px;background:rgba(255,255,255,.03);border-radius:6px;padding:2px}
.sdm-btn{
  flex:1;min-height:26px;border:none;border-radius:5px;cursor:pointer;
  font-size:.68rem;font-weight:600;color:rgba(255,255,255,.3);background:transparent;transition:all .15s;
}
.sdm-btn:hover{color:rgba(255,255,255,.5)}
.sdm-btn--active{background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff}
.sidebar-range-sep{display:block;text-align:center;color:rgba(255,255,255,.25);font-size:.72rem;font-weight:700;margin:2px 0}

.sidebar-date-section{padding:14px;border-bottom:1px solid rgba(255,255,255,.06)}
.sidebar-label{font-size:.6rem;color:rgba(255,255,255,.3);display:block;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase;font-weight:600}
.sidebar-date-input-wrap{
  display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.08);border-radius:8px;
  padding:7px 10px;margin-bottom:8px;transition:border-color var(--transition);
  background:rgba(255,255,255,.03);
}
.sidebar-date-input-wrap:focus-within{border-color:rgba(30,64,175,.3)}
.sidebar-date-input{border:none;outline:none;font-size:.78rem;color:rgba(255,255,255,.75);width:100%;background:none;color-scheme:dark}
.sidebar-analyze-btn{
  width:100%;min-height:34px;border-radius:8px;border:none;cursor:pointer;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;font-size:.78rem;font-weight:600;
  display:flex;align-items:center;justify-content:center;gap:4px;
  transition:all var(--transition);
}
.sidebar-analyze-btn:hover{opacity:.9}
.sidebar-analyze-btn:disabled{opacity:.3;cursor:not-allowed}

/* Staircase nav */
.stair-nav{flex:1;padding:14px 0}
.stair-nav-label{
  display:block;font-size:.58rem;color:rgba(255,255,255,.22);font-weight:600;
  padding:0 14px;margin-bottom:10px;letter-spacing:2px;text-transform:uppercase;
}
.stair-list{position:relative;padding:0 10px}
.stair-line{
  position:absolute;left:24px;top:18px;bottom:18px;width:1.5px;
  background:linear-gradient(180deg,rgba(30,64,175,.15),rgba(184,134,11,.08),rgba(30,64,175,.15));
}
.stair-item{
  display:flex;align-items:center;gap:8px;width:100%;padding:9px 8px;border:none;
  background:transparent;cursor:pointer;text-align:left;
  border-radius:8px;transition:all .2s ease;position:relative;
}
.stair-item:hover{background:rgba(255,255,255,.03)}
.stair-item--active{background:rgba(30,64,175,.06)}
.stair-dot{
  width:28px;height:28px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:.68rem;font-weight:700;
  background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.08);
  color:rgba(255,255,255,.25);transition:all .25s ease;position:relative;z-index:1;
}
.stair-dot--active{
  background:linear-gradient(135deg,#1E40AF,#3B82F6);border-color:transparent;
  color:#fff;box-shadow:0 0 14px rgba(30,64,175,.35);
}
.stair-icon{color:rgba(255,255,255,.2);flex-shrink:0;transition:color .2s}
.stair-item--active .stair-icon{color:rgba(30,64,175,.6)}
.stair-label-text{font-size:.8rem;color:rgba(255,255,255,.35);transition:all .2s}
.stair-item--active .stair-label-text{color:rgba(255,255,255,.88);font-weight:600}

.sidebar-bottom{padding:12px 14px;border-top:1px solid rgba(255,255,255,.05)}
.sidebar-home-btn{
  width:100%;padding:7px;border-radius:8px;border:1px solid rgba(255,255,255,.08);
  background:none;color:rgba(255,255,255,.35);font-size:.78rem;cursor:pointer;
  transition:all var(--transition);
}
.sidebar-home-btn:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.6)}

/* ══════════════════════════════
   CONTENT
   ══════════════════════════════ */
.content{flex:1;padding:20px 18px 80px;min-width:0}

/* Demo banner */
.demo-banner{
  background:linear-gradient(135deg,color-mix(in srgb,var(--gold) 6%,transparent),color-mix(in srgb,var(--gold) 3%,transparent));
  border:1px solid color-mix(in srgb,var(--gold) 18%,transparent);border-radius:var(--radius-sm);
  padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  animation:fadeIn .4s ease;
}
.demo-banner>div{display:flex;align-items:center;gap:5px;color:var(--gold);font-size:.82rem;font-weight:500}
.demo-banner-btn{
  min-height:32px;padding:0 12px;border-radius:8px;border:none;cursor:pointer;
  background:var(--navy);color:#fff;font-size:.78rem;font-weight:600;white-space:nowrap;
}

/* Cards */
.card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  padding:18px;box-shadow:var(--shadow-sm);transition:all var(--transition);
}
.card:hover{box-shadow:var(--shadow);border-color:var(--border-hover)}

/* Progress */
.progress-card{animation:fadeUp .5s ease}
.progress-steps{display:flex;flex-direction:column;gap:12px}
.progress-hint{margin-top:14px;text-align:center;font-size:.82rem;color:var(--text-muted)}
.step-ind{display:flex;align-items:center;gap:10px}
.step-done{width:24px;height:24px;border-radius:50%;background:#F0FFF4;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step-spin{color:var(--navy);flex-shrink:0}
.step-idle{width:24px;height:24px;border-radius:50%;background:#E2E8F0;flex-shrink:0}
.step-text{font-size:.95rem;color:var(--text-sub)}
.step-text--done{color:var(--success)}
.step-text--active{color:var(--navy);font-weight:700}

/* Error */
.error-card{display:flex;align-items:flex-start;gap:10px;border-color:#FED7D7;background:#FFF5F5;animation:fadeUp .5s ease}
.error-card>svg{color:var(--error);flex-shrink:0;margin-top:2px}
.error-text{font-size:.95rem;color:var(--error);line-height:1.5}
.error-retry{
  margin-top:8px;min-height:38px;padding:0 16px;border-radius:8px;
  border:none;cursor:pointer;background:var(--error);color:#fff;font-size:.85rem;font-weight:600;
}
.error-retry:disabled{opacity:.4;cursor:not-allowed}

/* Warning */
.warning-banner{
  display:flex;align-items:flex-start;gap:8px;
  background:#FFFFF0;border:1px solid #FEFCBF;border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;
}
.warning-banner>svg{color:#B7791F;flex-shrink:0;margin-top:2px}
.warning-banner>span{font-size:.85rem;color:#744210;line-height:1.5}

/* Results container */
.results{animation:fadeUp .4s ease}
.result-section{margin-bottom:8px}

/* Section title */
.s-title{
  font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:14px;
  display:flex;align-items:center;gap:8px;
  padding-bottom:10px;border-bottom:2px solid var(--border);
}
.s-title-num{
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:50%;
  background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;
  font-size:.7rem;font-weight:700;flex-shrink:0;
}

/* ── KPI ── */
.kpi-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
.kpi-grid--wide{grid-template-columns:repeat(3,1fr)}
.kpi-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:14px;display:flex;align-items:center;gap:10px;
  box-shadow:var(--shadow-sm);transition:all var(--transition);
  border-left:3px solid var(--kpi-color);
}
.kpi-card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.kpi-icon{
  width:38px;height:38px;border-radius:10px;flex-shrink:0;
  background:color-mix(in srgb,var(--kpi-color) 10%,transparent);color:var(--kpi-color);
  display:flex;align-items:center;justify-content:center;
}
.kpi-label{font-size:.72rem;color:var(--text-muted)}
.kpi-value{font-size:1.3rem;font-weight:700;color:var(--kpi-color)}

/* ── Stats ── */
.stat-chips{display:flex;flex-wrap:wrap;gap:6px}
.stat-chip{
  font-size:.78rem;font-weight:500;color:var(--navy);
  background:color-mix(in srgb,var(--navy) 6%,transparent);
  border-radius:20px;padding:4px 11px;
}
.stat-chip strong{font-weight:700}
.stat-note{margin-top:8px;font-size:.78rem;color:var(--text-sub)}
.stat-note.muted{color:var(--text-muted)}

/* ── Issues ── */
.issue-hero{
  background:linear-gradient(135deg,#F0F4FF,#EBF0FF);
  border-left:4px solid #1E40AF;border-radius:var(--radius);
  padding:18px;margin-bottom:12px;
  box-shadow:var(--shadow-sm);transition:all var(--transition);
}
.issue-hero:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.issue-hero-badge{
  display:inline-block;font-size:.68rem;font-weight:700;color:#1E40AF;
  background:rgba(30,64,175,.07);border-radius:20px;padding:2px 10px;margin-bottom:6px;
}
.issue-hero-title{font-size:1.1rem;font-weight:700;color:var(--text);line-height:1.4;margin-bottom:5px}
.issue-hero-desc{font-size:.9rem;color:var(--text-sub);line-height:1.7}
.issue-grid{display:flex;flex-direction:column;gap:10px}
.issue-grid--wide{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.issue-card{border-left:3px solid var(--navy) !important}
.issue-card-title{font-size:.95rem;font-weight:700;color:var(--text);line-height:1.4;margin-bottom:4px}
.issue-card-desc{font-size:.85rem;color:var(--text-sub);line-height:1.6}

/* ── Categories ── */
.cat-tabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.cat-tab{
  font-size:.78rem;font-weight:500;min-height:32px;padding:0 12px;border-radius:8px;
  border:none;cursor:pointer;transition:all .15s ease;
  background:color-mix(in srgb,var(--navy) 6%,transparent);color:var(--navy);
}
.cat-tab--active{background:var(--navy);color:#fff}
.cat-list{list-style:none;display:flex;flex-direction:column;gap:5px}
.cat-item{font-size:.88rem;color:var(--text-sub);line-height:1.5;padding:4px 0 4px 10px;border-left:3px solid color-mix(in srgb,var(--navy) 18%,transparent)}

/* ── Sentiment ── */
.sent-bar{display:flex;border-radius:14px;overflow:hidden;height:30px;margin-bottom:6px}
.sent-seg{display:flex;align-items:center;justify-content:center;color:#fff;font-size:.78rem;font-weight:700;min-width:30px}
.sent-pos{background:var(--navy-light)}.sent-neu{background:#A0AEC0}.sent-neg{background:var(--error)}
.sent-labels{display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:12px}
.c-pos{color:var(--navy-light)}.c-neu{color:#A0AEC0}.c-neg{color:var(--error)}
.sent-assessment{font-size:.9rem;color:var(--text-sub);line-height:1.8}

/* ── Keywords ── */
.kw-cloud{display:flex;flex-wrap:wrap;gap:7px}
.kw-chip{
  color:var(--navy);font-weight:500;
  background:color-mix(in srgb,var(--navy) 6%,transparent);border-radius:20px;padding:5px 12px;
  transition:all var(--transition);
}
.kw-chip:hover{background:color-mix(in srgb,var(--navy) 10%,transparent);transform:scale(1.05)}
.kw-count{color:color-mix(in srgb,var(--navy) 30%,transparent);margin-left:3px;font-size:.68rem}

/* ── Prediction ── */
.pred-grid{display:flex;flex-direction:column;gap:10px}
.pred-grid--wide{display:grid;grid-template-columns:1fr 1fr}
.pred-card{position:relative;overflow:hidden}
.pred-card::before{
  content:'';position:absolute;top:0;left:0;width:100%;height:3px;
  background:linear-gradient(90deg,var(--navy),var(--gold));
}
.pred-badge{display:inline-block;font-size:.68rem;font-weight:700;border-radius:20px;padding:2px 10px;margin-bottom:8px}
.pred-badge--short{color:var(--navy);background:color-mix(in srgb,var(--navy) 7%,transparent)}
.pred-badge--mid{color:var(--gold);background:color-mix(in srgb,var(--gold) 8%,transparent)}
.pred-text{font-size:.9rem;color:var(--text-sub);line-height:1.8}

/* ── Prayer ── */
.prayer-wrap{background:var(--card);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid var(--prayer-border)}
.prayer-tabs{display:flex;border-bottom:1px solid var(--prayer-border)}
.prayer-tab{
  flex:1;min-height:42px;font-size:.82rem;font-weight:400;border:none;cursor:pointer;
  background:transparent;color:var(--text-sub);border-bottom:3px solid transparent;
  transition:all .15s ease;
}
.prayer-tab--active{background:var(--prayer-bg);color:var(--gold);font-weight:600;border-bottom-color:var(--gold)}
.prayer-body{
  padding:20px 18px;background:var(--prayer-bg);white-space:pre-wrap;
  font-size:1.05rem;line-height:2;color:var(--text);font-family:var(--font-serif);
}
.prayer-actions{display:flex;gap:6px;padding:10px 18px;background:var(--prayer-bg);flex-wrap:wrap}
.btn-prayer{
  display:flex;align-items:center;gap:5px;min-height:36px;padding:0 14px;border-radius:8px;
  border:none;cursor:pointer;font-size:.82rem;font-weight:600;transition:all var(--transition);
}
.btn-prayer:hover{transform:translateY(-1px)}
.btn-prayer--copy{background:var(--navy);color:#fff}
.btn-prayer--download{background:#1E40AF;color:#fff}
.btn-prayer--share{background:var(--gold);color:#fff}
.dl-menu-wrap{position:relative}
.dl-menu{
  position:absolute;bottom:calc(100% + 6px);left:0;z-index:20;
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  box-shadow:var(--shadow-md);overflow:hidden;min-width:170px;animation:fadeUp .2s ease;
}
.dl-menu button{
  display:block;width:100%;padding:10px 14px;border:none;background:none;
  text-align:left;font-size:.82rem;cursor:pointer;color:var(--text);
  transition:background .15s;
}
.dl-menu button:hover{background:var(--bg)}
.dl-menu button:not(:last-child){border-bottom:1px solid var(--border)}

/* ── Articles ── */
.article-count{font-size:.82rem;color:var(--text-muted);margin-bottom:10px;font-weight:600}
.article-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.article-table{width:100%;text-align:left;border-collapse:collapse}
.article-table th{padding:7px 5px;font-size:.7rem;color:var(--navy);border-bottom:2px solid color-mix(in srgb,var(--navy) 10%,transparent);white-space:nowrap}
.article-table td{padding:7px 5px;font-size:.78rem;border-bottom:1px solid var(--border)}
.article-table tbody tr:hover{background:var(--bg)}
.td-source{font-size:.68rem;color:var(--text-muted);white-space:nowrap}
.td-sent{font-size:.68rem;font-weight:600;white-space:nowrap}
.td-link{color:var(--navy)}

.refresh-row{text-align:center;padding-top:6px;display:flex;justify-content:center;gap:16px}
.refresh-btn{
  display:inline-flex;align-items:center;gap:4px;font-size:.78rem;color:var(--text-muted);
  background:none;border:none;cursor:pointer;text-decoration:underline;
}
.refresh-btn:disabled{opacity:.4;cursor:not-allowed}
.refresh-btn--del{color:var(--error)}

/* ── FAB ── */
.fab{
  position:fixed;bottom:18px;right:18px;z-index:40;
  display:flex;align-items:center;gap:5px;padding:10px 18px;border-radius:50px;
  background:linear-gradient(135deg,var(--gold),#D4A017);color:#fff;
  font-size:.85rem;font-weight:700;border:none;cursor:pointer;
  box-shadow:var(--shadow-lg),var(--shadow-glow);
  transition:all var(--transition);animation:fadeUp .5s ease .3s both;
}
.fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:var(--shadow-lg),0 0 28px var(--gold-glow)}

/* ── Toast ── */
.toast{
  position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:50;
  border-radius:50px;padding:9px 20px;
  background:rgba(22,43,69,.88);backdrop-filter:blur(8px);color:#fff;font-size:.85rem;
  box-shadow:var(--shadow-md);animation:fadeUp .3s ease;
}

/* ══════════════════════════════
   DEVICE-SPECIFIC OVERRIDES
   ══════════════════════════════ */
/* Tablet */
.device--tablet .sidebar{width:200px;min-width:200px}
.device--tablet .hero-line2{font-size:2.4rem}

/* Desktop */
.device--desktop .sidebar{width:240px;min-width:240px}
.device--desktop .hero-line2{font-size:2.6rem}
.device--desktop .content{max-width:780px}

/* Phone-specific */
.device--phone .hero-line2{font-size:1.9rem}
.device--phone .hero-sub{font-size:.88rem}
.device--phone .hero-step-arrow{display:none}
.device--phone .hero-steps{gap:4px}
.device--phone .hero-step{font-size:.7rem;padding:5px 10px}
.device--phone .content{padding:14px 12px 80px}
`;
