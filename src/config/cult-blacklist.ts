export const CULT_DOMAINS = [
  'newscj.com',
  'scjnews.net',
  'shincheonji.kr',
  'watchtower.org',
  'jw.org',
  'sdanews.org',
  'ucnews.co.kr',
  'familyfed.org',
  'mormonkorea.co.kr',
  'dfrk.kr',
  'beopbo.com',
  'pbc.co.kr',
  'cpbc.co.kr',
  'segye.com',
  'igoodnews.net',
  'newspower.co.kr',
  'hdwm.org',
  'watv.org',
  'wmscog.com',
];

export const CULT_KEYWORDS = [
  '신천지', '이만희', '만민중앙', '이재록',
  '여호와의증인', '안상홍', '장길자', '하나님의교회',
  '통일교', '문선명', '세계평화통일가정연합',
  '전능신교', '양향모', '안식교',
  'JMS', '정명석', '세계기독교통일신령협회',
];

export function isCultDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return CULT_DOMAINS.some(cult => hostname.includes(cult));
  } catch {
    return false;
  }
}

export function containsCultKeyword(title: string, description: string): boolean {
  const text = `${title} ${description}`;
  return CULT_KEYWORDS.some(keyword => text.includes(keyword));
}
