import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { supabase } from "./supabase";
import "leaflet/dist/leaflet.css";

interface Incident {
  id: number;
  image_url: string;
  latitude: number;
  longitude: number;
  waste_type: string;
  pollution_level: "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO";
  detected_objects: number;
  keywords: string[];
  is_critical: boolean;
  created_at: string;
}

interface Zone {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

interface ZoneStat {
  zone: Zone;
  incidents: Incident[];
  maxLevel: string;
  criticalCount: number;
  alertLevel: "normal" | "warning" | "danger" | "critical";
}

const ZONES: Zone[] = [
  { name: "El Prado",          lat: -16.495, lng: -68.133, radiusKm: 0.7 },
  { name: "Villa Fátima",      lat: -16.480, lng: -68.110, radiusKm: 0.7 },
  { name: "Miraflores",        lat: -16.505, lng: -68.120, radiusKm: 0.7 },
  { name: "San Pedro",         lat: -16.502, lng: -68.138, radiusKm: 0.7 },
  { name: "Sopocachi",         lat: -16.510, lng: -68.130, radiusKm: 0.7 },
  { name: "Obrajes",           lat: -16.540, lng: -68.120, radiusKm: 0.7 },
  { name: "Calacoto",          lat: -16.550, lng: -68.100, radiusKm: 0.7 },
  { name: "Achumani",          lat: -16.565, lng: -68.095, radiusKm: 0.7 },
  { name: "Cota Cota",         lat: -16.558, lng: -68.108, radiusKm: 0.7 },
  { name: "Tembladerani",      lat: -16.490, lng: -68.145, radiusKm: 0.7 },
  { name: "Periférica",        lat: -16.470, lng: -68.130, radiusKm: 0.7 },
  { name: "Alto Lima",         lat: -16.460, lng: -68.120, radiusKm: 0.7 },
  { name: "Villa El Carmen",   lat: -16.475, lng: -68.150, radiusKm: 0.7 },
  { name: "Cotahuma",          lat: -16.500, lng: -68.148, radiusKm: 0.7 },
  { name: "Max Paredes",       lat: -16.488, lng: -68.138, radiusKm: 0.7 },
  { name: "Centro",            lat: -16.497, lng: -68.143, radiusKm: 0.6 },
  { name: "Garita de Lima",    lat: -16.482, lng: -68.143, radiusKm: 0.6 },
  { name: "Kupini",            lat: -16.514, lng: -68.145, radiusKm: 0.7 },
  { name: "Bolognia",          lat: -16.522, lng: -68.128, radiusKm: 0.7 },
  { name: "San Jorge",         lat: -16.508, lng: -68.118, radiusKm: 0.6 },
];

const LEVEL_COLOR: Record<string, string> = {
  BAJO:    "#22c55e",
  MEDIO:   "#f59e0b",
  ALTO:    "#f97316",
  CRÍTICO: "#ef4444",
};

const LEVEL_BG: Record<string, string> = {
  BAJO:    "#14532d",
  MEDIO:   "#78350f",
  ALTO:    "#7c2d12",
  CRÍTICO: "#7f1d1d",
};

const ALERT_COLORS = {
  normal:   { bg: "#1e3a5f", border: "#3b82f6", text: "#60a5fa", label: "Normal" },
  warning:  { bg: "#78350f", border: "#f59e0b", text: "#fcd34d", label: "⚠️ Atención" },
  danger:   { bg: "#7c2d12", border: "#f97316", text: "#fdba74", label: "🔶 Peligro" },
  critical: { bg: "#7f1d1d", border: "#ef4444", text: "#fca5a5", label: "🚨 Crítico" },
};

const LA_PAZ_CENTER: [number, number] = [-16.505, -68.128];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAlertLevel(incidents: Incident[]): ZoneStat["alertLevel"] {
  const critical = incidents.filter((i) => i.is_critical).length;
  const total = incidents.length;
  if (critical >= 2 || total >= 6) return "critical";
  if (critical === 1 || total >= 4) return "danger";
  if (total >= 2) return "warning";
  return "normal";
}

function getMaxLevel(incidents: Incident[]): string {
  const order = ["CRÍTICO", "ALTO", "MEDIO", "BAJO"];
  for (const level of order) {
    if (incidents.some((i) => i.pollution_level === level)) return level;
  }
  return "BAJO";
}

// Componente interno que puede llamar useMap() y también recibir el flyTo target
function MapController({ flyTarget }: { flyTarget: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget) {
      map.flyTo([flyTarget.lat, flyTarget.lng], 15, { duration: 1.2 });
    }
  }, [flyTarget, map]);
  return null;
}

