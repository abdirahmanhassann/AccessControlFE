export async function compressImage(file: File): Promise<{
  dataUrl: string;
  size: number;
  type: string;
  name: string;
}> {
  const bitmap = await createImageBitmap(file);
  const max = 960;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process photo");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.68);
  const size = Math.round((dataUrl.length * 3) / 4);
  return {
    dataUrl,
    size,
    type: "image/jpeg",
    name: file.name.replace(/\.\w+$/, ".jpg") || "room.jpg",
  };
}
