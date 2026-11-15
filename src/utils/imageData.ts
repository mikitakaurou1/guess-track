export async function imageFileToJpegDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Подойдут PNG, JPEG, WebP и GIF');
  if (file.size > 15 * 1024 * 1024) throw new Error('Исходный файл должен быть не больше 15 МБ');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось обработать картинку');
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    image.close();
  }
}
