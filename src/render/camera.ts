// The camera is a view transform over an infinite world. We never move objects
// to pan/zoom — we move the camera. screen = (world - cam) * zoom + originShift.

export interface Point {
  x: number;
  y: number;
}

export class Camera {
  x = 0; // world coord at screen origin (before zoom)
  y = 0;
  zoom = 1;

  readonly minZoom = 0.05;
  readonly maxZoom = 6;

  screenToWorld(sx: number, sy: number): Point {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  /** Zoom toward a fixed screen point (cursor), keeping it stationary. */
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  panBy(dxScreen: number, dyScreen: number) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
