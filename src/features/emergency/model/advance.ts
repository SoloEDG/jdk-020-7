import type { Incident, Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import {
  maybeSpawnIncident,
  needsCleanup,
  needsFire,
  needsMedical,
  unitHome,
} from "./incidents";
import { dangerRadius, MAX_SPREAD } from "../lib/zones";

const lossRates: Record<Incident["kind"], number> = {
  fuelLeak: 0.5,
  collision: 0.45,
  injury: 0.7,
};

export function advanceEmergency(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  maybeSpawnIncident(s);
  moveRescueUnits(s, seconds);
  for (const i of s.incidents) advanceIncident(s, i, seconds);
  trapVehicles(s);
  return s;
}

function moveRescueUnits(s: Shift, seconds: number): void {
  for (const u of s.rescueUnits) {
    if (u.status !== "enroute" && u.status !== "returning") continue;
    u.progress = Math.min(100, u.progress + (seconds / u.tripDuration) * 100);
    const t = Math.min(1, u.progress / 100);
    u.position = {
      x: u.origin.x + (u.target.x - u.origin.x) * t,
      y: u.origin.y + (u.target.y - u.origin.y) * t,
    };
    if (u.progress < 100) continue;
    if (u.status === "enroute") {
      u.status = "onsite";
      const i = s.incidents.find((x) => x.id === u.incidentId);
      if (i && i.phase === "isolated") i.phase = "responding";
      record(s, `${u.id} 已在安全距离外就位，开始处置`);
    } else {
      const incidentId = u.incidentId;
      u.status = "standby";
      u.incidentId = undefined;
      const i = s.incidents.find((x) => x.id === incidentId);
      if (
        i &&
        u.kind === "medical" &&
        i.medicalProgress >= 100 &&
        i.casualtiesRescued < i.casualties
      ) {
        i.casualtiesRescued = i.casualties;
        record(s, `${u.id} 已将 ${i.casualties} 名伤员送达医院`, "success");
      } else {
        record(s, `${u.id} 返回站点待命`);
      }
    }
  }
}

function advanceIncident(s: Shift, i: Incident, seconds: number): void {
  const fireOnsite = s.rescueUnits.filter(
    (u) => u.incidentId === i.id && u.kind === "fire" && u.status === "onsite",
  ).length;
  const medOnsite = s.rescueUnits.filter(
    (u) =>
      u.incidentId === i.id && u.kind === "medical" && u.status === "onsite",
  ).length;
  const modeFactor = i.mode === "fullStop" ? 0.45 : 1;
  const fireBoost = i.priority === "containFirst" ? 1.5 : 0.8;
  const medBoost = i.priority === "rescueFirst" ? 1.6 : 0.7;
  const spreadBoost = i.priority === "rescueFirst" ? 1.4 : 0.85;

  if (needsFire(i) && i.fireProgress < 100) {
    const grow =
      (i.contamination / 55) * 1.35 * modeFactor * spreadBoost * seconds;
    i.spread = Math.min(MAX_SPREAD, i.spread + grow);
  } else if (!needsCleanup(i) || i.cleanupProgress >= 100) {
    i.spread = Math.max(0, i.spread - 4.5 * seconds);
  }
  i.peakSpread = Math.max(i.peakSpread, i.spread);

  if (i.zoneRadius > 0 && !i.breached && i.spread > i.zoneRadius) {
    i.breached = true;
    i.losses += 15;
    s.score -= 15;
    record(s, `${i.id} 污染已突破隔离区！影响范围继续扩大`, "warning");
  }

  if (needsFire(i) && i.fireProgress < 100 && fireOnsite > 0) {
    i.fireProgress = Math.min(
      100,
      i.fireProgress + 2.6 * fireOnsite * fireBoost * seconds,
    );
    if (i.fireProgress >= 100)
      record(s, `${i.id} 火势与泄漏源已受控`, "success");
  }
  if (
    needsCleanup(i) &&
    i.fireProgress >= 100 &&
    i.cleanupProgress < 100 &&
    fireOnsite > 0
  ) {
    i.cleanupProgress = Math.min(
      100,
      i.cleanupProgress + 2.1 * fireOnsite * seconds,
    );
    if (i.cleanupProgress >= 100)
      record(s, `${i.id} 污染清理完成，废液已转运处置`, "success");
  }
  if (needsMedical(i) && i.medicalProgress < 100 && medOnsite > 0) {
    i.medicalProgress = Math.min(
      100,
      i.medicalProgress + 3.2 * medOnsite * medBoost * seconds,
    );
    if (i.medicalProgress >= 100)
      record(s, `${i.id} 伤员现场处置完成，开始转运送医`, "success");
  }
  if (needsMedical(i) && i.medicalProgress >= 100) {
    for (const u of s.rescueUnits.filter(
      (x) =>
        x.incidentId === i.id && x.kind === "medical" && x.status === "onsite",
    )) {
      u.status = "returning";
      u.origin = { ...u.position };
      u.target = { ...unitHome[u.id] };
      u.progress = 0;
      u.tripDuration =
        3 + Math.hypot(u.target.x - u.origin.x, u.target.y - u.origin.y) / 85;
      record(s, `${u.id} 转运伤员前往医院`);
    }
  }

  if (
    (i.phase === "isolated" || i.phase === "responding") &&
    progressComplete(i)
  ) {
    i.phase = "checking";
    record(s, `${i.id} 现场处置完成，请执行解除前检查`);
  }

  const unrescued = i.casualties - i.casualtiesRescued;
  const delta =
    lossRates[i.kind] *
    (1 + 0.5 * unrescued) *
    (i.breached ? 1.8 : 1) *
    seconds;
  i.losses += delta;
  s.score -= delta;
}

function progressComplete(i: Incident): boolean {
  return (
    (!needsFire(i) || i.fireProgress >= 100) &&
    (!needsCleanup(i) || i.cleanupProgress >= 100) &&
    (!needsMedical(i) || i.medicalProgress >= 100)
  );
}

/** 驶入或滞留危险区的车辆被困在原位，等待撤离指令。 */
function trapVehicles(s: Shift): void {
  for (const v of s.vehicles) {
    if (v.status === "trapped" || v.status === "evacuating") continue;
    const inDanger = s.incidents.some(
      (i) =>
        Math.hypot(v.position.x - i.position.x, v.position.y - i.position.y) <=
        dangerRadius(i),
    );
    if (inDanger) {
      v.status = "trapped";
      record(s, `${v.id} 被困在危险区内，等待撤离指令`, "warning");
    }
  }
}
