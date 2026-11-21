import type {
  CheckKind,
  Incident,
  ResponseMode,
  ResponsePriority,
  Shift,
} from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { depot } from "../../fleet/model/vehicles";
import {
  checksComplete,
  needsCleanup,
  needsFire,
  needsMedical,
  unitHome,
} from "./incidents";
import {
  dangerRadius,
  distance,
  stagingPoint,
  standInDanger,
  vehicleDanger,
  ZONE_RADII,
  zoneExitPoint,
} from "../lib/zones";

function fail(s: Shift, text: string): Shift {
  s.conflicts++;
  s.score -= 10;
  record(s, text, "warning");
  return s;
}

export function selectIncident(state: Shift, id: string): Shift {
  if (!state.incidents.some((i) => i.id === id)) return state;
  return { ...state, selectedIncidentId: id };
}

/** 划定隔离区：立即按真实位置困住区内车辆，召回前往被封机位的车辆（任务进度保留）。 */
export function isolateIncident(state: Shift, id: string, radius: number): Shift {
  const s = copyShift(state);
  const i = s.incidents.find((x) => x.id === id);
  if (!i || i.phase !== "reported" || !(ZONE_RADII as readonly number[]).includes(radius))
    return fail(s, "隔离指令无效：事故状态已变化");
  i.zoneRadius = radius;
  i.phase = "isolated";
  let trapped = 0;
  for (const v of s.vehicles) {
    if (
      (v.status === "idle" ||
        v.status === "travel" ||
        v.status === "working" ||
        v.status === "returning") &&
      vehicleDanger(s, v)
    ) {
      v.status = "trapped";
      trapped++;
    }
  }
  for (const v of s.vehicles) {
    if (v.status !== "travel" && v.status !== "working") continue;
    const task = s.services.find((t) => t.id === v.serviceId);
    const f = s.flights.find((x) => x.id === task?.flightId);
    if (!task || !f?.standId || !standInDanger(s, f.standId)) continue;
    task.status = "pending";
    task.vehicleId = undefined;
    v.status = "returning";
    v.serviceId = undefined;
    v.origin = { ...v.position };
    v.target = { x: 830, y: 480 };
    v.progress = 0;
    v.tripDuration = 10;
  }
  record(
    s,
    `${id} 已划定 ${radius}m 隔离区（${i.mode === "partial" ? "局部封锁" : "全面停场"}）${trapped ? `，${trapped} 辆车被困` : ""}`,
    "warning",
  );
  return s;
}

export function setResponseMode(
  state: Shift,
  id: string,
  mode: ResponseMode,
): Shift {
  const s = copyShift(state);
  const i = s.incidents.find((x) => x.id === id);
  if (!i || i.mode === mode) return state;
  i.mode = mode;
  record(
    s,
    mode === "fullStop"
      ? `${id} 响应升级：全面停场，所有地面作业与离港暂停`
      : `${id} 响应调整：恢复局部封锁，其余机位继续运行`,
    mode === "fullStop" ? "warning" : "info",
  );
  return s;
}

export function setPriority(
  state: Shift,
  id: string,
  priority: ResponsePriority,
): Shift {
  const s = copyShift(state);
  const i = s.incidents.find((x) => x.id === id);
  if (!i || i.priority === priority) return state;
  i.priority = priority;
  record(
    s,
    `${id} 处置优先级：${priority === "rescueFirst" ? "优先救人（扩散风险上升）" : "优先控制扩散（救援放缓）"}`,
  );
  return s;
}

