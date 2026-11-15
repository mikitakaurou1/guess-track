const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  const raw = String(input ?? '').trim();
  if (ID.test(raw)) return raw;
  let u;
  try { u = new URL(raw.includes('://') ? raw : `https://${raw}`); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
  }
  return id && ID.test(id) ? id : null;
}
