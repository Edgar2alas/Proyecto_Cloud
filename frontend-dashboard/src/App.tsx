import React, { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
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

const LEVEL_COLOR: Record<string, string> = {
  BAJO: "#22c55e",
  MEDIO: "#f59e0b",
  ALTO: "#f97316",
  CRÍTICO: "#ef4444",
};

const LEVEL_BG: Record<string, string> = {
  BAJO: "#14532d",
  MEDIO: "#78350f",
  ALTO: "#7c2d12",
  CRÍTICO: "#7f1d1d",
};

const LA_PAZ_CENTER: [number, number] = [-16.5, -68.12];

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

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

    // Polling cada 3 segundos
    const interval = setInterval(fetchIncidents, 3000);

    // Supabase Realtime (opcional, como bonus)
    const channel = supabase
      .channel("incidents-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        () => fetchIncidents()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchIncidents]);

  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.is_critical).length,
    byType: incidents.reduce<Record<string, number>>((acc, i) => {
      acc[i.waste_type] = (acc[i.waste_type] || 0) + 1;
      return acc;
    }, {}),
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("es-BO", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 28 }}>🗺️</span>
          <div>
            <h1 style={styles.headerTitle}>Dashboard Ambiental — La Paz</h1>
            <p style={styles.headerSub}>
              Sistema de Detección y Clasificación de Basura Urbana
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.updateBadge}>
            🔄 Actualizado: {lastUpdate.toLocaleTimeString("es-BO")}
          </div>
          {stats.critical > 0 && (
            <div style={styles.criticalBadge}>
              🚨 {stats.critical} CRÍTICO{stats.critical > 1 ? "S" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div style={styles.statsRow}>
        <StatCard icon="📋" label="Total incidencias" value={stats.total} color="#3b82f6" />
        <StatCard icon="🔴" label="Críticas" value={stats.critical} color="#ef4444" />
        <StatCard
          icon="🟠"
          label="Alto riesgo"
          value={incidents.filter((i) => i.pollution_level === "ALTO").length}
          color="#f97316"
        />
        <StatCard
          icon="♻️"
          label="Tipo predominante"
          value={
            Object.entries(stats.byType).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
          }
          color="#22c55e"
          small
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
            <MapContainer
              center={LA_PAZ_CENTER}
              zoom={13}
              style={{ height: "100%", width: "100%", borderRadius: 10 }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
              />
              {incidents.map((incident) => (
                <CircleMarker
                  key={incident.id}
                  center={[incident.latitude, incident.longitude]}
                  radius={incident.is_critical ? 14 : 9}
                  pathOptions={{
                    fillColor: LEVEL_COLOR[incident.pollution_level],
                    color: incident.is_critical ? "#fff" : LEVEL_COLOR[incident.pollution_level],
                    weight: incident.is_critical ? 2 : 1,
                    fillOpacity: 0.85,
                  }}
                  eventHandlers={{ click: () => setSelectedIncident(incident) }}
                >
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <p>
                        <strong>
                          {incident.waste_type}
                        </strong>
                      </p>
                      <p>Nivel: <strong>{incident.pollution_level}</strong></p>
                      <p>Objetos: {incident.detected_objects}</p>
                      <p style={{ fontSize: 11, color: "#666" }}>
                        {formatDate(incident.created_at)}
                      </p>
                      {incident.image_url && (
                        <a
                          href={incident.image_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12 }}
                        >
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
            {Object.entries(LEVEL_COLOR).map(([level, color]) => (
              <div key={level} style={styles.legendItem}>
                <div style={{ ...styles.legendDot, background: color }} />
                <span>{level}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho */}
        <div style={styles.rightPanel}>
          {/* Detalle seleccionado */}
          {selectedIncident && (
            <div style={styles.detailCard}>
              <div style={styles.sectionTitle}>
                🔍 Detalle — Incidencia #{selectedIncident.id}
              </div>
              <div
                style={{
                  background: LEVEL_BG[selectedIncident.pollution_level],
                  padding: "8px 12px",
                  borderRadius: 8,
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{selectedIncident.waste_type}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: LEVEL_COLOR[selectedIncident.pollution_level],
                  }}
                >
                  {selectedIncident.pollution_level}
                </span>
              </div>
              <p style={styles.detailRow}>
                🔍 Objetos: <strong>{selectedIncident.detected_objects}</strong>
              </p>
              <p style={styles.detailRow}>
                📍 Coordenadas:{" "}
                <strong>
                  {selectedIncident.latitude.toFixed(4)},{" "}
                  {selectedIncident.longitude.toFixed(4)}
                </strong>
              </p>
              <p style={styles.detailRow}>
                🕐 Fecha:{" "}
                <strong>{formatDate(selectedIncident.created_at)}</strong>
              </p>
              <div style={{ marginTop: 8 }}>
                {selectedIncident.keywords?.map((kw) => (
                  <span key={kw} style={styles.tag}>
                    {kw}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                style={styles.closeBtn}
              >
                Cerrar ✕
              </button>
            </div>
          )}

          {/* Tabla de incidencias */}
          <div style={styles.tableContainer}>
            <div style={styles.sectionTitle}>
              📋 Últimas Incidencias ({incidents.length})
            </div>
            {loading ? (
              <p style={{ color: "#64748b", padding: 12 }}>Cargando...</p>
            ) : incidents.length === 0 ? (
              <p style={{ color: "#64748b", padding: 12 }}>
                Sin incidencias. Reporta una desde{" "}
                <a href="http://localhost:3001" style={{ color: "#60a5fa" }}>
                  localhost:3001
                </a>
              </p>
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
                        style={{
                          ...styles.tr,
                          background: incident.is_critical
                            ? "rgba(239,68,68,0.1)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedIncident(incident)}
                      >
                        <td style={styles.td}>{incident.id}</td>
                        <td style={styles.td}>
                          <span style={{ fontSize: 11 }}>{incident.waste_type}</span>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 12,
                              background: LEVEL_COLOR[incident.pollution_level],
                              color: "white",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {incident.pollution_level}
                          </span>
                        </td>
                        <td style={styles.td}>{incident.detected_objects}</td>
                        <td style={styles.td}>
                          <span style={{ fontSize: 11 }}>
                            {formatDate(incident.created_at)}
                          </span>
                        </td>
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

function StatCard({
  icon,
  label,
  value,
  color,
  small,
}: {
  icon: string;
  label: string;
  value: string | number;
  color: string;
  small?: boolean;
}) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${color}` }}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={{ ...styles.statValue, color, fontSize: small ? 16 : 28 }}>
        {value}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    background: "#0f172a",
    padding: "16px",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#1e293b",
    padding: "14px 20px",
    borderRadius: 12,
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  headerSub: { fontSize: 13, color: "#94a3b8" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  updateBadge: {
    background: "#1e3a5f",
    color: "#60a5fa",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 13,
  },
  criticalBadge: {
    background: "#7f1d1d",
    color: "#fca5a5",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    animation: "pulse 1.5s infinite",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
  },
  statCard: {
    background: "#1e293b",
    borderRadius: 10,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statIcon: { fontSize: 20 },
  statValue: { fontWeight: 800, lineHeight: 1.1 },
  statLabel: { fontSize: 12, color: "#64748b" },
  mainLayout: {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    gap: 16,
    flex: 1,
    minHeight: 520,
  },
  mapContainer: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 520,
  },
  mapLoading: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
  },
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 12,
    color: "#94a3b8",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: "50%" },
  rightPanel: { display: "flex", flexDirection: "column", gap: 14 },
  detailCard: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 16,
  },
  detailRow: { fontSize: 13, marginBottom: 6, color: "#cbd5e1" },
  tag: {
    display: "inline-block",
    padding: "2px 8px",
    background: "#1e3a5f",
    color: "#60a5fa",
    borderRadius: 12,
    fontSize: 11,
    marginRight: 4,
    marginBottom: 4,
  },
  closeBtn: {
    marginTop: 10,
    background: "transparent",
    border: "1px solid #475569",
    color: "#94a3b8",
    borderRadius: 6,
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: 12,
  },
  tableContainer: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 16,
    flex: 1,
    overflow: "hidden",
  },
  tableWrapper: { overflowY: "auto", maxHeight: 380 },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "6px 8px",
    textAlign: "left",
    color: "#475569",
    borderBottom: "1px solid #334155",
    fontSize: 11,
    textTransform: "uppercase",
  },
  tr: { borderBottom: "1px solid #1e293b", transition: "background 0.15s" },
  td: { padding: "8px", color: "#cbd5e1" },
};