/** 派遣救援力量：一个单位同一时刻只能归属一起事故，且先隔离后投入。 */
export function dispatchRescueUnit(
  state: Shift,
  unitId: string,
  incidentId: string,
): Shift {
  const s = copyShift(state);
  const u = s.rescueUnits.find((x) => x.id === unitId);
  const i = s.incidents.find((x) => x.id === incidentId);
  if (!u || !i) return state;
  if (i.zoneRadius === 0) return fail(s, "请先划定隔离区，再投入救援力量");
  if (u.status !== "standby")
    return fail(
      s,
      `${u.id} 正在${u.incidentId ? `处置 ${u.incidentId}` : "返回站点"}，无法重复占用`,
    );
  if (u.kind === "fire" && !needsFire(i))
    return fail(s, "该事故无火患风险，无需消防力量");
  if (u.kind === "medical" && !needsMedical(i))
    return fail(s, "该事故无伤员，无需医疗力量");
  u.status = "enroute";
  u.incidentId = i.id;
  u.origin = { ...u.position };
  u.target = stagingPoint(i, unitHome[u.id] ?? u.position, u.kind);
  u.progress = 0;
  u.tripDuration = 3 + distance(u.origin, u.target) / 85;
  record(s, `${u.id} 出动 → ${i.id}，将在隔离区外安全距离集结`);
  return s;
}

export function sendUnitHome(s: Shift, unitId: string): void {
  const u = s.rescueUnits.find((x) => x.id === unitId);
  if (!u) return;
  u.status = "returning";
  u.origin = { ...u.position };
  u.target = { ...(unitHome[u.id] ?? u.position) };
  u.progress = 0;
  u.tripDuration = 3 + distance(u.origin, u.target) / 85;
  u.incidentId = undefined;
}

/** 撤回救援单位：其承担的工作完成后才允许撤离，便于应对连续事故。 */
export function recallRescueUnit(state: Shift, unitId: string): Shift {
  const s = copyShift(state);
  const u = s.rescueUnits.find((x) => x.id === unitId);
  if (!u || (u.status !== "onsite" && u.status !== "enroute")) return state;
  const i = s.incidents.find((x) => x.id === u.incidentId);
  if (u.status === "onsite" && i) {
    if (
      u.kind === "fire" &&
      needsFire(i) &&
      (i.fireProgress < 100 || i.cleanupProgress < 100)
    )
      return fail(s, "消防力量仍在处置，无法撤离");
    if (u.kind === "medical" && needsMedical(i) && i.medicalProgress < 100)
      return fail(s, "伤员尚未处置完毕，无法撤离");
  }
  sendUnitHome(s, u.id);
  record(s, `${u.id} 撤回站点待命`);
  return s;
}

/** 撤离被困车辆：沿滑行道驶出危险区，受损车辆无法自行撤离。 */
export function evacuateVehicle(state: Shift, vehicleId: string): Shift {
  const s = copyShift(state);
  const v = s.vehicles.find((x) => x.id === vehicleId);
  if (!v || v.status !== "trapped") return state;
  if (v.disabled)
    return fail(s, `${v.id} 事故受损无法自行驶离，待解除隔离后拖离`);
  const nearest = s.incidents
    .filter((i) => distance(v.position, i.position) <= dangerRadius(i))
    .sort(
      (a, b) =>
        distance(v.position, a.position) - distance(v.position, b.position),
    )[0];
  if (!nearest) return state;
  const task = s.services.find((t) => t.id === v.serviceId);
  if (task && (task.status === "travel" || task.status === "working")) {
    task.status = "pending";
    task.vehicleId = undefined;
  }
  v.serviceId = undefined;
  v.status = "evacuating";
  v.origin = { ...v.position };
  v.target = zoneExitPoint(nearest, depot);
  v.progress = 0;
  v.tripDuration = 4 + distance(v.origin, v.target) / 38;
  record(s, `${v.id} 开始沿滑行道撤离危险区`);
  return s;
}

/** 检查是否就绪（供界面禁用未就绪的检查项，避免误触扣分）。 */
export function checkReady(s: Shift, i: Incident, check: CheckKind): boolean {
  if (i.phase !== "checking" || i.checks[check]) return false;
  if (check === "fire")
    return (
      needsFire(i) &&
      i.fireProgress >= 100 &&
      s.rescueUnits.some(
        (u) => u.kind === "fire" && u.incidentId === i.id && u.status === "onsite",
      )
    );
  if (check === "env")
    return needsCleanup(i) && i.cleanupProgress >= 100 && i.spread <= i.zoneRadius;
  return needsMedical(i) && i.casualtiesRescued >= i.casualties;
}

