import { API_BASE } from '../config';
import { adminPassword } from './artistsApi';

export const MAX_CLIP_BYTES = 50 * 1024 * 1024;

// Загружает видео напрямую в хранилище по одноразовой ссылке от сервера и возвращает имя файла в хранилище
export async function uploadClip(file: File): Promise<string> {
  if (file.type !== 'video/mp4' && file.type !== 'video/webm') throw new Error('Подойдут видео MP4 или WebM');
  if (file.size > MAX_CLIP_BYTES) throw new Error('Видео должно быть не больше 50 МБ');
  const r = await fetch(`${API_BASE}/api/clip-upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ password: adminPassword(), type: file.type, size: file.size }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Ошибка сервера (${r.status})`);
  const form = new FormData();
  form.append('cacheControl', '31536000');
  form.append('', file);
  const up = await fetch(String(data.uploadUrl), { method: 'PUT', body: form });
  if (!up.ok) {
    const text = await up.text().catch(() => '');
    throw new Error(`Не удалось загрузить видео (${up.status}) ${text.slice(0, 120)}`);
  }
  return String(data.path);
}
