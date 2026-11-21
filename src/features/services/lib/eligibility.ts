import type { Shift, ServiceKind } from "../../../shared/types";
import { serviceCatalog } from "../model/catalog";
import { fullStopActive, standBlocked } from "../../emergency";
export function serviceBlockReason(
  s: Shift,
  flightId: string,
  kind: ServiceKind,
): string | undefined {
  const f = s.flights.find((x) => x.id === flightId),
    task = s.services.find((x) => x.flightId === flightId && x.kind === kind);
  if (!f || f.status !== "parked") return "请先分配机位";
  if (!task || task.status !== "pending") return "任务已派遣";
  if (fullStopActive(s)) return "全面停场中，暂停派遣";
  if (f.standId && standBlocked(s, f.standId)) return "机位处于隔离区，暂停派遣";
  if (
    serviceCatalog[kind].requires.some(
      (k) =>
        !s.services.some(
          (t) => t.flightId === flightId && t.kind === k && t.status === "done",
        ),
    )
  )
    return "等待行李装卸完成";
  const active = s.services.filter(
    (t) =>
      t.flightId === flightId &&
      (t.status === "travel" || t.status === "working"),
  ).length;
  if (active >= 2) return "机位的两个服务位均已占用";
  return undefined;
}
