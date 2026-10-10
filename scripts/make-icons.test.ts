import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng, ICON_SIZES, renderIcon } from "./make-icons.ts";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function header(png: Uint8Array): { width: number; height: number } {
  const view = Buffer.from(png);
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

function idatData(png: Buffer): Buffer {
  let offset = 8;
  let parts: readonly Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT") {
      parts = [...parts, png.subarray(offset + 8, offset + 8 + length)];
    }
    offset += length + 12;
  }
  return Buffer.concat(parts);
}

function decodedPixels(png: Buffer, size: number): { filters: number[]; rgba: Buffer } {
  const raw = inflateSync(idatData(png));
  const stride = size * 4 + 1;
  const rows = Array.from({ length: size }, (_row, index) =>
    raw.subarray(index * stride, (index + 1) * stride),
  );
  return {
    filters: rows.map((row) => row[0] ?? -1),
    rgba: Buffer.concat(rows.map((row) => row.subarray(1))),
  };
}

function pixel(rgba: Uint8Array, size: number, point: readonly [number, number]): number[] {
  const offset = (point[1] * size + point[0]) * 4;
  return [...rgba.subarray(offset, offset + 4)];
}

describe("make-icons", () => {
  it("draws a transparent corner, the blue tile and the white figure", () => {
    const rgba = renderIcon(48);
    expect(rgba).toHaveLength(48 * 48 * 4);
    expect(pixel(rgba, 48, [0, 0])[3]).toBe(0);
    expect(pixel(rgba, 48, [4, 24])).toEqual([0x1f, 0x3f, 0x8f, 255]);
    expect(pixel(rgba, 48, [24, 12])).toEqual([255, 255, 255, 255]);
  });

  it("encodes a valid PNG with the right header and pixel data", () => {
    const rgba = renderIcon(16);
    const png = encodePng(16, rgba);
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(header(png)).toEqual({ width: 16, height: 16 });
    const idatLength = Buffer.from(png).readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect(raw).toHaveLength(16 * (16 * 4 + 1));
  });

  it.each(ICON_SIZES)(
    "has a committed %i px icon whose decoded pixels match the generator, whatever zlib produced",
    (size) => {
      const file = readFileSync(
        path.join(import.meta.dirname, "..", "public", "icons", `icon-${String(size)}.png`),
      );
      expect([...file.subarray(0, 8)]).toEqual(SIGNATURE);
      expect(header(file)).toEqual({ width: size, height: size });
      const decoded = decodedPixels(file, size);
      expect(decoded.filters.every((filter) => filter === 0)).toBe(true);
      expect(Buffer.compare(decoded.rgba, Buffer.from(renderIcon(size)))).toBe(0);
    },
  );
});
