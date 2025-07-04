import { protocol } from "electron";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { parse } from "path";

type BufferLoader = (
  filepath: string,
  params: Record<string, any>,
) => Promise<Buffer>;

/**
 * PDF to Image conversion function
 * Converts PDF files to JPEG images using PDF.js and Canvas
 */
async function pdfToImage(
  filepath: string,
  _params: Record<string, any>,
): Promise<Buffer> {
  try {
    const content = await readFile(filepath);

    // Use require for external dependencies to avoid TypeScript issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require("pdfjs-dist");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require("canvas");

    // Initialize PDF.js

    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/build/pdf.worker.js",
    );

    // Load PDF document
    const pdfDoc = await pdfjsLib.getDocument({ data: content }).promise;
    const page = await pdfDoc.getPage(1); // Get first page

    // Get page viewport
    const viewport = page.getViewport({ scale: 1.5 });

    // Create canvas
    const canvasElement = canvas.createCanvas(viewport.width, viewport.height);
    const context = canvasElement.getContext("2d");

    // Render page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert canvas to buffer
    const buffer = canvasElement.toBuffer("image/jpeg", { quality: 0.8 });

    return buffer;
  } catch (reason) {
    console.log("PDF conversion failed:", reason);

    // Return placeholder image as fallback
    const placeholderImage = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    return placeholderImage;
  }
}

/**
 * Register the global img:// protocol handler
 * This protocol handles local file serving with PDF conversion support
 */
export function registerImgProtocol(): void {
  protocol.handle("img", async request => {
    const url_string = request.url;
    const url = new URL(url_string);
    let loader: BufferLoader | undefined = undefined;

    // Extract filepath from img:// URL
    const filepath = url_string.substring("img://".length);

    if (existsSync(filepath)) {
      const { ext } = parse(filepath);
      let blobType: string | undefined = undefined;

      // Determine file type and loader
      switch (ext.toLowerCase()) {
        case ".jpg":
        case ".jpeg":
          blobType = "image/jpeg";
          break;
        case ".png":
          blobType = "image/png";
          break;
        case ".svg":
          blobType = "image/svg+xml";
          break;
        case ".pdf":
          loader = pdfToImage;
          blobType = "image/jpeg";
          break;
      }

      // Load file content
      const imageBuffer = loader
        ? await loader(filepath, { ...url.searchParams, mimeType: blobType })
        : await readFile(filepath);

      // Create response
      const blob = new Blob([imageBuffer], {
        type: blobType || "application/octet-stream",
      });
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": blob.type },
      });
    }

    // File not found
    return new Response(null, { status: 404 });
  });

  console.log("✓ Registered img:// protocol handler globally");
}
