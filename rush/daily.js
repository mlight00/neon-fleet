// rush/daily.js — 날짜는 기기 로컬 기준(재미설계 C).
export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function isFirstRunToday(data, key) { return data.lastPlayDay !== key; }

export function shareText(key, best) {
  const [, m, d] = key.split('-');
  return '스타포지 러시 ' + Number(m) + '/' + Number(d) + ' 도전 — 병력 ' + best + '!';
}
