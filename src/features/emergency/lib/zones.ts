import type { Incident, Point, Shift, Vehicle } from "../../../shared/types";

export const ZONE_RADII = [70, 110, 150] as const;
export const SAFETY_GAP = 45;
export const MAX_SPREAD = 230;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function effectiveRadius(i: Incident): number {
  return Math.max(i.zoneRadius, Math.ceil(i.spread));
}

/** 实际影响作业的半径：未隔离时按扩散范围，隔离后取隔离区与扩散的较大者。 */
export function dangerRadius(i: Incident): number {
  return i.zoneRadius > 0 ? effectiveRadius(i) : Math.ceil(i.spread);
}

export function fullStopActive(s: Shift): boolean {
  return s.incidents.some((i) => i.zoneRadius > 0 && i.mode === "fullStop");
}

/** 仅按几何范围计算机位是否处于危险区（不含全面停场）。 */
export function standInDanger(s: Shift, standId: string): boolean {
  const stand = s.stands.find((x) => x.id === standId);
  if (!stand) return false;
  return s.incidents.some((i) => distance(stand, i.position) <= dangerRadius(i));
}

export function standBlocked(s: Shift, standId: string): boolean {
  if (s.incidents.length === 0) return false;
  return fullStopActive(s) || standInDanger(s, standId);
}

export function vehicleDanger(s: Shift, v: Vehicle): boolean {
  return s.incidents.some(
    (i) => distance(v.position, i.position) <= dangerRadius(i),
  );
}

/** 撤离目标点：沿朝向集结点的方向驶出危险区，绝不瞬移。 */
export function zoneExitPoint(i: Incident, toward: Point): Point {
  const r = effectiveRadius(i) + 34;
  const ang = Math.atan2(toward.y - i.position.y, toward.x - i.position.x);
  return {
    x: Math.min(920, Math.max(30, i.position.x + Math.cos(ang) * r)),
    y: Math.min(640, Math.max(150, i.position.y + Math.sin(ang) * r)),
  };
}

/** 救援集结点：消防与有污染的事故必须保持安全距离，纯伤员事故可接近。 */
export function stagingPoint(
  i: Incident,
  home: Point,
  kind: "fire" | "medical",
): Point {
  const min =
    kind === "fire" || i.contamination > 0 ? effectiveRadius(i) + SAFETY_GAP : 30;
  const ang = Math.atan2(home.y - i.position.y, home.x - i.position.x);
  const r = Math.max(min, 30);
  return {
    x: Math.min(920, Math.max(30, i.position.x + Math.cos(ang) * r)),
    y: Math.min(640, Math.max(150, i.position.y + Math.sin(ang) * r)),
  };
}
