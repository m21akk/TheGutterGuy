// GET /api/reviews – a few of Roy's latest good Google reviews, refreshed once a day.
// Needs GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID. Without them it returns no reviews
// and the website simply shows the "Read our reviews" buttons instead.
import { json, allEnv } from '../util.js';

const CACHE_SECONDS = 60 * 60 * 24;

export async function fetchGoogleReviews(key, placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'reviews,googleMapsUri' },
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const reviews = (data.reviews || [])
    .filter((r) => (r.rating || 0) >= 4 && (r.originalText?.text || r.text?.text))
    .slice(0, 4)
    .map((r) => ({
      rating: r.rating,
      text: (r.originalText?.text || r.text?.text).slice(0, 600),
      author: r.authorAttribution?.displayName || 'Google user',
      authorUrl: r.authorAttribution?.uri || null,
      when: r.relativePublishTimeDescription || '',
    }));
  return { reviews, googleUrl: data.googleMapsUri || null };
}

export async function GET(request) {
  const env = allEnv();
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) return json({ reviews: [] });

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(new URL('/api/reviews?v=1', request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  try {
    const body = await fetchGoogleReviews(env.GOOGLE_PLACES_API_KEY, env.GOOGLE_PLACE_ID);
    const res = new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    });
    if (cache) await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    console.error(err);
    return json({ reviews: [] });
  }
}
