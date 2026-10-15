// Contain the full image with 10% breathing room; never crop or use AI.
export async function normalizeArenaImage(file: File, portrait = false): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024)
    throw new Error("Välj en PNG, JPG eller WebP på högst 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40_000_000)
      throw new Error("Bilden är för stor. Välj en mindre originalbild.");
    for (const size of (portrait ? [384, 256] : [640, 512, 384, 256])) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Webbläsaren kunde inte bearbeta bilden.");
      const scale = portrait ? size / Math.min(img.naturalWidth, img.naturalHeight) : size * 0.8 / Math.max(img.naturalWidth, img.naturalHeight);
      const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
      // Browsers lacking WebP encoding return PNG, which is also supported by the API.
      if (blob && ["image/webp", "image/png"].includes(blob.type) && blob.size <= 250000) return blob;
    }
    throw new Error("Bilden kunde inte komprimeras till 250 kB. Välj en enklare bild.");
  } finally { URL.revokeObjectURL(url); }
}
