export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "departing" | "departed";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: "pending" | "travel" | "working" | "done";
  progress: number;
  duration: number;
  vehicleId?: string;
}
export type VehicleStatus =
  "idle" | "travel" | "working" | "returning" | "trapped" | "evacuating";
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status: VehicleStatus;
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
  disabled?: boolean;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export type IncidentKind = "fuelLeak" | "collision" | "injury";
export type IncidentPhase = "reported" | "isolated" | "responding" | "checking";
export type ResponseMode = "partial" | "fullStop";
export type ResponsePriority = "rescueFirst" | "containFirst";
export type RescueKind = "fire" | "medical";
export type CheckKind = "fire" | "env" | "medical";
export interface Incident {
  id: string;
  kind: IncidentKind;
  position: Point;
  standId?: string;
  flightId?: string;
  vehicleId?: string;
  startedAt: number;
  phase: IncidentPhase;
  zoneRadius: number;
  mode: ResponseMode;
  priority: ResponsePriority;
  casualties: number;
  casualtiesRescued: number;
  contamination: number;
  spread: number;
  peakSpread: number;
  fireProgress: number;
  medicalProgress: number;
  cleanupProgress: number;
  checks: Record<CheckKind, boolean>;
  losses: number;
  breached: boolean;
  blame: string;
}
export interface IncidentRecord {
  id: string;
  kind: IncidentKind;
  startedAt: number;
  clearedAt: number;
  standId?: string;
  flightId?: string;
  blame: string;
  lossScore: number;
  casualties: number;
  peakSpread: number;
  mode: ResponseMode;
}
export interface RescueUnit {
  id: string;
  kind: RescueKind;
  status: "standby" | "enroute" | "onsite" | "returning";
  incidentId?: string;
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
}
export interface Shift {
  version: 1;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  incidents: Incident[];
  incidentLog: IncidentRecord[];
  rescueUnits: RescueUnit[];
  nextIncidentId: number;
  nextIncidentAt: number;
  events: Event[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  selectedIncidentId?: string;
  nextEventId: number;
}
export type CommandResult = (state: Shift) => Shift;
