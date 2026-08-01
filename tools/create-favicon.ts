import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_PATH = resolve(REPOSITORY_ROOT, "src/assets/generated/island-terrain-atlas.png");
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, "src/assets/generated/favicon.png");
const OUTPUT_SIZE = 256;
const SOURCE_FRAME = Object.freeze({ x: 55, y: 65, width: 300, height: 280 });
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BYTES_PER_PIXEL = 4;

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodeRgbaPng(input: Buffer): DecodedPng {
  if (!input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("The terrain atlas is not a PNG file.");
  }

  let width = 0;
  let height = 0;
  const compressedParts: Buffer[] = [];
  let offset = PNG_SIGNATURE.length;
  let reachedEnd = false;

  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > input.length) throw new Error(`PNG chunk ${type} is truncated.`);

    if (type === "IHDR") {
      width = input.readUInt32BE(dataStart);
      height = input.readUInt32BE(dataStart + 4);
      const bitDepth = input[dataStart + 8];
      const colorType = input[dataStart + 9];
      const compression = input[dataStart + 10];
      const filter = input[dataStart + 11];
      const interlace = input[dataStart + 12];
      if (
        bitDepth !== 8 ||
        colorType !== 6 ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new Error(
          "The terrain atlas must be a non-interlaced 8-bit RGBA PNG with standard compression and filtering.",
        );
      }
    } else if (type === "IDAT") {
      compressedParts.push(input.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      reachedEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (width <= 0 || height <= 0 || compressedParts.length === 0 || !reachedEnd) {
    throw new Error("The terrain atlas PNG is missing required chunks.");
  }

  const stride = width * BYTES_PER_PIXEL;
  const filtered = inflateSync(Buffer.concat(compressedParts));
  if (filtered.length !== (stride + 1) * height) {
    throw new Error("The terrain atlas has an unexpected decompressed size.");
  }

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filteredRowStart = y * (stride + 1);
    const filterType = filtered[filteredRowStart];
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    if (filterType === undefined || filterType > 4) {
      throw new Error(`Unsupported PNG row filter ${String(filterType)}.`);
    }

    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[filteredRowStart + 1 + x] ?? 0;
      const left = x >= BYTES_PER_PIXEL ? (pixels[rowStart + x - BYTES_PER_PIXEL] ?? 0) : 0;
      const up = y > 0 ? (pixels[previousRowStart + x] ?? 0) : 0;
      const upperLeft =
        y > 0 && x >= BYTES_PER_PIXEL ? (pixels[previousRowStart + x - BYTES_PER_PIXEL] ?? 0) : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      else if (filterType === 2) predictor = up;
      else if (filterType === 3) predictor = Math.floor((left + up) / 2);
      else if (filterType === 4) predictor = paethPredictor(left, up, upperLeft);
      pixels[rowStart + x] = (raw + predictor) & 0xff;
    }
  }

  return { width, height, pixels };
}