/** 解除前检查：消防复检 / 环境检测 / 医疗交接，各有前置条件。 */
export function runCheck(state: Shift, id: string, check: CheckKind): Shift {
  const s = copyShift(state);
  const i = s.incidents.find((x) => x.id === id);
  if (!i) return state;
  if (i.phase !== "checking") return fail(s, "现场处置尚未完成，无法进行检查");
  if (i.checks[check]) return state;
  if (check === "fire") {
    if (!needsFire(i) || i.fireProgress < 100)
      return fail(s, "火势未受控，无法复检");
    if (
      !s.rescueUnits.some(
        (u) => u.kind === "fire" && u.incidentId === id && u.status === "onsite",
      )
    )
      return fail(s, "需要消防力量留在现场执行复检");
    record(s, `${id} 消防复检通过，无复燃风险`, "success");
  }
  if (check === "env") {
    if (!needsCleanup(i) || i.cleanupProgress < 100)
      return fail(s, "污染尚未清理完毕");
    if (i.spread > i.zoneRadius)
      return fail(s, "污染范围仍超出隔离区，等待回收");
    record(s, `${id} 环境检测合格，道面恢复可用`, "success");
  }
  if (check === "medical") {
    if (!needsMedical(i) || i.casualtiesRescued < i.casualties)
      return fail(s, "伤员尚未全部送达医院");
    record(s, `${id} 医疗交接确认完成`, "success");
  }
  i.checks[check] = true;
  return s;
}

/** 解除隔离：恢复现场，救援力量撤回，事故责任与损失归档保留。 */
export function liftIsolation(state: Shift, id: string): Shift {
  const s = copyShift(state);
  const idx = s.incidents.findIndex((x) => x.id === id);
  const i = s.incidents[idx];
  if (!i) return state;
  if (i.phase !== "checking") return fail(s, "处置与检查未完成，无法解除隔离");
  if (!checksComplete(i)) return fail(s, "请先完成全部解除前检查");
  if (i.spread > 1) return fail(s, "污染范围尚未完全回收");
  for (const u of [...s.rescueUnits])
    if (u.incidentId === id) sendUnitHome(s, u.id);
  const others = s.incidents.filter((x) => x.id !== id);
  for (const v of s.vehicles) {
    if (v.status !== "trapped") continue;
    // 仍处其他事故危险区的车辆继续被困，不因本次解除而释放
    const stillInDanger = others.some(
      (x) => distance(v.position, x.position) <= dangerRadius(x),
    );
    if (stillInDanger) continue;
    if (v.disabled) {
      if (i.vehicleId !== v.id) continue;
      v.disabled = undefined;
      v.status = "returning";
      const task = s.services.find((t) => t.id === v.serviceId);
      if (task && task.status !== "done") {
        task.status = "pending";
        task.vehicleId = undefined;
      }
      v.serviceId = undefined;
      v.origin = { ...v.position };
      v.target = { x: 830, y: 480 };
      v.progress = 0;
      v.tripDuration = 14;
      record(s, `${v.id} 已由拖车拖回车场检修`);
    } else {
      const task = s.services.find((t) => t.id === v.serviceId);
      if (task && (task.status === "working" || task.status === "travel")) {
        v.status = task.status;
      } else {
        v.status = "idle";
        v.serviceId = undefined;
      }
    }
  }
  const lossTotal = Math.round(i.losses);
  const bonus = i.breached ? 0 : 12;
  s.score += bonus;
  s.incidentLog.unshift({
    id: i.id,
    kind: i.kind,
    startedAt: i.startedAt,
    clearedAt: s.time,
    standId: i.standId,
    flightId: i.flightId,
    blame: i.blame,
    lossScore: lossTotal,
    casualties: i.casualties,
    peakSpread: Math.round(i.peakSpread),
    mode: i.mode,
  });
  s.incidentLog = s.incidentLog.slice(0, 10);
  s.incidents.splice(idx, 1);
  if (s.selectedIncidentId === id)
    s.selectedIncidentId = s.incidents[0]?.id;
  record(
    s,
    `${id} 隔离解除，现场恢复运行 · 事故损失 -${lossTotal}${bonus ? ` · 处置得当 +${bonus}` : ""}`,
    "success",
  );
  return s;
}
