import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { routePosition } from "../lib/routing";
import { fullStopActive } from "../../emergency";
export function advanceFleet(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  const stopped = fullStopActive(s);
  for (const v of s.vehicles) {
    if (v.status === "evacuating") {
      v.progress = Math.min(100, v.progress + (seconds / v.tripDuration) * 100);
      v.position = routePosition(v);
      if (v.progress >= 100) {
        v.status = "idle";
        record(s, `${v.id} 已撤离至安全区域`, "success");
      }
      continue;
    }
    if (stopped) continue;
    if (v.status !== "travel" && v.status !== "returning") continue;
    v.progress = Math.min(100, v.progress + (seconds / v.tripDuration) * 100);
    v.position = routePosition(v);
    if (v.progress >= 100) {
      if (v.status === "returning") {
        v.status = "idle";
        v.serviceId = undefined;
      } else {
        v.status = "working";
        const task = s.services.find((t) => t.id === v.serviceId);
        if (task) task.status = "working";
      }
    }
  }
  return s;
}
