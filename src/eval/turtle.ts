// A Logo-style turtle drawing into a graphics box's <canvas>.
// Heading 0 points up (north); turning right increases heading clockwise.
// Origin (0,0) is the centre of the canvas; y grows upward (Logo convention).

export class Turtle {
  x = 0;
  y = 0;
  heading = 0; // degrees, 0 = up
  penDown = true;
  color = "#222";
  width = 1.5;

  private ctx: CanvasRenderingContext2D;
  private cx: number;
  private cy: number;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.cx = canvas.width / 2;
    this.cy = canvas.height / 2;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  home(): void {
    this.x = 0;
    this.y = 0;
    this.heading = 0;
    this.penDown = true;
  }

  private toScreen(x: number, y: number): [number, number] {
    return [this.cx + x, this.cy - y];
  }

  forward(dist: number): void {
    const rad = (this.heading * Math.PI) / 180;
    const nx = this.x + dist * Math.sin(rad);
    const ny = this.y + dist * Math.cos(rad);
    if (this.penDown) {
      const [sx, sy] = this.toScreen(this.x, this.y);
      const [ex, ey] = this.toScreen(nx, ny);
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.width;
      this.ctx.lineCap = "round";
      this.ctx.moveTo(sx, sy);
      this.ctx.lineTo(ex, ey);
      this.ctx.stroke();
    }
    this.x = nx;
    this.y = ny;
  }

  right(deg: number): void {
    this.heading = (this.heading + deg) % 360;
  }

  setxy(x: number, y: number): void {
    if (this.penDown) {
      const [sx, sy] = this.toScreen(this.x, this.y);
      const [ex, ey] = this.toScreen(x, y);
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.width;
      this.ctx.moveTo(sx, sy);
      this.ctx.lineTo(ex, ey);
      this.ctx.stroke();
    }
    this.x = x;
    this.y = y;
  }

  setHeading(deg: number): void {
    this.heading = deg % 360;
  }

  /** Draw a little marker so an empty field still shows the turtle. */
  drawMarker(): void {
    const ctx = this.ctx;
    const [px, py] = this.toScreen(this.x, this.y);
    const rad = (this.heading * Math.PI) / 180;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-rad); // screen rotation is opposite (y is flipped)
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = "#8a4b1f";
    ctx.fill();
    ctx.restore();
  }
}
