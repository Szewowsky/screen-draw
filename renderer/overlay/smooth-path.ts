import type { Point } from "./drawing-model";

export type FreehandPathCommand =
  | { type: "moveTo"; point: Point }
  | { type: "lineTo"; point: Point }
  | { type: "quadraticCurveTo"; control: Point; end: Point };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function freehandPathCommands(points: readonly Point[]): FreehandPathCommand[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const point = points[0];
    return [
      { type: "moveTo", point },
      { type: "lineTo", point: { x: point.x + 0.1, y: point.y } },
    ];
  }
  if (points.length === 2) {
    return [
      { type: "moveTo", point: points[0] },
      { type: "lineTo", point: points[1] },
    ];
  }

  const commands: FreehandPathCommand[] = [{ type: "moveTo", point: points[0] }];
  for (let i = 1; i < points.length - 1; i++) {
    commands.push({
      type: "quadraticCurveTo",
      control: points[i],
      end: midpoint(points[i], points[i + 1]),
    });
  }
  commands.push({ type: "lineTo", point: points[points.length - 1] });
  return commands;
}
