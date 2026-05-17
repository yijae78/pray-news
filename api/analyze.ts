import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── 타입 (서버사이드 독립) ──
interface Article {
  id: string;
  title: string;
  description: string;
  source: string;
}

// ── 프롬프트 ──

const SYSTEM_INSTRUCTION = `당신은 한국 기독교 뉴스 분석 전문가입니다.
개혁주의(칼빈주의) 신학 관점에서 분석하며, 웨스트민스터 신앙고백을 기준으로 합니다.
반드시 한국어로 작성하고, 주어진 JSON 스키마를 정확히 따르세요.`;

function buildAnalysisPrompt(articles: Article[], date: string): string {
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.title}] — ${a.description || '요약 없음'} (출처: ${a.source})`)
    .join('\n');

  return `${date}의 한국 기독교 뉴스 ${articles.length}건을 분석하세요:

${articleList}

다음 7가지 항목을 JSON으로 분석하세요:

1. stats: 매체별 기사 수 집계. { source: string, count: number }[]
2. summary: 주요 이슈 5개. 각 이슈는 { title, description, relatedArticleIds[] }
3. categories: 카테고리별 분류. 카테고리: 교단행정, 선교, 교육, 사회참여, 신학, 이단경보. { name, articles: {id, title}[] }[]
4. sentiment: 기사별 긍/부정 + 전체 비율 + 종합 평가.
   { articles: {id, title, sentiment}[], overall: {positive, negative, neutral}, overallAssessment: string }
5. keywords: 핵심 키워드 Top 10. { word, count }[]
6. prediction: 단기(1-2주) + 중기(1-3개월) 전망. { shortTerm, midTerm }
7. prayer: 기도문 3종. 세 기도문은 서로 연결성과 통일성을 유지해야 합니다. 같은 뉴스 이슈를 다루되 형식만 달라야 합니다.

   - personal: 개인 기도제목 (번호 형식). 오늘 뉴스의 핵심 내용을 중심으로 기도제목을 번호 형식(1. 2. 3. 4. ...)으로 나열합니다. 각 기도제목은 간결하고 핵심적인 한 문장 기도로 작성합니다. 최소 5개 이상, 최대 10개. 예시:
     "1. 한국교회의 연합과 일치를 위해 기도합니다. 분열과 갈등을 넘어 그리스도 안에서 하나 되게 하소서.
      2. 선교사들의 안전과 사역을 위해 기도합니다..."

   - communal: 공동기도 500자. 주일 예배 후 함께 드리는 서술식 기도문. 반드시 관련된 성경구절을 최소 1개 이상 인용하여 기도문 안에 자연스럽게 녹여 넣으세요. 성경구절은 "(요한복음 3:16)" 같은 형식으로 표기합니다.

   - wednesday: 수요기도회용 700자. 두 부분으로 구성합니다:
     [1부] 서술식 중보기도문 (목사가 인도하는 형태, 500자)
     [2부] 기도제목 3가지를 번호 형식으로 나열 (각 50자 내외)
     두 부분은 빈 줄로 구분하고, 기도제목 앞에 "◆ 이번 주 기도제목"이라고 표기합니다.

