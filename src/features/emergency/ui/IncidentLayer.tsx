import type { Shift } from "../../../shared/types";
import { incidentCatalog } from "../model/incidents";

interface Props {
  state: Shift;
  onIncident: (id: string) => void;
}

export function IncidentLayer({ state, onIncident }: Props) {
  return (
    <g>
      <rect x="788" y="152" width="118" height="52" rx="5" fill="#eadfd4" stroke="#cda98d" />
      <text x="798" y="169" className="station-label">
        FIRE STATION
      </text>
      <rect x="788" y="216" width="118" height="52" rx="5" fill="#e9ece2" stroke="#b3c0ab" />
      <text x="798" y="233" className="station-label">
        MEDICAL
      </text>
      {state.incidents.map((i) => (
        <g key={i.id}>
          {i.zoneRadius > 0 && (
            <circle
              cx={i.position.x}
              cy={i.position.y}
              r={i.zoneRadius}
              fill="none"
              stroke="#c2542f"
              strokeWidth="2"
              strokeDasharray="10 7"
              className="zone-ring"
            />
          )}
          {i.spread > 1 && (
            <circle
              cx={i.position.x}
              cy={i.position.y}
              r={Math.max(2, i.spread)}
              fill="#c23b2b"
              fillOpacity="0.16"
              stroke="#b03a26"
              strokeOpacity="0.45"
              strokeWidth="1"
            />
          )}
          <g
            transform={`translate(${i.position.x} ${i.position.y})`}
            className="incident-marker"
            onClick={() => onIncident(i.id)}
          >
            <circle r="19" fill="#c2542f" fillOpacity="0.25" className="halo" />
            <circle r="12.5" fill="#fbf1e4" stroke="#c2542f" strokeWidth="2" />
            <text y="4.5" textAnchor="middle" fontSize="12" fill="#c2542f">
              {incidentCatalog[i.kind].icon}
            </text>
            <text y="-24" textAnchor="middle" className="incident-id">
              {i.id}
            </text>
          </g>
        </g>
      ))}
      {state.rescueUnits.map((u) => (
        <g
          key={u.id}
          transform={`translate(${u.position.x} ${u.position.y})`}
          className="vehicle-marker"
        >
          <rect
            x="-11"
            y="-6.5"
            width="22"
            height="13"
            rx="3"
            fill={u.kind === "fire" ? "#c0503f" : "#f6f3e8"}
            stroke={u.kind === "fire" ? "#f0d5c5" : "#c0503f"}
            strokeWidth="1.5"
          />
          {u.kind === "medical" ? (
            <text y="3.5" textAnchor="middle" fontSize="8" fill="#c0503f">
              ✚
            </text>
          ) : (
            <rect x="5" y="-4" width="4.5" height="8" rx="1" fill="#f0d5c5" />
          )}
          {u.status === "enroute" && (
            <circle
              r="17"
              fill="none"
              stroke="#c0503f"
              strokeOpacity="0.55"
              className="moving-ring"
            />
          )}
        </g>
      ))}
    </g>
  );
}
