import type { Shift } from "../../../shared/types";
const kinds = ["fuel", "baggage", "clean"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "done"];
const vehicleStates = [
  "idle",
  "travel",
  "working",
  "returning",
  "trapped",
  "evacuating",
];
const incidentKinds = ["fuelLeak", "collision", "injury"];
const incidentPhases = ["reported", "isolated", "responding", "checking"];
const responseModes = ["partial", "fullStop"];
const responsePriorities = ["rescueFirst", "containFirst"];
const rescueKinds = ["fire", "medical"];
const rescueStates = ["standby", "enroute", "onsite", "returning"];
const zoneRadii = [0, 70, 110, 150];
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function progress(value: unknown): boolean {
  return finite(value) && value >= 0 && value <= 100;
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown, length: number): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(row) &&
    unique(value)
  );
}
function list(value: unknown, max: number): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(row) &&
    unique(value)
  );
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 1 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId) ||
    !finite(value.nextIncidentId) ||
    value.nextIncidentId < 1 ||
    !finite(value.nextIncidentAt) ||
    value.nextIncidentAt < 0
  )
    return false;
  if (
    !collection(value.flights, 6) ||
    !collection(value.stands, 6) ||
    !collection(value.vehicles, 6) ||
    !collection(value.services, 18) ||
    !collection(value.rescueUnits, 4) ||
    !list(value.incidents, 2) ||
    !list(value.incidentLog, 10) ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return false;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services,
    incidents = value.incidents,
    units = value.rescueUnits,
    log = value.incidentLog;
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id)),
    incidentIds = new Set(incidents.map((x) => x.id));
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.standId === undefined || standIds.has(f.standId)),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        progress(v.progress) &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        (v.serviceId === undefined || serviceIds.has(v.serviceId)) &&
        (v.disabled === undefined || typeof v.disabled === "boolean"),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        progress(s.progress) &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || vehicleIds.has(s.vehicleId)),
    )
  )
    return false;
  if (
    !incidents.every(
      (i) =>
        text(i.id) &&
        incidentKinds.includes(i.kind as string) &&
        point(i.position) &&
        incidentPhases.includes(i.phase as string) &&
        finite(i.startedAt) &&
        i.startedAt >= 0 &&
        zoneRadii.includes(i.zoneRadius as number) &&
        responseModes.includes(i.mode as string) &&
        responsePriorities.includes(i.priority as string) &&
        Number.isInteger(i.casualties) &&
        (i.casualties as number) >= 0 &&
        Number.isInteger(i.casualtiesRescued) &&
        (i.casualtiesRescued as number) >= 0 &&
        (i.casualtiesRescued as number) <= (i.casualties as number) &&
        finite(i.contamination) &&
        i.contamination >= 0 &&
        i.contamination <= 100 &&
        finite(i.spread) &&
        i.spread >= 0 &&
        finite(i.peakSpread) &&
        i.peakSpread >= i.spread &&
        progress(i.fireProgress) &&
        progress(i.medicalProgress) &&
        progress(i.cleanupProgress) &&
        row(i.checks) &&
        typeof i.checks.fire === "boolean" &&
        typeof i.checks.env === "boolean" &&
        typeof i.checks.medical === "boolean" &&
        finite(i.losses) &&
        i.losses >= 0 &&
        typeof i.breached === "boolean" &&
        text(i.blame) &&
        (i.standId === undefined || standIds.has(i.standId)) &&
        (i.flightId === undefined || flightIds.has(i.flightId)) &&
        (i.vehicleId === undefined || vehicleIds.has(i.vehicleId)) &&
        (i.phase === "reported"
          ? (i.zoneRadius as number) === 0
          : (i.zoneRadius as number) > 0),
    )
  )
    return false;
  if (
    !units.every((u) => {
      if (
        !rescueKinds.includes(u.kind as string) ||
        !rescueStates.includes(u.status as string) ||
        !point(u.position) ||
        !point(u.origin) ||
        !point(u.target) ||
        !progress(u.progress) ||
        !finite(u.tripDuration) ||
        u.tripDuration <= 0
      )
        return false;
      if (u.status === "standby") return u.incidentId === undefined;
      if (u.status === "enroute" || u.status === "onsite")
        return incidentIds.has(u.incidentId);
      return u.incidentId === undefined || incidentIds.has(u.incidentId);
    })
  )
    return false;
  if (
    !log.every(
      (r) =>
        text(r.id) &&
        incidentKinds.includes(r.kind as string) &&
        finite(r.startedAt) &&
        finite(r.clearedAt) &&
        r.clearedAt >= r.startedAt &&
        text(r.blame) &&
        finite(r.lossScore) &&
        r.lossScore >= 0 &&
        Number.isInteger(r.casualties) &&
        (r.casualties as number) >= 0 &&
        finite(r.peakSpread) &&
        r.peakSpread >= 0 &&
        responseModes.includes(r.mode as string) &&
        (r.standId === undefined || standIds.has(r.standId)) &&
        (r.flightId === undefined || flightIds.has(r.flightId)),
    )
  )
    return false;
  if (
    !flights.every((f) =>
      kinds.every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k).length ===
          1,
      ),
    )
  )
    return false;
  const occupied = flights
    .filter((f) => f.status !== "departed" && f.standId !== undefined)
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return false;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        (standIds.has(f.standId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return false;
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.vehicleId === undefined && finite(s.progress) && s.progress < 100;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      if (s.status === "done") return s.progress === 100;
      return (
        v.serviceId === s.id &&
        (v.status === s.status || v.status === "trapped") &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every((v) => {
      if (["travel", "working"].includes(v.status as string))
        return services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            s.status === v.status,
        );
      if (v.status === "trapped")
        return (
          v.serviceId === undefined ||
          services.some(
            (s) =>
              s.id === v.serviceId &&
              s.vehicleId === v.id &&
              ["travel", "working"].includes(s.status as string),
          )
        );
      return true;
    })
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        !v.disabled || incidents.some((i) => i.vehicleId === v.id),
    )
  )
    return false;
  if (
    incidents.length === 0 &&
    vehicles.some((v) => v.status === "trapped")
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId)) &&
    (value.selectedIncidentId === undefined ||
      incidentIds.has(value.selectedIncidentId))
  );
}