function ZoneOverlay({ zoneStat }: { zoneStat: ZoneStat }) {
  const { zone, incidents, alertLevel } = zoneStat;
  const alert = ALERT_COLORS[alertLevel];
  const radius = Math.min(30 + incidents.length * 8, 90);
  if (incidents.length === 0) return null;
  return (
    <CircleMarker
      center={[zone.lat, zone.lng]}
      radius={radius}
      pathOptions={{
        fillColor: alert.border,
        color: alert.border,
        weight: 2,
        fillOpacity: 0.18,
        dashArray: alertLevel === "critical" ? "6 4" : undefined,
      }}
    >
      <Popup>
        <div style={{ minWidth: 200, fontFamily: "sans-serif" }}>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📍 {zone.name}</p>
          <p style={{
            padding: "3px 10px", background: alert.bg, color: alert.text,
            borderRadius: 6, display: "inline-block", fontWeight: 700, fontSize: 12, marginBottom: 8,
          }}>{alert.label}</p>
          <p style={{ fontSize: 13 }}>🗂️ Incidencias: <strong>{incidents.length}</strong></p>
          <p style={{ fontSize: 13 }}>🔴 Críticas: <strong>{zoneStat.criticalCount}</strong></p>
          <p style={{ fontSize: 13 }}>📊 Nivel máx: <strong style={{ color: LEVEL_COLOR[zoneStat.maxLevel] }}>{zoneStat.maxLevel}</strong></p>
        </div>
      </Popup>
    </CircleMarker>
  );
}

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeZone, setActiveZone] = useState<ZoneStat | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  const fetchIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) {
      setIncidents(data);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 3000);
    const channel = supabase
      .channel("incidents-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, () => fetchIncidents())
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [fetchIncidents]);

  const zoneStats: ZoneStat[] = useMemo(() => {
    return ZONES.map((zone) => {
      const zoneIncidents = incidents.filter(
        (i) => distanceKm(i.latitude, i.longitude, zone.lat, zone.lng) <= zone.radiusKm
      );
      return {
        zone,
        incidents: zoneIncidents,
        maxLevel: getMaxLevel(zoneIncidents),
        criticalCount: zoneIncidents.filter((i) => i.is_critical).length,
        alertLevel: getAlertLevel(zoneIncidents),
      };
    });
  }, [incidents]);

  const alertZones = useMemo(
    () => zoneStats.filter((z) => z.alertLevel !== "normal" && z.incidents.length > 0),
    [zoneStats]
  );

  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.is_critical).length,
    high: incidents.filter((i) => i.pollution_level === "ALTO").length,
    alertZones: alertZones.length,
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const handleZoneClick = (zs: ZoneStat) => {
    if (zs.incidents.length === 0) return;
    const isSame = activeZone?.zone.name === zs.zone.name;
    setActiveZone(isSame ? null : zs);
    setSelectedIncident(null);
    if (!isSame) {
      setFlyTarget({ lat: zs.zone.lat, lng: zs.zone.lng });
    }
  };

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={{ fontSize: 24 }}>🗺️</span>
          <div>
            <h1 style={s.headerTitle}>Dashboard Ambiental — La Paz</h1>
            <p style={s.headerSub}>Sistema de Detección y Clasificación de Basura Urbana</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <div style={s.updateBadge}>🔄 {lastUpdate.toLocaleTimeString("es-BO")}</div>
          {stats.critical > 0 && (
            <div style={s.criticalBadge}>🚨 {stats.critical} CRÍTICO{stats.critical > 1 ? "S" : ""}</div>
          )}
        </div>
      </div>

      {/* Stats compactas */}
      <div style={s.statsRow}>
        {[
          { icon: "📋", label: "Total", value: stats.total, color: "#3b82f6" },
          { icon: "🔴", label: "Críticas", value: stats.critical, color: "#ef4444" },
          { icon: "🟠", label: "Alto riesgo", value: stats.high, color: "#f97316" },
          { icon: "⚠️", label: "Zonas alerta", value: stats.alertZones, color: "#f59e0b" },
        ].map((st) => (
          <div key={st.label} style={{ ...s.statCard, borderTop: `2px solid ${st.color}` }}>
            <span style={{ fontSize: 16 }}>{st.icon}</span>
            <span style={{ ...s.statValue, color: st.color }}>{st.value}</span>
            <span style={s.statLabel}>{st.label}</span>
          </div>
        ))}
      </div>

      {/* Alertas de zonas — compactas */}
      {alertZones.length > 0 && (
        <div style={s.alertStrip}>
          {alertZones.map((zs) => {
            const alert = ALERT_COLORS[zs.alertLevel];
            return (
              <div
                key={zs.zone.name}
                style={{ ...s.alertChip, background: alert.bg, borderColor: alert.border, cursor: "pointer" }}
                onClick={() => handleZoneClick(zs)}
              >
                <span style={{ color: alert.text, fontWeight: 700, fontSize: 12 }}>
                  {zs.alertLevel === "critical" ? "🚨" : zs.alertLevel === "danger" ? "🔶" : "⚠️"} {zs.zone.name}
                </span>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{zs.incidents.length} reportes</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Layout principal */}
      <div style={s.mainLayout}>
        {/* Panel izquierdo: zonas */}
        <div style={s.zonesPanel}>
          <div style={s.sectionTitle}>🗺️ Estado por Zona</div>
          <div style={s.zonesList}>
            {ZONES.map((zone) => {
              const zs = zoneStats.find((z) => z.zone.name === zone.name)!;
              const alert = ALERT_COLORS[zs.alertLevel];
              const isActive = activeZone?.zone.name === zone.name;
              return (
                <div
                  key={zone.name}
                  style={{
                    ...s.zoneRow,
                    borderLeft: `3px solid ${isActive ? alert.border : (zs.incidents.length > 0 ? alert.border : "#334155")}`,
                    background: isActive ? alert.bg + "99" : zs.incidents.length > 0 ? alert.bg + "44" : "transparent",
                    cursor: zs.incidents.length > 0 ? "pointer" : "default",
                    outline: isActive ? `1px solid ${alert.border}` : "none",
                  }}
                  onClick={() => handleZoneClick(zs)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#e2e8f0", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {zone.name}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      {zs.incidents.length} rep.
                      {zs.criticalCount > 0 && <span style={{ color: "#fca5a5", marginLeft: 4 }}>· {zs.criticalCount}🔴</span>}
                    </span>
                  </div>
                  <span style={{
                    padding: "1px 6px", borderRadius: 8,
                    background: alert.border, color: "white",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>
                    {alert.label.replace("⚠️ ", "").replace("🔶 ", "").replace("🚨 ", "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Centro: mapa + detalle abajo */}
        <div style={s.centerCol}>
          <div style={s.mapWrapper}>
            <div style={s.sectionTitle}>📍 Mapa de Incidencias</div>
            {loading ? (
              <div style={s.mapLoading}>Cargando mapa...</div>
            ) : (
              <MapContainer center={LA_PAZ_CENTER} zoom={13} style={{ height: "100%", width: "100%", borderRadius: 8 }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
                />
                <MapController flyTarget={flyTarget} />
                {zoneStats.map((zs) => (
                  <ZoneOverlay key={zs.zone.name} zoneStat={zs} />
                ))}
                {incidents.map((incident) => (
                  <CircleMarker
                    key={incident.id}
                    center={[incident.latitude, incident.longitude]}
                    radius={incident.is_critical ? 9 : 5}
                    pathOptions={{
                      fillColor: LEVEL_COLOR[incident.pollution_level],
                      color: incident.is_critical ? "#fff" : LEVEL_COLOR[incident.pollution_level],
                      weight: incident.is_critical ? 2 : 1,
                      fillOpacity: 0.95,
                    }}
                    eventHandlers={{ click: () => { setSelectedIncident(incident); setActiveZone(null); } }}
                  >
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <p><strong>{incident.waste_type}</strong></p>
                        <p>Nivel: <strong>{incident.pollution_level}</strong></p>
                        <p>Objetos: {incident.detected_objects}</p>
                        <p style={{ fontSize: 11, color: "#666" }}>{formatDate(incident.created_at)}</p>
                        {incident.image_url && (
                          <a href={incident.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Ver imagen →</a>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}
            {/* Leyenda */}
            <div style={s.legend}>
              <span style={{ color: "#64748b", fontSize: 10, marginRight: 4 }}>Nivel:</span>
              {Object.entries(LEVEL_COLOR).map(([level, color]) => (
                <div key={level} style={s.legendItem}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 10 }}>{level}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle zona — DEBAJO del mapa */}
          {activeZone && (
            <div style={{ ...s.detailPanel, borderColor: ALERT_COLORS[activeZone.alertLevel].border }}>
              <div style={s.detailPanelHeader}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>
                  📍 {activeZone.zone.name} — {activeZone.incidents.length} incidencia{activeZone.incidents.length !== 1 ? "s" : ""}
                </span>
                <button onClick={() => setActiveZone(null)} style={s.closeBtn}>✕</button>
              </div>
              <div style={s.detailGrid}>
                {activeZone.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    style={{ ...s.incCard, borderLeft: `3px solid ${LEVEL_COLOR[inc.pollution_level]}`, cursor: "pointer" }}
                    onClick={() => { setSelectedIncident(inc); setActiveZone(null); }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>#{inc.id}</span>
                      <span style={{
                        padding: "1px 6px", borderRadius: 8,
                        background: LEVEL_COLOR[inc.pollution_level],
                        color: "white", fontSize: 10, fontWeight: 700,
                      }}>{inc.pollution_level}</span>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{inc.waste_type}</p>
                    <p style={{ fontSize: 11, color: "#64748b" }}>{formatDate(inc.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle incidencia individual — DEBAJO del mapa */}
          {selectedIncident && (
            <div style={{ ...s.detailPanel, borderColor: LEVEL_COLOR[selectedIncident.pollution_level] }}>
              <div style={s.detailPanelHeader}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>
                  🔍 Incidencia #{selectedIncident.id}
                </span>
                <button onClick={() => setSelectedIncident(null)} style={s.closeBtn}>✕</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "0 4px 4px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
                  {[
                    { label: "Tipo", value: selectedIncident.waste_type },
                    { label: "Nivel", value: selectedIncident.pollution_level, color: LEVEL_COLOR[selectedIncident.pollution_level] },
                    { label: "Objetos", value: `${selectedIncident.detected_objects}` },
                    { label: "Coords", value: `${selectedIncident.latitude.toFixed(3)}, ${selectedIncident.longitude.toFixed(3)}` },
                    { label: "Fecha", value: formatDate(selectedIncident.created_at) },
                  ].map((item) => (
                    <div key={item.label} style={s.infoChip}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{item.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: item.color || "#e2e8f0" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {selectedIncident.keywords?.map((kw) => (
                    <span key={kw} style={s.tag}>{kw}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: tabla */}
        <div style={s.tablePanel}>
          <div style={s.sectionTitle}>📋 Últimas incidencias</div>
          {loading ? (
            <p style={{ color: "#64748b", fontSize: 13, padding: 8 }}>Cargando...</p>
          ) : incidents.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: 13, padding: 8 }}>Sin incidencias.</p>
          ) : (
            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["#", "Tipo", "Nivel", "Obj", "Fecha"].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr
                      key={inc.id}
                      style={{ ...s.tr, background: inc.is_critical ? "rgba(239,68,68,0.1)" : "transparent", cursor: "pointer" }}
                      onClick={() => { setSelectedIncident(inc); setActiveZone(null); setFlyTarget({ lat: inc.latitude, lng: inc.longitude }); }}
                    >
                      <td style={s.td}>{inc.id}</td>
                      <td style={{ ...s.td, fontSize: 11 }}>{inc.waste_type}</td>
                      <td style={s.td}>
                        <span style={{ padding: "1px 6px", borderRadius: 10, background: LEVEL_COLOR[inc.pollution_level], color: "white", fontSize: 10, fontWeight: 700 }}>
                          {inc.pollution_level}
                        </span>
                      </td>
                      <td style={s.td}>{inc.detected_objects}</td>
                      <td style={{ ...s.td, fontSize: 10 }}>{formatDate(inc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0f172a", padding: "12px", gap: 10, fontFamily: "Segoe UI, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b", padding: "10px 16px", borderRadius: 10, flexWrap: "wrap", gap: 8 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerTitle: { fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  headerSub: { fontSize: 11, color: "#94a3b8", margin: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  updateBadge: { background: "#1e3a5f", color: "#60a5fa", padding: "4px 10px", borderRadius: 6, fontSize: 11 },
  criticalBadge: { background: "#7f1d1d", color: "#fca5a5", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  statCard: { background: "#1e293b", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 },
  statValue: { fontWeight: 800, fontSize: 18 },
  statLabel: { fontSize: 11, color: "#64748b" },

  alertStrip: { display: "flex", flexWrap: "wrap", gap: 6 },
  alertChip: { display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 8, border: "1px solid", transition: "opacity 0.2s" },

  mainLayout: {
    display: "grid",
    gridTemplateColumns: "200px 1fr 260px",
    gap: 12,
    flex: 1,
    minHeight: 0,
    alignItems: "start",
  },

  zonesPanel: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 0 },
  zonesList: { overflowY: "auto", maxHeight: "calc(100vh - 220px)", display: "flex", flexDirection: "column", gap: 3 },
  zoneRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, transition: "background 0.15s" },

  centerCol: { display: "flex", flexDirection: "column", gap: 10, minHeight: 0 },
  mapWrapper: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, height: 480 },
  mapLoading: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" },
  legend: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },

  detailPanel: { background: "#1e293b", borderRadius: 10, padding: 12, border: "1px solid" },
  detailPanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 },
  incCard: { background: "#0f172a", borderRadius: 6, padding: "8px 10px" },
  infoChip: { background: "#0f172a", borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2, minWidth: 80 },

  tablePanel: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 0 },
  tableWrapper: { overflowY: "auto", maxHeight: "calc(100vh - 220px)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "5px 6px", textAlign: "left", color: "#475569", borderBottom: "1px solid #334155", fontSize: 10, textTransform: "uppercase", position: "sticky", top: 0, background: "#1e293b" },
  tr: { borderBottom: "1px solid #1e293b", transition: "background 0.15s" },
  td: { padding: "6px", color: "#cbd5e1" },

  tag: { display: "inline-block", padding: "2px 7px", background: "#1e3a5f", color: "#60a5fa", borderRadius: 10, fontSize: 11 },
  closeBtn: { background: "transparent", border: "1px solid #475569", color: "#94a3b8", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 },
  sectionTitle: { fontWeight: 700, fontSize: 11, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" },
};