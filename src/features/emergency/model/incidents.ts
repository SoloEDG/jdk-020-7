import type {
  CheckKind,
  Incident,
  IncidentKind,
  IncidentPhase,
  Point,
  RescueUnit,
  Shift,
} from "../../../shared/types";
import { record } from "../../../shared/document";

export const unitHome: Record<string, Point> = {
  "FIRE-01": { x: 818, y: 190 },
  "FIRE-02": { x: 872, y: 190 },
  "MED-01": { x: 818, y: 254 },
  "MED-02": { x: 872, y: 254 },
};

export function initialRescueUnits(): RescueUnit[] {
  return ["FIRE-01", "FIRE-02", "MED-01", "MED-02"].map((id) => ({
    id,
    kind: id.startsWith("FIRE") ? "fire" : "medical",
    status: "standby",
    position: { ...unitHome[id] },
    origin: { ...unitHome[id] },
    target: { ...unitHome[id] },
    progress: 0,
    tripDuration: 8,
  }));
}

export const incidentCatalog: Record<
  IncidentKind,
  { label: string; english: string; icon: string }
> = {
  fuelLeak: { label: "燃油泄漏", english: "FUEL SPILL", icon: "◍" },
  collision: { label: "车辆碰撞", english: "COLLISION", icon: "✖" },
  injury: { label: "人员受伤", english: "INJURY", icon: "✚" },
};

export const phaseLabels: Record<IncidentPhase, string> = {
  reported: "待隔离",
  isolated: "已隔离",
  responding: "处置中",
  checking: "待检查",
};

export const checkLabels: Record<CheckKind, string> = {
  fire: "消防复检",
  env: "环境检测",
  medical: "医疗交接确认",
};

export function needsFire(i: Incident): boolean {
  return i.contamination > 0;
}
export function needsCleanup(i: Incident): boolean {
  return i.contamination > 0;
}
export function needsMedical(i: Incident): boolean {
  return i.casualties > 0;
}
export function requiredChecks(i: Incident): CheckKind[] {
  const list: CheckKind[] = [];
  if (needsFire(i)) list.push("fire");
  if (needsCleanup(i)) list.push("env");
  if (needsMedical(i)) list.push("medical");
  return list;
}
export function checksComplete(i: Incident): boolean {
  return requiredChecks(i).every((c) => i.checks[c]);
}

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** 基于现场车辆与飞机的真实位置生成事故；无现场活动时推迟。 */
export function maybeSpawnIncident(s: Shift): void {
  if (s.time < s.nextIncidentAt || s.incidents.length >= 2) return;
  const roll = hash(s.nextIncidentId * 7919 + Math.floor(s.time) * 31);
  const pick = hash(s.nextIncidentId * 104729 + Math.floor(s.time) * 17 + 5);
  const fuelTask = s.services.find(
    (t) => t.kind === "fuel" && t.status === "working",
  );
  const travelers = s.vehicles.filter((v) => v.status === "travel");
  const workers = s.services.filter((t) => t.status === "working");
  const parked = s.flights.filter((f) => f.status === "parked" && f.standId);
  const id = `INC-${String(s.nextIncidentId).padStart(2, "0")}`;
  const base = {
    id,
    startedAt: s.time,
    phase: "reported" as IncidentPhase,
    zoneRadius: 0,
    mode: "partial" as const,
    priority: "containFirst" as const,
    fireProgress: 0,
    medicalProgress: 0,
    cleanupProgress: 0,
    checks: { fire: false, env: false, medical: false },
    losses: 0,
    breached: false,
    peakSpread: 0,
  };
  const standOf = (flightId: string) =>
    s.stands.find(
      (x) => x.id === s.flights.find((f) => f.id === flightId)?.standId,
    );
  let spawned: Incident | undefined;
  if (fuelTask && roll < 0.45) {
    const stand = standOf(fuelTask.flightId);
    if (stand) {
      const v = s.vehicles.find((x) => x.id === fuelTask.vehicleId);
      spawned = {
        ...base,
        kind: "fuelLeak",
        position: { x: stand.x + 40, y: stand.y + 24 },
        standId: stand.id,
        flightId: fuelTask.flightId,
        casualties: 0,
        casualtiesRescued: 0,
        contamination: 45 + Math.round(pick * 20),
        spread: 26,
        blame: v
          ? `加油车 ${v.id} 接驳阀门未锁紧 · 地服公司主责`
          : `机位 ${stand.id} 输油接头老化 · 机务维修责任`,
      };
    }
  } else if (travelers.length > 0 && roll < 0.72) {
    const v = travelers[Math.floor(pick * travelers.length) % travelers.length];
    const task = s.services.find((t) => t.id === v.serviceId);
    if (task) {
      task.status = "pending";
      task.vehicleId = undefined;
    }
    v.status = "trapped";
    v.disabled = true;
    v.serviceId = undefined;
    spawned = {
      ...base,
      kind: "collision",
      position: { ...v.position },
      vehicleId: v.id,
      casualties: 1 + (pick > 0.5 ? 1 : 0),
      casualtiesRescued: 0,
      contamination: 25,
      spread: 18,
      blame: `${v.id} 驾驶员超速且未按标志让行 · 车队主责`,
    };
  } else if (workers.length > 0) {
    const t = workers[Math.floor(pick * workers.length) % workers.length];
    const stand = standOf(t.flightId);
    if (stand) {
      spawned = {
        ...base,
        kind: "injury",
        position: { x: stand.x - 30, y: stand.y + 40 },
        standId: stand.id,
        flightId: t.flightId,
        casualties: 1 + (pick > 0.6 ? 1 : 0),
        casualtiesRescued: 0,
        contamination: 0,
        spread: 12,
        blame: `${t.flightId} 保障现场安全防护缺失 · 地服班组责任`,
      };
    }
  } else if (parked.length > 0) {
    const f = parked[Math.floor(pick * parked.length) % parked.length];
    const stand = s.stands.find((x) => x.id === f.standId);
    if (stand) {
      spawned = {
        ...base,
        kind: "fuelLeak",
        position: { x: stand.x + 40, y: stand.y + 24 },
        standId: stand.id,
        flightId: f.id,
        casualties: 0,
        casualtiesRescued: 0,
        contamination: 35,
        spread: 22,
        blame: `机位 ${stand.id} 地井接头渗漏 · 机务维修责任`,
      };
    }
  }
  if (!spawned) {
    s.nextIncidentAt = s.time + 40;
    return;
  }
  spawned.peakSpread = spawned.spread;
  s.incidents.push(spawned);
  s.selectedIncidentId = id;
  s.nextIncidentId++;
  s.nextIncidentAt = s.time + 140 + pick * 120;
  record(
    s,
    `⚠ ${id} · ${incidentCatalog[spawned.kind].label}，请立即划定隔离区并组织处置`,
    "warning",
  );
}
