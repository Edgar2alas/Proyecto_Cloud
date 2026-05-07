import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from "react-leaflet";
import { supabase } from "./supabase";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const MACRO_GROUPS: Record<string, { label: string; color: string }> = {
  CENTRO:      { label: "Zona Centro",    color: "#3b82f6" },
  COTAHUMA:    { label: "Cotahuma",       color: "#8b5cf6" },
  MAX_PAREDES: { label: "Max Paredes",    color: "#06b6d4" },
  PERIFERICA:  { label: "Periférica",     color: "#f59e0b" },
  SAN_ANTONIO: { label: "San Antonio",   color: "#10b981" },
  SUR:         { label: "Zona Sur",       color: "#f97316" },
  MALLASA:     { label: "Mallasa",        color: "#ec4899" },
  HAMPATURI:   { label: "Hampaturi",      color: "#64748b" },
};

// Mapeo nombre geojson → key del grupo
const MACRO_KEY_MAP: Record<string, string> = {
  CENTRO: "CENTRO",
  COTAHUMA: "COTAHUMA",
  "MAX PAREDES": "MAX_PAREDES",
  PERIFERICA: "PERIFERICA",
  "SAN ANTONIO": "SAN_ANTONIO",
  SUR: "SUR",
  MALLASA: "MALLASA",
  HAMPATURI: "HAMPATURI",
};

const LEVEL_COLOR: Record<string, string> = {
  BAJO:    "#22c55e",
  MEDIO:   "#f59e0b",
  ALTO:    "#f97316",
  CRÍTICO: "#ef4444",
};

const LA_PAZ_CENTER: [number, number] = [-16.505, -68.128];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function pointInPolygon(lat: number, lng: number, coords: number[][][]): boolean {
  // Ray casting sobre el primer anillo del polígono
  const ring = coords[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getZoneName(
  lat: number,
  lng: number,
  geoFeatures: GeoJSONFeature[]
): { zona: string; macro: string } | null {
  for (const f of geoFeatures) {
    const geom = f.geometry;
    if (geom.type === "Polygon") {
      if (pointInPolygon(lat, lng, geom.coordinates as number[][][])) {
        return { zona: f.properties.zona, macro: f.properties.macrodistr };
      }
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as number[][][][]) {
        if (pointInPolygon(lat, lng, poly as number[][][])) {
          return { zona: f.properties.zona, macro: f.properties.macrodistr };
        }
      }
    }
  }
  return null;
}

// ─── Tipos GeoJSON ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: "Feature";
  properties: { zona: string; macrodistr: string; subalcaldi: string; codigozona: number };
  geometry: { type: string; coordinates: unknown };
}

interface GeoJSONData {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MapController({ flyTarget }: { flyTarget: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget) map.flyTo([flyTarget.lat, flyTarget.lng], 15, { duration: 1.2 });
  }, [flyTarget, map]);
  return null;
}

// ─── Vista CRUD de incidencias ────────────────────────────────────────────────

