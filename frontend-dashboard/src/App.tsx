import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  { name: "El Prado",     lat: -16.495, lng: -68.133, radiusKm: 0.8 },
  { name: "Villa Fátima", lat: -16.480, lng: -68.110, radiusKm: 0.8 },
  { name: "Miraflores",   lat: -16.505, lng: -68.120, radiusKm: 0.8 },
  { name: "San Pedro",    lat: -16.502, lng: -68.138, radiusKm: 0.8 },
  { name: "Sopocachi",    lat: -16.510, lng: -68.130, radiusKm: 0.8 },
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

const LA_PAZ_CENTER: [number, number] = [-16.5, -68.12];

// Distancia en km entre dos coordenadas
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

// Nivel de alerta según cantidad y criticidad
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

// Componente para los círculos de zona en el mapa
function ZoneOverlay({ zoneStat }: { zoneStat: ZoneStat }) {
  const map = useMap();
  const { zone, incidents, alertLevel } = zoneStat;
  const alert = ALERT_COLORS[alertLevel];

  // Radio visual proporcional a la cantidad de incidencias
  const baseRadius = 30;
  const radius = Math.min(baseRadius + incidents.length * 8, 90);

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
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            📍 Zona: {zone.name}
          </p>
          <p style={{
            padding: "3px 10px",
            background: alert.bg,
            color: alert.text,
            borderRadius: 6,
            display: "inline-block",
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 8,
          }}>
            {alert.label}
          </p>
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
  const [activeAlert, setActiveAlert] = useState<ZoneStat | null>(null);

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

  // Calcular estadísticas por zona
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

  // Zonas en alerta (warning o superior)
  const alertZones = useMemo(
    () => zoneStats.filter((z) => z.alertLevel !== "normal" && z.incidents.length > 0),
    [zoneStats]
  );

  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.is_critical).length,
    byType: incidents.reduce<Record<string, number>>((acc, i) => {
      acc[i.waste_type] = (acc[i.waste_type] || 0) + 1;
      return acc;
    }, {}),
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 28 }}>🗺️</span>
          <div>
            <h1 style={styles.headerTitle}>Dashboard Ambiental — La Paz</h1>
            <p style={styles.headerSub}>Sistema de Detección y Clasificación de Basura Urbana</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.updateBadge}>🔄 {lastUpdate.toLocaleTimeString("es-BO")}</div>
          {stats.critical > 0 && (
            <div style={styles.criticalBadge}>🚨 {stats.critical} CRÍTICO{stats.critical > 1 ? "S" : ""}</div>
          )}
        </div>
      </div>

      {/* Banners de alerta por zona */}
      {alertZones.length > 0 && (
        <div style={styles.alertBannerContainer}>
          {alertZones.map((zs) => {
            const alert = ALERT_COLORS[zs.alertLevel];
            return (
              <div
                key={zs.zone.name}
                style={{
                  ...styles.alertBanner,
                  background: alert.bg,
                  borderColor: alert.border,
                  cursor: "pointer",
                }}
                onClick={() => setActiveAlert(activeAlert?.zone.name === zs.zone.name ? null : zs)}
              >
                <span style={{ fontSize: 20 }}>{zs.alertLevel === "critical" ? "🚨" : zs.alertLevel === "danger" ? "🔶" : "⚠️"}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: alert.text }}>
                    Zona {zs.zone.name}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: 13, marginLeft: 8 }}>
                    {zs.incidents.length} incidencia{zs.incidents.length > 1 ? "s" : ""} · {zs.criticalCount} crítica{zs.criticalCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <span style={{
                  padding: "2px 10px",
                  borderRadius: 20,
                  background: alert.border,
                  color: "white",
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {alert.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel expandible de detalle de zona */}
      {activeAlert && (
        <div style={{
          ...styles.zoneDetailPanel,
          borderColor: ALERT_COLORS[activeAlert.alertLevel].border,
        }}>
          <div style={styles.zoneDetailHeader}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>
              📍 Detalle — Zona {activeAlert.zone.name}
            </span>
            <button onClick={() => setActiveAlert(null)} style={styles.closeBtn}>✕</button>
          </div>
          <div style={styles.zoneDetailGrid}>
            {activeAlert.incidents.map((inc) => (
              <div
                key={inc.id}
                style={{
                  ...styles.zoneIncidentCard,
                  borderLeft: `3px solid ${LEVEL_COLOR[inc.pollution_level]}`,
                  cursor: "pointer",
                }}
                onClick={() => { setSelectedIncident(inc); setActiveAlert(null); }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>#{inc.id}</span>
                  <span style={{
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: LEVEL_COLOR[inc.pollution_level],
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {inc.pollution_level}
                  </span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginTop: 4 }}>{inc.waste_type}</p>
                <p style={{ fontSize: 11, color: "#64748b" }}>{formatDate(inc.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div style={styles.statsRow}>
        <StatCard icon="📋" label="Total incidencias" value={stats.total} color="#3b82f6" />
        <StatCard icon="🔴" label="Críticas" value={stats.critical} color="#ef4444" />
        <StatCard icon="🟠" label="Alto riesgo" value={incidents.filter((i) => i.pollution_level === "ALTO").length} color="#f97316" />
        <StatCard
          icon="⚠️"
          label="Zonas en alerta"
          value={alertZones.length}
          color="#f59e0b"
        />
      </div>

      {/* Main layout */}
      <div style={styles.mainLayout}>
        {/* Mapa */}
        <div style={styles.mapContainer}>
          <div style={styles.sectionTitle}>📍 Mapa de Incidencias</div>
          {loading ? (
            <div style={styles.mapLoading}>Cargando mapa...</div>
          ) : (
            <MapContainer center={LA_PAZ_CENTER} zoom={13} style={{ height: "100%", width: "100%", borderRadius: 10 }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
              />

              {/* Círculos de zona (clustering visual) */}
              {zoneStats.map((zs) => (
                <ZoneOverlay key={zs.zone.name} zoneStat={zs} />
              ))}

              {/* Marcadores individuales */}
              {incidents.map((incident) => (
                <CircleMarker
                  key={incident.id}
                  center={[incident.latitude, incident.longitude]}
                  radius={incident.is_critical ? 10 : 6}
                  pathOptions={{
                    fillColor: LEVEL_COLOR[incident.pollution_level],
                    color: incident.is_critical ? "#fff" : LEVEL_COLOR[incident.pollution_level],
                    weight: incident.is_critical ? 2 : 1,
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{ click: () => setSelectedIncident(incident) }}
                >
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <p><strong>{incident.waste_type}</strong></p>
                      <p>Nivel: <strong>{incident.pollution_level}</strong></p>
                      <p>Objetos: {incident.detected_objects}</p>
                      <p style={{ fontSize: 11, color: "#666" }}>{formatDate(incident.created_at)}</p>
                      {incident.image_url && (
                        <a href={incident.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          Ver imagen →
                        </a>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          )}

          {/* Leyenda */}
          <div style={styles.legend}>
            <span style={{ color: "#64748b", fontSize: 11, marginRight: 4 }}>Nivel:</span>
            {Object.entries(LEVEL_COLOR).map(([level, color]) => (
              <div key={level} style={styles.legendItem}>
                <div style={{ ...styles.legendDot, background: color }} />
                <span>{level}</span>
              </div>
            ))}
            <span style={{ color: "#64748b", fontSize: 11, marginLeft: 12, marginRight: 4 }}>Zona:</span>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: "#f59e0b", opacity: 0.4, width: 16, height: 16, borderRadius: "50%" }} />
              <span>Acumulación</span>
            </div>
          </div>
        </div>

        {/* Panel derecho */}
        <div style={styles.rightPanel}>
          {/* Resumen por zonas */}
          <div style={styles.zonesPanel}>
            <div style={styles.sectionTitle}>🗺️ Estado por Zona</div>
            {ZONES.map((zone) => {
              const zs = zoneStats.find((z) => z.zone.name === zone.name)!;
              const alert = ALERT_COLORS[zs.alertLevel];
              return (
                <div
                  key={zone.name}
                  style={{
                    ...styles.zoneRow,
                    borderLeft: `3px solid ${alert.border}`,
                    background: zs.incidents.length > 0 ? alert.bg + "55" : "transparent",
                    cursor: zs.incidents.length > 0 ? "pointer" : "default",
                  }}
                  onClick={() => zs.incidents.length > 0 && setActiveAlert(activeAlert?.zone.name === zone.name ? null : zs)}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0" }}>{zone.name}</span>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {zs.incidents.length} incidencia{zs.incidents.length !== 1 ? "s" : ""}
                      {zs.criticalCount > 0 && <span style={{ color: "#fca5a5", marginLeft: 6 }}>· {zs.criticalCount} crítica{zs.criticalCount !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: alert.border,
                      color: "white",
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {alert.label}
                    </span>
                    {zs.incidents.length > 0 && (
                      <span style={{ fontSize: 10, color: "#475569" }}>ver detalle →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detalle incidencia seleccionada */}
          {selectedIncident && (
            <div style={styles.detailCard}>
              <div style={styles.sectionTitle}>🔍 Incidencia #{selectedIncident.id}</div>
              <div style={{ background: LEVEL_BG[selectedIncident.pollution_level], padding: "8px 12px", borderRadius: 8, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#e2e8f0" }}>{selectedIncident.waste_type}</span>
                <span style={{ fontWeight: 700, color: LEVEL_COLOR[selectedIncident.pollution_level] }}>{selectedIncident.pollution_level}</span>
              </div>
              <p style={styles.detailRow}>🔍 Objetos: <strong>{selectedIncident.detected_objects}</strong></p>
              <p style={styles.detailRow}>📍 {selectedIncident.latitude.toFixed(4)}, {selectedIncident.longitude.toFixed(4)}</p>
              <p style={styles.detailRow}>🕐 {formatDate(selectedIncident.created_at)}</p>
              <div style={{ marginTop: 8 }}>
                {selectedIncident.keywords?.map((kw) => (
                  <span key={kw} style={styles.tag}>{kw}</span>
                ))}
              </div>
              <button onClick={() => setSelectedIncident(null)} style={styles.closeBtn}>Cerrar ✕</button>
            </div>
          )}

          {/* Tabla */}
          <div style={styles.tableContainer}>
            <div style={styles.sectionTitle}>📋 Últimas Incidencias ({incidents.length})</div>
            {loading ? (
              <p style={{ color: "#64748b", padding: 12 }}>Cargando...</p>
            ) : incidents.length === 0 ? (
              <p style={{ color: "#64748b", padding: 12 }}>Sin incidencias aún.</p>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>Tipo</th>
                      <th style={styles.th}>Nivel</th>
                      <th style={styles.th}>Obj.</th>
                      <th style={styles.th}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => (
                      <tr
                        key={incident.id}
                        style={{ ...styles.tr, background: incident.is_critical ? "rgba(239,68,68,0.1)" : "transparent", cursor: "pointer" }}
                        onClick={() => setSelectedIncident(incident)}
                      >
                        <td style={styles.td}>{incident.id}</td>
                        <td style={styles.td}><span style={{ fontSize: 11 }}>{incident.waste_type}</span></td>
                        <td style={styles.td}>
                          <span style={{ padding: "2px 8px", borderRadius: 12, background: LEVEL_COLOR[incident.pollution_level], color: "white", fontSize: 11, fontWeight: 700 }}>
                            {incident.pollution_level}
                          </span>
                        </td>
                        <td style={styles.td}>{incident.detected_objects}</td>
                        <td style={styles.td}><span style={{ fontSize: 11 }}>{formatDate(incident.created_at)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, small }: { icon: string; label: string; value: string | number; color: string; small?: boolean }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${color}` }}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={{ ...styles.statValue, color, fontSize: small ? 16 : 28 }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0f172a", padding: "16px", gap: 12 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b", padding: "14px 20px", borderRadius: 12, flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  headerSub: { fontSize: 13, color: "#94a3b8" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  updateBadge: { background: "#1e3a5f", color: "#60a5fa", padding: "6px 12px", borderRadius: 8, fontSize: 13 },
  criticalBadge: { background: "#7f1d1d", color: "#fca5a5", padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700 },
  alertBannerContainer: { display: "flex", flexDirection: "column", gap: 6 },
  alertBanner: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, border: "1px solid", transition: "opacity 0.2s" },
  zoneDetailPanel: { background: "#1e293b", borderRadius: 12, padding: 16, border: "1px solid" },
  zoneDetailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  zoneDetailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 },
  zoneIncidentCard: { background: "#0f172a", borderRadius: 8, padding: "10px 12px" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  statCard: { background: "#1e293b", borderRadius: 10, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 },
  statIcon: { fontSize: 20 },
  statValue: { fontWeight: 800, lineHeight: 1.1 },
  statLabel: { fontSize: 12, color: "#64748b" },
  mainLayout: { display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, flex: 1, minHeight: 520 },
  mapContainer: { background: "#1e293b", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 520 },
  mapLoading: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" },
  legend: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#94a3b8", alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: "50%" },
  rightPanel: { display: "flex", flexDirection: "column", gap: 12, overflow: "auto", maxHeight: "calc(100vh - 240px)" },
  zonesPanel: { background: "#1e293b", borderRadius: 12, padding: 16 },
  zoneRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, marginBottom: 6, transition: "background 0.2s" },
  detailCard: { background: "#1e293b", borderRadius: 12, padding: 16 },
  detailRow: { fontSize: 13, marginBottom: 6, color: "#cbd5e1" },
  tag: { display: "inline-block", padding: "2px 8px", background: "#1e3a5f", color: "#60a5fa", borderRadius: 12, fontSize: 11, marginRight: 4, marginBottom: 4 },
  closeBtn: { marginTop: 10, background: "transparent", border: "1px solid #475569", color: "#94a3b8", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 },
  tableContainer: { background: "#1e293b", borderRadius: 12, padding: 16, overflow: "hidden" },
  tableWrapper: { overflowY: "auto", maxHeight: 280 },
  sectionTitle: { fontWeight: 700, fontSize: 14, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "6px 8px", textAlign: "left", color: "#475569", borderBottom: "1px solid #334155", fontSize: 11, textTransform: "uppercase" },
  tr: { borderBottom: "1px solid #1e293b", transition: "background 0.15s" },
  td: { padding: "8px", color: "#cbd5e1" },
};
