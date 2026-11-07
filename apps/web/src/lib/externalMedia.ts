export interface ExternalMovie {
  external_id: string;
  title: string;
  year: number | null;
  cast_summary: string | null;
  poster_url: string | null;
  playable_trailer_stream_url: string | null;
  source: string;
  source_url: string | null;
  genre: string | null;
  duration_minutes: number | null;
  description: string | null;
  content_rating: string | null;
}
export interface ExternalSearchResult {
  query: string;
  items: ExternalMovie[];
  status: 'ok' | 'disabled' | 'unavailable' | 'rate_limited';
  storefront: string;
  notice: string | null;
  sources_queried: string[];
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export async function searchExternalMovies(query: string, signal: AbortSignal): Promise<ExternalSearchResult> {
  const response = await fetch(base + '/catalog/external/search?q=' + encodeURIComponent(query), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Не удалось открыть каталог. Попробуйте ещё раз.');
  const data = await response.json();
  if (!Array.isArray(data?.items) || typeof data?.status !== 'string') throw new Error('Каталог вернул неполный ответ. Попробуйте ещё раз.');
  return data as ExternalSearchResult;
}