기도문 작성 원칙:
- 삼위일체 하나님께 드리는 기도 (찬양→감사→고백→중보(뉴스반영)→소망→예수님 이름으로)
- 뉴스 이슈를 중보기도에 자연스럽게 반영
- 세 기도문은 같은 주제와 이슈를 공유하되 형식(번호형/서술형)만 다르게
- 금지: 번영신학, 무속적 표현, 이단 교리, 정치적 편향
- 어투: 존경스러우면서 따뜻한 한국어`;
}

// ── responseSchema ──

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    stats: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source: { type: 'string' as const },
          count: { type: 'number' as const },
        },
        required: ['source', 'count'],
      },
    },
    summary: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          description: { type: 'string' as const },
          relatedArticleIds: { type: 'array' as const, items: { type: 'string' as const } },
        },
        required: ['title', 'description', 'relatedArticleIds'],
      },
    },
    categories: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          articles: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                id: { type: 'string' as const },
                title: { type: 'string' as const },
              },
              required: ['id', 'title'],
            },
          },
        },
        required: ['name', 'articles'],
      },
    },
    sentiment: {
      type: 'object' as const,
      properties: {
        articles: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              title: { type: 'string' as const },
              sentiment: { type: 'string' as const, enum: ['positive', 'negative', 'neutral'] },
            },
            required: ['id', 'title', 'sentiment'],
          },
        },
        overall: {
          type: 'object' as const,
          properties: {
            positive: { type: 'number' as const },
            negative: { type: 'number' as const },
            neutral: { type: 'number' as const },
          },
          required: ['positive', 'negative', 'neutral'],
        },
        overallAssessment: { type: 'string' as const },
      },
      required: ['articles', 'overall', 'overallAssessment'],
    },
    keywords: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          word: { type: 'string' as const },
          count: { type: 'number' as const },
        },
        required: ['word', 'count'],
      },
    },
    prediction: {
      type: 'object' as const,
      properties: {
        shortTerm: { type: 'string' as const },
        midTerm: { type: 'string' as const },
      },
      required: ['shortTerm', 'midTerm'],
    },
    prayer: {
      type: 'object' as const,
      properties: {
        personal: { type: 'string' as const },
        communal: { type: 'string' as const },
        wednesday: { type: 'string' as const },
      },
      required: ['personal', 'communal', 'wednesday'],
    },
  },
  required: ['stats', 'summary', 'categories', 'sentiment', 'keywords', 'prediction', 'prayer'],
};

// ── 에러 메시지 ──

function getGeminiErrorMessage(err: unknown): { message: string; code?: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API key expired') || msg.includes('API_KEY_INVALID')) {
    return { message: 'API 키가 만료되었거나 유효하지 않습니다. 새 키를 발급받아 다시 입력해 주세요.', code: 'INVALID_API_KEY' };
  }
  if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return { message: 'API 키에 권한이 없습니다. Generative Language API가 활성화되어 있는지 확인하세요.', code: 'PERMISSION_DENIED' };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return { message: '오늘 AI 분석 횟수가 소진되었습니다. 내일 다시 시도해주세요.', code: 'QUOTA_EXCEEDED' };
  }
  if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
    return { message: 'AI 분석 요청에 문제가 발생했습니다. 다시 시도해주세요.', code: 'BAD_REQUEST' };
  }
  if (msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) {
    return { message: 'AI 분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', code: 'TIMEOUT' };
  }
  return { message: '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { articles, date, apiKey } = req.body as { articles: Article[]; date: string; apiKey?: string };
  if (!articles?.length) {
    return res.status(400).json({ error: '분석할 뉴스가 없습니다' });
  }

  const userKey = (apiKey || '').trim();
  if (!userKey) {
    return res.status(400).json({
      error: 'Gemini API 키가 필요합니다. 첫 페이지에서 키를 입력해 주세요.',
      code: 'NO_API_KEY',
    });
  }
  if (!userKey.startsWith('AIza') || userKey.length < 35) {
    return res.status(400).json({
      error: 'Gemini API 키 형식이 올바르지 않습니다 (AIza로 시작).',
      code: 'INVALID_API_KEY_FORMAT',
    });
  }

  const ai = new GoogleGenAI({ apiKey: userKey });
  const prompt = buildAnalysisPrompt(articles, date);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: ANALYSIS_RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Empty response');

      const analysis = JSON.parse(text);

      if (!analysis.summary || !analysis.prayer) {
        throw new Error('Missing required fields');
      }

      return res.status(200).json(analysis);
    } catch (err) {
      const { message, code } = getGeminiErrorMessage(err);
      // 키 관련 에러는 재시도 의미 없음 — 즉시 반환
      if (code === 'INVALID_API_KEY' || code === 'PERMISSION_DENIED' || code === 'QUOTA_EXCEEDED') {
        return res.status(400).json({ error: message, code });
      }
      if (attempt === 0) continue;
      return res.status(500).json({ error: message, code });
    }
  }
}
