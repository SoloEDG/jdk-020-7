import type { Incident, RescueUnit, Shift } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import {
  checkLabels,
  checksComplete,
  incidentCatalog,
  needsCleanup,
  needsFire,
  needsMedical,
  phaseLabels,
  requiredChecks,
} from "../model/incidents";
import {
  dispatchRescueUnit,
  evacuateVehicle,
  isolateIncident,
  liftIsolation,
  recallRescueUnit,
  runCheck,
  checkReady,
  selectIncident,
  setPriority,
  setResponseMode,
} from "../model/response";
import { ZONE_RADII } from "../lib/zones";

interface PanelProps {
  state: Shift;
  onChange: (s: Shift) => void;
}

export function EmergencyPanel({ state, onChange }: PanelProps) {
  const active = state.incidents;
  const selected =
    active.find((i) => i.id === state.selectedIncidentId) ?? active[0];
  const freeFire = state.rescueUnits.filter(
    (u) => u.kind === "fire" && u.status === "standby",
  ).length;
  const freeMed = state.rescueUnits.filter(
    (u) => u.kind === "medical" && u.status === "standby",
  ).length;
  return (
    <section className={`emergency-panel ${active.length ? "active" : ""}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">EMERGENCY RESPONSE</span>
          <h2>
            机坪应急{" "}
            <small>
              {active.length ? `${active.length} 起事故处置中` : "救援力量待命"}
            </small>
          </h2>
        </div>
        <span className="rescue-summary">
          消防 空闲 {freeFire}/2 · 医疗 空闲 {freeMed}/2
        </span>
      </div>
      {active.length > 1 && (
        <div className="incident-tabs">
          {active.map((i) => (
            <button
              key={i.id}
              className={selected && i.id === selected.id ? "on" : ""}
              onClick={() => onChange(selectIncident(state, i.id))}
            >
              {i.id} · {incidentCatalog[i.kind].label}
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <IncidentCard state={state} incident={selected} onChange={onChange} />
      ) : (
        <p className="emergency-idle">
          消防与医疗力量已在东侧站点待命。事故处置流程：划定隔离区 →
          派遣消防/医疗 → 完成解除前检查 → 解除隔离恢复运行。
        </p>
      )}
      {state.incidentLog.length > 0 && <IncidentArchive state={state} />}
    </section>
  );
}

function IncidentCard({
  state,
  incident: i,
  onChange,
}: PanelProps & { incident: Incident }) {
  const info = incidentCatalog[i.kind];
  const trapped = state.vehicles.filter((v) => v.status === "trapped");
  const readyToLift =
    i.phase === "checking" && checksComplete(i) && i.spread <= 1;
  return (
    <div className={`incident-card ${i.kind}`}>
      <div className="incident-head">
        <span className="incident-icon">{info.icon}</span>
        <div>
          <strong>
            {i.id} · {info.label}
          </strong>
          <span>
            {locationText(i)} · 发生于 {clockLabel(i.startedAt)}
          </span>
        </div>
        <em className={`phase-chip ${i.phase}`}>{phaseLabels[i.phase]}</em>
      </div>
      <div className="incident-stats">
        <span>
          影响范围<b>{Math.round(i.spread)}m</b>
        </span>
        <span>
          隔离区<b>{i.zoneRadius ? `${i.zoneRadius}m` : "未划定"}</b>
        </span>
        <span>
          伤员<b>
            {i.casualtiesRescued}/{i.casualties}
          </b>
        </span>
        <span>
          损失<b>-{Math.round(i.losses)}</b>
        </span>
      </div>
      {i.breached && (
        <p className="breach-note">⚠ 污染已突破隔离区，影响范围正在扩大</p>
      )}
      {i.phase === "reported" && (
        <div className="phase-block">
          <p className="hint-label">
            01 / 划定隔离区 · 范围越大越安全，但封锁的机位越多
          </p>
          <ModePriority state={state} incident={i} onChange={onChange} />
          <div className="zone-choices">
            {ZONE_RADII.map((r) => (
              <button
                key={r}
                data-testid={`isolate-${r}`}
                title={
                  r === 70
                    ? "封锁范围小，但污染易突破"
                    : r === 150
                      ? "安全余度大，但封锁更多机位"
                      : "兼顾安全与运行"
                }
                onClick={() => onChange(isolateIncident(state, i.id, r))}
              >
                <strong>{r}m</strong>
                <span>{r === 70 ? "紧凑" : r === 110 ? "标准" : "扩大"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {i.phase !== "reported" && (
        <>
          <ModePriority state={state} incident={i} onChange={onChange} />
          <div className="meters">
            {needsFire(i) && <Meter label="火势控制" value={i.fireProgress} />}
            {needsMedical(i) && (
              <Meter label="医疗救援" value={i.medicalProgress} />
            )}
            {needsCleanup(i) && (
              <Meter label="污染清理" value={i.cleanupProgress} />
            )}
          </div>
          <div className="unit-list">
            {state.rescueUnits.map((u) => (
              <UnitRow key={u.id} state={state} incident={i} unit={u} onChange={onChange} />
            ))}
          </div>
          {trapped.length > 0 && (
            <div className="trapped-list">
              <p className="hint-label">被困车辆 · 只能沿路线撤离，无法直接调离</p>
              {trapped.map((v) => (
                <div className="trapped-row" key={v.id}>
                  <strong>{v.id}</strong>
                  <span>{v.disabled ? "事故受损 · 待解除后拖离" : "滞留危险区"}</span>
                  {!v.disabled && (
                    <button
                      data-testid={`evacuate-${v.id}`}
                      onClick={() => onChange(evacuateVehicle(state, v.id))}
                    >
                      撤离 ↗
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {i.phase === "checking" && (
        <div className="phase-block">
          <p className="hint-label">02 / 解除前检查 · 全部通过后方可恢复</p>
          <div className="check-row">
            {requiredChecks(i).map((c) => {
              const ready = checkReady(state, i, c);
              return (
                <button
                  key={c}
                  data-testid={`check-${c}`}
                  className={i.checks[c] ? "done" : ""}
                  disabled={i.checks[c] || !ready}
                  title={
                    i.checks[c] || ready
                      ? undefined
                      : c === "fire"
                        ? "需要消防力量留在现场且火势受控"
                        : c === "env"
                          ? "需要污染清理完毕且范围收回隔离区内"
                          : "需要伤员全部送达医院"
                  }
                  onClick={() => onChange(runCheck(state, i.id, c))}
                >
                  {i.checks[c] ? "✓ " : ""}
                  {checkLabels[c]}
                </button>
              );
            })}
          </div>
          <button
            className="primary full"
            data-testid="lift-isolation"
            disabled={!readyToLift}
            onClick={() => onChange(liftIsolation(state, i.id))}
          >
            解除隔离 · 恢复运行 <span>→</span>
          </button>
          {!readyToLift && checksComplete(i) && i.spread > 1 && (
            <p className="hint-label">
              等待污染范围完全回收（当前 {Math.ceil(i.spread)}m）
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModePriority({
  state,
  incident: i,
  onChange,
}: PanelProps & { incident: Incident }) {
  return (
    <div className="toggle-grid">
      <div>
        <span>封锁方式</span>
        <div className="segmented">
          <button
            className={i.mode === "partial" ? "on" : ""}
            data-testid="mode-partial"
            onClick={() => onChange(setResponseMode(state, i.id, "partial"))}
          >
            局部封锁
          </button>
          <button
            className={i.mode === "fullStop" ? "on" : ""}
            data-testid="mode-fullstop"
            onClick={() => onChange(setResponseMode(state, i.id, "fullStop"))}
          >
            全面停场
          </button>
        </div>
        <small>
          {i.mode === "partial"
            ? "保住其他航班 · 污染扩散更快"
            : "全场作业暂停 · 扩散减缓 · 延误明显"}
        </small>
      </div>
      <div>
        <span>处置优先级</span>
        <div className="segmented">
          <button
            className={i.priority === "rescueFirst" ? "on" : ""}
            data-testid="priority-rescue"
            onClick={() => onChange(setPriority(state, i.id, "rescueFirst"))}
          >
            先救人
          </button>
          <button
            className={i.priority === "containFirst" ? "on" : ""}
            data-testid="priority-contain"
            onClick={() => onChange(setPriority(state, i.id, "containFirst"))}
          >
            先控扩散
          </button>
        </div>
        <small>
          {i.priority === "rescueFirst"
            ? "医疗加速 · 污染扩散加快"
            : "控制加速 · 伤员救援放缓"}
        </small>
      </div>
    </div>
  );
}

function UnitRow({
  state,
  incident: i,
  unit: u,
  onChange,
}: PanelProps & { incident: Incident; unit: RescueUnit }) {
  const needed = u.kind === "fire" ? needsFire(i) : needsMedical(i);
  const mine = u.incidentId === i.id;
  const statusText =
    u.status === "standby"
      ? "站点待命"
      : u.status === "enroute"
        ? `途中 ${Math.floor(u.progress)}%`
        : u.status === "onsite"
          ? "现场处置"
          : u.kind === "medical" && mine && i.medicalProgress >= 100
            ? "转运伤员送医"
            : "返回站点";
  return (
    <div className={`unit-row ${u.kind}`}>
      <span className="unit-kind">{u.kind === "fire" ? "消防" : "医疗"}</span>
      <strong>{u.id}</strong>
      <span className="unit-status">{statusText}</span>
      {u.status === "standby" && (
        <button
          data-testid={`dispatch-${u.id}`}
          disabled={!needed || i.zoneRadius === 0}
          title={
            i.zoneRadius === 0
              ? "请先划定隔离区"
              : needed
                ? "派遣至安全距离外集结"
                : "该事故无需此力量"
          }
          onClick={() => onChange(dispatchRescueUnit(state, u.id, i.id))}
        >
          派遣
        </button>
      )}
      {mine && (u.status === "onsite" || u.status === "enroute") && (
        <button
          className="ghost"
          data-testid={`recall-${u.id}`}
          onClick={() => onChange(recallRescueUnit(state, u.id))}
        >
          撤回
        </button>
      )}
      {!mine && u.status !== "standby" && <em>→ {u.incidentId ?? "站点"}</em>}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span>
        {label}
        <b>{Math.floor(value)}%</b>
      </span>
      <div className="track">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function locationText(i: Incident): string {
  if (i.kind === "collision" && i.vehicleId) return `${i.vehicleId} 事故现场`;
  if (i.standId) return `机位 ${i.standId}${i.flightId ? ` · ${i.flightId}` : ""}`;
  return "机坪区域";
}

function IncidentArchive({ state }: { state: Shift }) {
  return (
    <div className="incident-log">
      <div className="subheading">
        <h3>事故责任与损失记录</h3>
        <span>ARCHIVE</span>
      </div>
      {state.incidentLog.map((r) => (
        <div className="log-row" key={r.id}>
          <div>
            <strong>
              {r.id} · {incidentCatalog[r.kind].label}
            </strong>
            <em>
              {r.mode === "partial" ? "局部封锁" : "全面停场"} ·{" "}
              {clockLabel(r.startedAt)}–{clockLabel(r.clearedAt)}
            </em>
          </div>
          <p>{r.blame}</p>
          <span>
            损失 -{r.lossScore} 分 ·{" "}
            {r.casualties > 0 ? `${r.casualties} 名伤员已送医` : "无人员伤亡"} ·
            峰值扩散 {r.peakSpread}m · 污染已清理
          </span>
        </div>
      ))}
    </div>
  );
}