function createFaviconPixels(source: DecodedPng): Buffer {
  if (
    SOURCE_FRAME.x < 0 ||
    SOURCE_FRAME.y < 0 ||
    SOURCE_FRAME.x + SOURCE_FRAME.width > source.width ||
    SOURCE_FRAME.y + SOURCE_FRAME.height > source.height
  ) {
    throw new Error("The favicon source frame lies outside the terrain atlas.");
  }

  const output = Buffer.alloc(OUTPUT_SIZE * OUTPUT_SIZE * BYTES_PER_PIXEL);
  const scale = Math.min(OUTPUT_SIZE / SOURCE_FRAME.width, OUTPUT_SIZE / SOURCE_FRAME.height);
  const destinationWidth = Math.round(SOURCE_FRAME.width * scale);
  const destinationHeight = Math.round(SOURCE_FRAME.height * scale);
  const destinationX = Math.floor((OUTPUT_SIZE - destinationWidth) / 2);
  const destinationY = Math.floor((OUTPUT_SIZE - destinationHeight) / 2);

  for (let y = 0; y < destinationHeight; y += 1) {
    const sourceY = SOURCE_FRAME.y + (y + 0.5) / scale - 0.5;
    const y0 = Math.max(
      SOURCE_FRAME.y,
      Math.min(Math.floor(sourceY), SOURCE_FRAME.y + SOURCE_FRAME.height - 1),
    );
    const y1 = Math.min(y0 + 1, SOURCE_FRAME.y + SOURCE_FRAME.height - 1);
    const yWeight = sourceY - Math.floor(sourceY);

    for (let x = 0; x < destinationWidth; x += 1) {
      const sourceX = SOURCE_FRAME.x + (x + 0.5) / scale - 0.5;
      const x0 = Math.max(
        SOURCE_FRAME.x,
        Math.min(Math.floor(sourceX), SOURCE_FRAME.x + SOURCE_FRAME.width - 1),
      );
      const x1 = Math.min(x0 + 1, SOURCE_FRAME.x + SOURCE_FRAME.width - 1);
      const xWeight = sourceX - Math.floor(sourceX);
      const samples = [
        { x: x0, y: y0, weight: (1 - xWeight) * (1 - yWeight) },
        { x: x1, y: y0, weight: xWeight * (1 - yWeight) },
        { x: x0, y: y1, weight: (1 - xWeight) * yWeight },
        { x: x1, y: y1, weight: xWeight * yWeight },
      ];

      let weightedAlpha = 0;
      const weightedColors: [number, number, number] = [0, 0, 0];
      for (const sample of samples) {
        const sourceIndex = (sample.y * source.width + sample.x) * BYTES_PER_PIXEL;
        const alpha = source.pixels[sourceIndex + 3] ?? 0;
        const alphaWeight = alpha * sample.weight;
        weightedAlpha += alphaWeight;
        for (let channel = 0; channel < 3; channel += 1) {
          weightedColors[channel] =
            (weightedColors[channel] ?? 0) +
            (source.pixels[sourceIndex + channel] ?? 0) * alphaWeight;
        }
      }

      const outputIndex = ((destinationY + y) * OUTPUT_SIZE + destinationX + x) * BYTES_PER_PIXEL;
      if (weightedAlpha > 0) {
        for (let channel = 0; channel < 3; channel += 1) {
          output[outputIndex + channel] = Math.round(
            (weightedColors[channel] ?? 0) / weightedAlpha,
          );
        }
      }
      output[outputIndex + 3] = Math.round(weightedAlpha);
    }
  }

  return output;
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return chunk;
}

function encodeRgbaPng(width: number, height: number, pixels: Buffer): Buffer {
  if (pixels.length !== width * height * BYTES_PER_PIXEL) {
    throw new Error("The favicon pixel buffer has an unexpected size.");
  }
  const stride = width * BYTES_PER_PIXEL;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineStart = y * (stride + 1);
    scanlines[scanlineStart] = 0;
    pixels.copy(scanlines, scanlineStart + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function createFavicon(): Promise<void> {
  const source = decodeRgbaPng(await readFile(SOURCE_PATH));
  const outputBytes = encodeRgbaPng(OUTPUT_SIZE, OUTPUT_SIZE, createFaviconPixels(source));
  const decodedOutput = decodeRgbaPng(outputBytes);
  if (decodedOutput.width !== OUTPUT_SIZE || decodedOutput.height !== OUTPUT_SIZE) {
    throw new Error("The generated favicon dimensions are invalid.");
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, outputBytes);
  process.stdout.write(
    `${JSON.stringify(
      {
        bytes: outputBytes.byteLength,
        output: "src/assets/generated/favicon.png",
        sha256: createHash("sha256").update(outputBytes).digest("hex"),
        size: `${OUTPUT_SIZE}x${OUTPUT_SIZE}`,
        source: "src/assets/generated/island-terrain-atlas.png",
        sourceFrame: SOURCE_FRAME,
      },
      null,
      2,
    )}\n`,
  );
}

await createFavicon();
