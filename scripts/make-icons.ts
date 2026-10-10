import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

type Point = readonly [number, number];

export const ICON_SIZES = [16, 32, 48, 128] as const;

const VIEWBOX = 22;
const CORNER = 5;
const STROKE_HALF = 0.9;
const HEAD: Point = [11, 9];
const HEAD_RADIUS = 3.6;
const SUBSAMPLES = 4;
const TILE: readonly [number, number, number] = [0x1f, 0x3f, 0x8f];
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SHOULDER_CURVES: readonly (readonly [Point, Point, Point, Point])[] = [
  [
    [4.8, 18],
    [6, 15],
    [8.3, 13.6],
    [11, 13.6],
  ],
  [
    [11, 13.6],
    [13.7, 13.6],
    [16, 15],
    [17.2, 18],
  ],
];
const CURVE_STEPS = 24;

function bezier(curve: readonly [Point, Point, Point, Point], t: number): Point {
  const [a, b, c, d] = curve;
  const u = 1 - t;
  const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [
    weights[0] * a[0] + weights[1] * b[0] + weights[2] * c[0] + weights[3] * d[0],
    weights[0] * a[1] + weights[1] * b[1] + weights[2] * c[1] + weights[3] * d[1],
  ];
}

const SHOULDERS: readonly Point[] = SHOULDER_CURVES.flatMap((curve) =>
  Array.from({ length: CURVE_STEPS + 1 }, (_unused, step) => bezier(curve, step / CURVE_STEPS)),
);

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function insideTile(p: Point): boolean {
  const cx = Math.min(Math.max(p[0], CORNER), VIEWBOX - CORNER);
  const cy = Math.min(Math.max(p[1], CORNER), VIEWBOX - CORNER);
  return Math.hypot(p[0] - cx, p[1] - cy) <= CORNER;
}

function onFigure(p: Point): boolean {
  if (Math.abs(Math.hypot(p[0] - HEAD[0], p[1] - HEAD[1]) - HEAD_RADIUS) <= STROKE_HALF) {
    return true;
  }
  return SHOULDERS.slice(1).some(
    (point, index) => segmentDistance(p, SHOULDERS[index] ?? point, point) <= STROKE_HALF,
  );
}

function coverage(size: number, x: number, y: number): readonly [number, number] {
  const scale = VIEWBOX / size;
  let tile = 0;
  let figure = 0;
  for (let index = 0; index < SUBSAMPLES * SUBSAMPLES; index += 1) {
    const p: Point = [
      (x + ((index % SUBSAMPLES) + 0.5) / SUBSAMPLES) * scale,
      (y + (Math.floor(index / SUBSAMPLES) + 0.5) / SUBSAMPLES) * scale,
    ];
    if (insideTile(p)) {
      tile += 1;
      figure += onFigure(p) ? 1 : 0;
    }
  }
  return [tile, figure];
}

export function renderIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const [tile, figure] = coverage(size, index % size, Math.floor(index / size));
    const white = tile === 0 ? 0 : figure / tile;
    const channels = TILE.map((value) => Math.round(value + (255 - value) * white));
    rgba.set([...channels, Math.round((tile / (SUBSAMPLES * SUBSAMPLES)) * 255)], index * 4);
  }
  return rgba;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

export function encodePng(size: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Array.from({ length: size }, (_unused, row) =>
    Buffer.concat([Buffer.from([0]), rgba.subarray(row * size * 4, (row + 1) * size * 4)]),
  );
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

if (import.meta.main) {
  const target = path.join(process.cwd(), "public", "icons");
  mkdirSync(target, { recursive: true });
  for (const size of ICON_SIZES) {
    const name = `icon-${String(size)}.png`;
    writeFileSync(path.join(target, name), encodePng(size, renderIcon(size)));
    console.warn(`icon written: ${name}`);
  }
}
