const maxImageDimension = 1600;

export async function compressProductImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    if (
      Math.max(bitmap.width, bitmap.height) <= maxImageDimension &&
      file.size <= 350_000
    ) {
      return file;
    }

    const scale = Math.min(1, maxImageDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("The image could not be compressed.")),
        "image/webp",
        0.86,
      );
    });
    if (compressedBlob.size >= file.size) return file;

    const extension = compressedBlob.type === "image/webp" ? "webp" : "png";
    const name = file.name.replace(/\.[^.]+$/, "");
    return new File([compressedBlob], `${name}.${extension}`, { type: compressedBlob.type });
  } finally {
    bitmap.close();
  }
}

export async function imageFingerprint(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
