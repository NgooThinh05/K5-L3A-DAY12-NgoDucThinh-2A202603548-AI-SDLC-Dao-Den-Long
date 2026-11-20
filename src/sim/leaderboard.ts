/**
 * Pure local leaderboard validation, sorting & top-10 management (zero DOM deps).
 */
export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
}

export const LEADERBOARD_MAX_ENTRIES = 10;

// Allows 3-12 ASCII [A-Za-z0-9_] plus Vietnamese accented letters
const VALID_NAME_RE = /^[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]{3,12}$/;

export function isValidPlayerName(name: string): boolean {
  return VALID_NAME_RE.test(name.trim());
}

/**
 * Formats an ISO 8601 timestamp with explicit local timezone offset (e.g., 2026-11-20T16:45:00+07:00).
 */
export function formatIsoWithTimezone(date = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = pad(offsetMin / 60);
  const mm = pad(offsetMin % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

/**
 * Sorts leaderboard entries by score descending; ties broken by earlier achieved_at first.
 * Keeps top 10.
 */
export function sortAndTrimLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at) || 0;
      const tb = Date.parse(b.achieved_at) || 0;
      return ta - tb;
    })
    .slice(0, LEADERBOARD_MAX_ENTRIES);
}

export function addLeaderboardEntry(
  current: LeaderboardEntry[],
  candidate: Omit<LeaderboardEntry, 'achieved_at'> & { achieved_at?: string },
): LeaderboardEntry[] {
  const cleanName = candidate.name.trim();
  if (!isValidPlayerName(cleanName)) {
    throw new Error('Tên phải dài 3–12 ký tự (chữ cái, số hoặc dấu gạch dưới _).');
  }
  const entry: LeaderboardEntry = {
    name: cleanName,
    score: Math.max(0, Math.round(candidate.score)),
    nights_won: Math.max(0, Math.min(3, Math.round(candidate.nights_won))),
    achieved_at: candidate.achieved_at ?? formatIsoWithTimezone(),
    seed: Math.trunc(candidate.seed),
  };
  return sortAndTrimLeaderboard([...current, entry]);
}