function CrudView({
  incidents,
  onClose,
  onDelete,
}: {
  incidents: Incident[];
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  const [filter, setFilter] = useState<string>("TODOS");
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);

  const filtered = incidents.filter((inc) => {
    const matchLevel = filter === "TODOS" || inc.pollution_level === filter;
    const matchSearch =
      search === "" ||
      inc.waste_type.toLowerCase().includes(search.toLowerCase()) ||
      inc.keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()));
    return matchLevel && matchSearch;
  });

  return (
    <div style={cs.overlay}>
      <div style={cs.modal}>
        {/* Header */}
        <div style={cs.modalHeader}>
          <div>
            <h2 style={{ color: "#f1f5f9", fontSize: 16, margin: 0 }}>🗂️ Gestión de Incidencias</h2>
            <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>{incidents.length} registros totales</p>
          </div>
          <button onClick={onClose} style={cs.closeBtn}>✕ Cerrar</button>
        </div>

        {/* Filtros */}
        <div style={cs.filtersRow}>
          <input
            style={cs.searchInput}
            placeholder="🔍 Buscar por tipo o keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={cs.filterBtns}>
            {["TODOS", "BAJO", "MEDIO", "ALTO", "CRÍTICO"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  ...cs.filterBtn,
                  background: filter === lvl
                    ? (lvl === "TODOS" ? "#3b82f6" : LEVEL_COLOR[lvl])
                    : "#334155",
                  color: filter === lvl ? "white" : "#94a3b8",
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div style={cs.tableContainer}>
          <table style={cs.table}>
            <thead>
              <tr>
                {["#ID", "Tipo", "Nivel", "Objetos", "Zona detectada", "Fecha", "Acciones"].map((h) => (
                  <th key={h} style={cs.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inc) => (
                <tr
                  key={inc.id}
                  style={{
                    ...cs.tr,
                    background: inc.is_critical ? "rgba(239,68,68,0.08)" : "transparent",
                  }}
                >
                  <td style={cs.td}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>#{inc.id}</span>
                    {inc.is_critical && <span style={cs.critTag}>🚨</span>}
                  </td>
                  <td style={cs.td}>
                    <span style={{ color: "#e2e8f0", fontSize: 12 }}>{inc.waste_type}</span>
                  </td>
                  <td style={cs.td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 10,
                      background: LEVEL_COLOR[inc.pollution_level],
                      color: "white", fontSize: 11, fontWeight: 700,
                    }}>{inc.pollution_level}</span>
                  </td>
                  <td style={{ ...cs.td, textAlign: "center" }}>
                    <span style={{ color: "#94a3b8" }}>{inc.detected_objects}</span>
                  </td>
                  <td style={cs.td}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>
                      {inc.latitude.toFixed(3)}, {inc.longitude.toFixed(3)}
                    </span>
                  </td>
                  <td style={cs.td}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{formatDate(inc.created_at)}</span>
                  </td>
                  <td style={cs.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setSelected(inc)}
                        style={cs.actionBtn}
                      >👁 Ver</button>
                      <button
                        onClick={() => setConfirmId(inc.id)}
                        style={{ ...cs.actionBtn, background: "#7f1d1d", color: "#fca5a5" }}
                      >🗑 Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...cs.td, textAlign: "center", color: "#475569", padding: 24 }}>
                    Sin resultados para este filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal detalle */}
        {selected && (
          <div style={cs.innerOverlay} onClick={() => setSelected(null)}>
            <div style={cs.detailCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ color: "#f1f5f9", fontSize: 14 }}>Incidencia #{selected.id}</h3>
                <button onClick={() => setSelected(null)} style={cs.closeBtn}>✕</button>
              </div>
              {selected.image_url && (
                <img
                  src={selected.image_url}
                  alt="Incidencia"
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Tipo de residuo", selected.waste_type],
                  ["Nivel", selected.pollution_level],
                  ["Objetos detectados", `${selected.detected_objects}`],
                  ["Coordenadas", `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`],
                  ["Fecha", formatDate(selected.created_at)],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>
                    <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>Keywords: </span>
                  <span style={{ color: "#60a5fa", fontSize: 12 }}>{selected.keywords?.join(", ")}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm delete */}
        {confirmId !== null && (
          <div style={cs.innerOverlay}>
            <div style={cs.confirmCard}>
              <p style={{ color: "#f1f5f9", marginBottom: 16 }}>
                ¿Eliminar incidencia <strong>#{confirmId}</strong>? Esta acción no se puede deshacer.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setConfirmId(null)} style={cs.closeBtn}>Cancelar</button>
                <button
                  onClick={() => { onDelete(confirmId); setConfirmId(null); }}
                  style={{ ...cs.filterBtn, background: "#ef4444", color: "white" }}
                >Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [geoData, setGeoData] = useState<GeoJSONData | null>(null);
  const [expandedMacro, setExpandedMacro] = useState<string | null>(null);
  const [showCrud, setShowCrud] = useState(false);
  const [hoveredZona, setHoveredZona] = useState<string | null>(null);

  // Cargar GeoJSON
  useEffect(() => {
    fetch("/Zonas_GAMLP_2019.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(console.error);
  }, []);

  const fetchIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) { setIncidents(data); setLastUpdate(new Date()); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 3000);
    const channel = supabase
      .channel("incidents-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, fetchIncidents)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [fetchIncidents]);

  const handleDelete = useCallback(async (id: number) => {
    await supabase.from("incidents").delete().eq("id", id);
    setIncidents((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Enriquecer incidencias con zona del GeoJSON
  const enrichedIncidents = useMemo(() => {
    if (!geoData) return incidents.map((i) => ({ ...i, zona: null, macroKey: null }));
    return incidents.map((inc) => {
      const match = getZoneName(inc.latitude, inc.longitude, geoData.features);
      return {
        ...inc,
        zona: match?.zona ?? null,
        macroKey: match ? (MACRO_KEY_MAP[match.macro] ?? null) : null,
      };
    });
  }, [incidents, geoData]);

  // Contar incidencias por macro
  const macroStats = useMemo(() => {
    const counts: Record<string, { total: number; critical: number }> = {};
    for (const inc of enrichedIncidents) {
      if (!inc.macroKey) continue;
      if (!counts[inc.macroKey]) counts[inc.macroKey] = { total: 0, critical: 0 };
      counts[inc.macroKey].total++;
      if (inc.is_critical) counts[inc.macroKey].critical++;
    }
    return counts;
  }, [enrichedIncidents]);

  // Contar incidencias por zona
  const zonaStats = useMemo(() => {
    const counts: Record<string, { total: number; critical: number; maxLevel: string }> = {};
    for (const inc of enrichedIncidents) {
      if (!inc.zona) continue;
      if (!counts[inc.zona]) counts[inc.zona] = { total: 0, critical: 0, maxLevel: "BAJO" };
      counts[inc.zona].total++;
      if (inc.is_critical) counts[inc.zona].critical++;
      const order = ["CRÍTICO", "ALTO", "MEDIO", "BAJO"];
      if (order.indexOf(inc.pollution_level) < order.indexOf(counts[inc.zona].maxLevel)) {
        counts[inc.zona].maxLevel = inc.pollution_level;
      }
    }
    return counts;
  }, [enrichedIncidents]);

  // Estilo GeoJSON por zona
  const geoStyle = useCallback(
    (feature?: { properties: { zona: string } }) => {
      if (!feature) return {};
      const zona = feature.properties.zona;
      const stat = zonaStats[zona];
      const isHovered = hoveredZona === zona;
      if (!stat || stat.total === 0) {
        return {
          fillColor: "#1e293b",
          fillOpacity: isHovered ? 0.5 : 0.25,
          color: "#334155",
          weight: isHovered ? 2 : 1,
        };
      }
      return {
        fillColor: LEVEL_COLOR[stat.maxLevel],
        fillOpacity: isHovered ? 0.6 : 0.35,
        color: LEVEL_COLOR[stat.maxLevel],
        weight: isHovered ? 2.5 : 1.5,
      };
    },
    [zonaStats, hoveredZona]
  );

  const onEachFeature = useCallback(
    (feature: GeoJSONFeature, layer: L.Layer) => {
      const zona = feature.properties.zona;
      const stat = zonaStats[zona];
      // @ts-ignore
      layer.on({
        mouseover: () => setHoveredZona(zona),
        mouseout: () => setHoveredZona(null),
      });
      layer.bindPopup(`
        <div style="font-family:sans-serif;min-width:160px">
          <strong style="font-size:13px">📍 ${zona}</strong><br/>
          <span style="color:#666;font-size:11px">${feature.properties.macrodistr}</span><br/><br/>
          ${stat ? `
            <span>Incidencias: <strong>${stat.total}</strong></span><br/>
            <span style="color:#ef4444">Críticas: <strong>${stat.critical}</strong></span><br/>
            <span>Nivel máx: <strong style="color:${LEVEL_COLOR[stat.maxLevel]}">${stat.maxLevel}</strong></span>
          ` : "<span style='color:#888'>Sin incidencias registradas</span>"}
        </div>
      `);
    },
    [zonaStats]
  );

  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.is_critical).length,
    high: incidents.filter((i) => i.pollution_level === "ALTO").length,
    zonasConIncidencias: Object.keys(zonaStats).length,
  };

  const last7 = incidents.slice(0, 7);

  return (
    <div style={s.root}>
      {showCrud && (
        <CrudView
          incidents={incidents}
          onClose={() => setShowCrud(false)}
          onDelete={handleDelete}
        />
      )}

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

      {/* Stats */}
      <div style={s.statsRow}>
        {[
          { icon: "📋", label: "Total", value: stats.total, color: "#3b82f6" },
          { icon: "🔴", label: "Críticas", value: stats.critical, color: "#ef4444" },
          { icon: "🟠", label: "Alto riesgo", value: stats.high, color: "#f97316" },
          { icon: "🗺️", label: "Zonas afectadas", value: stats.zonasConIncidencias, color: "#8b5cf6" },
        ].map((st) => (
          <div key={st.label} style={{ ...s.statCard, borderTop: `2px solid ${st.color}` }}>
            <span style={{ fontSize: 16 }}>{st.icon}</span>
            <span style={{ ...s.statValue, color: st.color }}>{st.value}</span>
            <span style={s.statLabel}>{st.label}</span>
          </div>
        ))}
      </div>

      {/* Layout principal */}
      <div style={s.mainLayout}>

        {/* Panel izquierdo: macrodistrito → zonas */}
        <div style={s.zonesPanel}>
          <div style={s.sectionTitle}>🗺️ Estado por Zona</div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {Object.entries(MACRO_GROUPS).map(([key, { label, color }]) => {
              const mStat = macroStats[key];
              const isOpen = expandedMacro === key;
              // Zonas de este macro que tienen incidencias
              const zonasConInc = enrichedIncidents
                .filter((i) => i.macroKey === key)
                .reduce<Record<string, { total: number; maxLevel: string }>>((acc, inc) => {
                  if (!inc.zona) return acc;
                  if (!acc[inc.zona]) acc[inc.zona] = { total: 0, maxLevel: "BAJO" };
                  acc[inc.zona].total++;
                  const order = ["CRÍTICO", "ALTO", "MEDIO", "BAJO"];
                  if (order.indexOf(inc.pollution_level) < order.indexOf(acc[inc.zona].maxLevel)) {
                    acc[inc.zona].maxLevel = inc.pollution_level;
                  }
                  return acc;
                }, {});

              return (
                <div key={key} style={{ marginBottom: 3 }}>
                  {/* Fila de macro */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                      background: isOpen ? "#1e3a5f33" : "transparent",
                      borderLeft: `3px solid ${mStat ? color : "#334155"}`,
                      transition: "background 0.15s",
                    }}
                    onClick={() => setExpandedMacro(isOpen ? null : key)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{label}</span>
                      {mStat && (
                        <div style={{ fontSize: 10, color: "#64748b" }}>
                          {mStat.total} rep.{mStat.critical > 0 && <span style={{ color: "#fca5a5" }}> · {mStat.critical}🔴</span>}
                        </div>
                      )}
                    </div>
                    <span style={{ color: "#475569", fontSize: 11 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Zonas expandidas */}
                  {isOpen && (
                    <div style={{ paddingLeft: 8, paddingTop: 2 }}>
                      {Object.keys(zonasConInc).length === 0 ? (
                        <p style={{ color: "#475569", fontSize: 11, padding: "4px 8px" }}>Sin incidencias</p>
                      ) : (
                        Object.entries(zonasConInc).map(([zona, zst]) => (
                          <div
                            key={zona}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "4px 8px", borderRadius: 5, cursor: "pointer",
                              borderLeft: `2px solid ${LEVEL_COLOR[zst.maxLevel]}`,
                              marginBottom: 2,
                              background: hoveredZona === zona ? "#1e293b" : "transparent",
                            }}
                            onMouseEnter={() => setHoveredZona(zona)}
                            onMouseLeave={() => setHoveredZona(null)}
                            onClick={() => {
                              const inc = enrichedIncidents.find((i) => i.zona === zona);
                              if (inc) setFlyTarget({ lat: inc.latitude, lng: inc.longitude });
                            }}
                          >
                            <span style={{ fontSize: 11, color: "#cbd5e1", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {zona}
                            </span>
                            <span style={{
                              padding: "1px 5px", borderRadius: 6,
                              background: LEVEL_COLOR[zst.maxLevel],
                              color: "white", fontSize: 9, fontWeight: 700, flexShrink: 0,
                            }}>{zst.total}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Centro: mapa + detalle */}
        <div style={s.centerCol}>
          <div style={s.mapWrapper}>
            <div style={s.sectionTitle}>📍 Mapa de Incidencias — Zonas GAMLP</div>
            {loading ? (
              <div style={s.mapLoading}>Cargando...</div>
            ) : (
              <MapContainer center={LA_PAZ_CENTER} zoom={13} style={{ height: "100%", width: "100%", borderRadius: 8 }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
                />
                <MapController flyTarget={flyTarget} />
                {geoData && (
                  // @ts-ignore
                  <GeoJSON
                    key={JSON.stringify(zonaStats) + hoveredZona}
                    data={geoData as unknown as object}
                    style={geoStyle as unknown as object}
                    onEachFeature={onEachFeature as unknown as (f: object, l: object) => void}
                  />
                )}
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
                    eventHandlers={{ click: () => setSelectedIncident(incident) }}
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
              <span style={{ color: "#64748b", fontSize: 10, marginLeft: 8 }}>· Zonas coloreadas por nivel máximo</span>
            </div>
          </div>

          {/* Detalle incidencia */}
          {selectedIncident && (
            <div style={{ ...s.detailPanel, borderColor: LEVEL_COLOR[selectedIncident.pollution_level] }}>
              <div style={s.detailPanelHeader}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>
                  🔍 Incidencia #{selectedIncident.id}
                </span>
                <button onClick={() => setSelectedIncident(null)} style={s.closeBtn}>✕</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: "100%" }}>
                  {selectedIncident.keywords?.map((kw) => (
                    <span key={kw} style={s.tag}>{kw}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: tabla + botón crud */}
        <div style={s.tablePanel}>
          <div style={s.sectionTitle}>📋 Últimas 7 incidencias</div>
          {loading ? (
            <p style={{ color: "#64748b", fontSize: 13, padding: 8 }}>Cargando...</p>
          ) : last7.length === 0 ? (
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
                  {last7.map((inc) => (
                    <tr
                      key={inc.id}
                      style={{ ...s.tr, background: inc.is_critical ? "rgba(239,68,68,0.1)" : "transparent", cursor: "pointer" }}
                      onClick={() => {
                        setSelectedIncident(inc);
                        setFlyTarget({ lat: inc.latitude, lng: inc.longitude });
                      }}
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

          {/* Botón admin CRUD */}
          <div style={{ marginTop: 12, borderTop: "1px solid #334155", paddingTop: 12 }}>
            <p style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>Panel de administración</p>
            <button
              onClick={() => setShowCrud(true)}
              style={{
                width: "100%", padding: "9px 0",
                background: "#1e3a5f", color: "#60a5fa",
                border: "1px solid #3b82f6", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              🗂️ Gestionar incidencias ({incidents.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
  mainLayout: { display: "grid", gridTemplateColumns: "200px 1fr 260px", gap: 12, flex: 1, minHeight: 0, alignItems: "start" },
  zonesPanel: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 200px)", overflow: "hidden" },
  centerCol: { display: "flex", flexDirection: "column", gap: 10, minHeight: 0 },
  mapWrapper: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, height: 480 },
  mapLoading: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" },
  legend: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },
  detailPanel: { background: "#1e293b", borderRadius: 10, padding: 12, border: "1px solid" },
  detailPanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  infoChip: { background: "#0f172a", borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2, minWidth: 80 },
  tablePanel: { background: "#1e293b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column" },
  tableWrapper: { overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "5px 6px", textAlign: "left", color: "#475569", borderBottom: "1px solid #334155", fontSize: 10, textTransform: "uppercase", position: "sticky", top: 0, background: "#1e293b" },
  tr: { borderBottom: "1px solid #1e293b", transition: "background 0.15s" },
  td: { padding: "6px", color: "#cbd5e1" },
  tag: { display: "inline-block", padding: "2px 7px", background: "#1e3a5f", color: "#60a5fa", borderRadius: 10, fontSize: 11 },
  closeBtn: { background: "transparent", border: "1px solid #475569", color: "#94a3b8", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 },
  sectionTitle: { fontWeight: 700, fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" },
};

// Estilos del CRUD (modal overlay)
const cs: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#1e293b", borderRadius: 14, width: "100%", maxWidth: 1000, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #334155" },
  filtersRow: { display: "flex", gap: 10, padding: "12px 20px", borderBottom: "1px solid #334155", flexWrap: "wrap", alignItems: "center" },
  searchInput: { flex: 1, minWidth: 200, padding: "7px 12px", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontSize: 13 },
  filterBtns: { display: "flex", gap: 6 },
  filterBtn: { padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  tableContainer: { overflowY: "auto", flex: 1 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "8px 12px", textAlign: "left", color: "#475569", borderBottom: "1px solid #334155", fontSize: 11, textTransform: "uppercase", position: "sticky", top: 0, background: "#1e293b" },
  tr: { borderBottom: "1px solid #0f172a33", transition: "background 0.1s" },
  td: { padding: "10px 12px", color: "#cbd5e1", verticalAlign: "middle" },
  actionBtn: { padding: "4px 10px", background: "#1e3a5f", color: "#60a5fa", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  critTag: { marginLeft: 6, fontSize: 12 },
  closeBtn: { background: "transparent", border: "1px solid #475569", color: "#94a3b8", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  innerOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 10 },
  detailCard: { background: "#0f172a", borderRadius: 12, padding: 20, width: "100%", maxWidth: 420 },
  confirmCard: { background: "#0f172a", borderRadius: 12, padding: 24, width: "100%", maxWidth: 360 },
};