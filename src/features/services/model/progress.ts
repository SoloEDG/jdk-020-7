import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceCatalog } from "./catalog";
import { fullStopActive, standBlocked } from "../../emergency";
export function advanceServices(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  const stopped = fullStopActive(s);
  for (const task of s.services) {
    if (task.status !== "working") continue;
    if (stopped) continue;
    const f = s.flights.find((x) => x.id === task.flightId);
    if (f?.standId && standBlocked(s, f.standId)) continue;
    const v = s.vehicles.find((x) => x.id === task.vehicleId);
    if (!v || v.status !== "working") continue;
    task.progress = Math.min(
      100,
      task.progress + (seconds / task.duration) * 100,
    );
    if (task.progress === 100) {
      task.status = "done";
      v.status = "returning";
      v.origin = { ...v.position };
      v.target = { x: 830, y: 480 };
      v.progress = 0;
      v.tripDuration = 10;
      record(
        s,
        `${task.flightId} ${serviceCatalog[task.kind].label}完成`,
        "success",
      );
    }
  }
  return s;
}
