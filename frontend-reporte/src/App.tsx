import React, { useState, useRef, useCallback } from "react";

const BACKEND_URL = "https://backendCloud.vercel.app";

type PollutionLevel = "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO";

interface ReportResult {
  success: boolean;
  incidentId: number;
  wasteType: string;
  pollutionLevel: PollutionLevel;
  objectCount: number;
  detectedKeywords: string[];
  isCritical: boolean;
  imageUrl: string;
  coordinates: { lat: number; lng: number };
}

const LEVEL_COLORS: Record<PollutionLevel, string> = {
  BAJO: "#22c55e",
  MEDIO: "#f59e0b",
  ALTO: "#f97316",
  CRÍTICO: "#ef4444",
};

const LEVEL_EMOJI: Record<PollutionLevel, string> = {
  BAJO: "🟢",
  MEDIO: "🟡",
  ALTO: "🟠",
  CRÍTICO: "🔴",
};

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingRealLocation, setUsingRealLocation] = useState<boolean | null>(null); // ← esta línea
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

const handleSubmit = async () => {
  if (!selectedFile) {
    setError("Por favor selecciona una imagen.");
    return;
  }

   console.log("¿geolocation existe?", "geolocation" in navigator);
  navigator.geolocation.getCurrentPosition(
    (pos) => console.log("GEO OK:", pos.coords.latitude, pos.coords.longitude),
    (err) => console.error("GEO ERROR código:", err.code, err.message),
  );
  // ── FIN DIAGNÓSTICO ──
  setLoading(true);
  setError(null);
  setResult(null);

  try {
    const formData = new FormData();
    formData.append("image", selectedFile);

    // Intentar obtener ubicación real con feedback claro
    await new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        console.warn("[GEO] Geolocalización no disponible en este navegador.");
        resolve();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          formData.append("lat", pos.coords.latitude.toString());
          formData.append("lng", pos.coords.longitude.toString());
          setUsingRealLocation(true);   // ← añadir
          resolve();
        },
        (err) => {
          console.error(`[GEO] Código de error: ${err.code} — ${err.message}`);
          // err.code: 1=PERMISSION_DENIED, 2=POSITION_ UNAVAILABLE, 3=TIMEOUT
          setUsingRealLocation(false);
          resolve();
        },
        {
          timeout: 8000,        // Más tiempo para que el usuario acepte el permiso
          maximumAge: 60000,    // Aceptar ubicación cacheada de hasta 1 minuto
          enableHighAccuracy: false, // false = más rápido, suficiente para el mapa
        }
      );
    });

    const response = await fetch(`${BACKEND_URL}/api/report`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Error del servidor");
    }

    setResult(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Error desconocido");
  } finally {
    setLoading(false);
  }
};

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>🗑️</div>
        <div>
          <h1 style={styles.headerTitle}>Sistema de Detección de Basura Urbana</h1>
          <p style={styles.headerSubtitle}>Monitoreo Ambiental — Municipio de La Paz</p>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>📷 Reportar Incidencia</h2>
        <p style={styles.cardDesc}>
          Fotografía el punto de acumulación de basura y haz clic en "Reportar". El
          sistema analizará la imagen automáticamente.
        </p>

        {/* Upload area */}
        <div
          style={{
            ...styles.uploadArea,
            borderColor: selectedFile ? "#3b82f6" : "#cbd5e1",
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Vista previa" style={styles.preview} />
          ) : (
            <div style={styles.uploadPlaceholder}>
              <span style={{ fontSize: 48 }}>📂</span>
              <p style={{ marginTop: 8, color: "#64748b" }}>
                Haz clic para seleccionar una imagen
              </p>
              <p style={{ fontSize: 12, color: "#94a3b8" }}>JPG, PNG, WEBP</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {selectedFile && (
          <p style={styles.fileName}>
            📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        )}

        {/* Botones */}
        <div style={styles.buttonRow}>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || loading}
            style={{
              ...styles.btnPrimary,
              opacity: !selectedFile || loading ? 0.6 : 1,
              cursor: !selectedFile || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "⏳ Analizando..." : "🚀 Reportar incidencia"}
          </button>
          {(selectedFile || result) && (
            <button onClick={handleReset} style={styles.btnSecondary}>
              🔄 Nuevo reporte
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <div>
              <p style={{ fontWeight: 600 }}>Procesando imagen...</p>
              <p style={{ fontSize: 13, color: "#64748b" }}>
                Subiendo a GCS → Cloud Vision → Clasificando → Guardando en Supabase
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <span style={{ fontSize: 20 }}>❌</span>
            <div>
              <p style={{ fontWeight: 600 }}>Error</p>
              <p style={{ fontSize: 14 }}>{error}</p>
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div
            style={{
              ...styles.resultBox,
              borderColor: LEVEL_COLORS[result.pollutionLevel],
              background: result.isCritical ? "#fff1f2" : "#f0fdf4",
            }}
          >
            {result.isCritical && (
              <div style={styles.alertBanner}>
                🚨 ALERTA CRÍTICA — Unidad municipal notificada (simulado)
              </div>
            )}

            <h3 style={{ marginBottom: 12, color: "#1e293b" }}>
              ✅ Incidencia #{result.incidentId} registrada
            </h3>

            <div style={styles.resultGrid}>
              <ResultItem
                label="Tipo de residuo"
                value={result.wasteType}
                icon="♻️"
              />
              <ResultItem
                label="Nivel de contaminación"
                value={`${LEVEL_EMOJI[result.pollutionLevel]} ${result.pollutionLevel}`}
                color={LEVEL_COLORS[result.pollutionLevel]}
                icon="📊"
              />
              <ResultItem
                label="Objetos detectados"
                value={`${result.objectCount} objetos`}
                icon="🔍"
              />
              <ResultItem
                label={usingRealLocation ? "Tu ubicación real 📡" : "Ubicación demo (sin GPS)"}
                value={`${result.coordinates.lat.toFixed(4)}, ${result.coordinates.lng.toFixed(4)}`}
                icon="📍"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                🏷️ Palabras clave detectadas:
              </p>
              <div style={styles.tagContainer}>
                {result.detectedKeywords.map((kw) => (
                  <span key={kw} style={styles.tag}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <p style={{ marginTop: 12, fontSize: 13, color: "#3b82f6" }}>
              👉{" "}
              <a href="http://localhost:3002" target="_blank" rel="noreferrer">
                Ver en el Dashboard →
              </a>
            </p>
          </div>
        )}
      </div>

      <p style={styles.footer}>
        Municipio de La Paz • Sistema de Monitoreo Ambiental MVP •{" "}
        <a href="http://localhost:3002" target="_blank" rel="noreferrer">
          Ver Dashboard
        </a>
      </p>
    </div>
  );
}

function ResultItem({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color?: string;
}) {
  return (
    <div style={styles.resultItem}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 12, color: "#64748b" }}>{label}</p>
        <p style={{ fontWeight: 700, color: color || "#1e293b" }}>{value}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f0f4f8 0%, #dbeafe 100%)",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    padding: "16px 24px",
    background: "#1e3a5f",
    borderRadius: 12,
    color: "white",
    width: "100%",
    maxWidth: 640,
  },
  headerIcon: { fontSize: 40 },
  headerTitle: { fontSize: 20, fontWeight: 700 },
  headerSubtitle: { fontSize: 13, opacity: 0.8 },
  card: {
    background: "white",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 640,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  },
  cardTitle: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#1e293b" },
  cardDesc: { fontSize: 14, color: "#64748b", marginBottom: 20 },
  uploadArea: {
    border: "2px dashed",
    borderRadius: 12,
    padding: 24,
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.2s",
    minHeight: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadPlaceholder: { display: "flex", flexDirection: "column", alignItems: "center" },
  preview: { maxHeight: 280, maxWidth: "100%", borderRadius: 8, objectFit: "contain" },
  fileName: { fontSize: 13, color: "#64748b", marginTop: 8 },
  buttonRow: { display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" },
  btnPrimary: {
    padding: "12px 24px",
    background: "#1e3a5f",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    flex: 1,
  },
  btnSecondary: {
    padding: "12px 20px",
    background: "white",
    color: "#1e3a5f",
    border: "2px solid #1e3a5f",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  loadingBox: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 20,
    padding: 16,
    background: "#eff6ff",
    borderRadius: 10,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #bfdbfe",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 20,
    padding: 16,
    background: "#fff1f2",
    borderRadius: 10,
    border: "1px solid #fecdd3",
  },
  resultBox: {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    border: "2px solid",
  },
  alertBanner: {
    background: "#ef4444",
    color: "white",
    padding: "8px 14px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 14,
    textAlign: "center",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  resultItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.7)",
    borderRadius: 8,
  },
  tagContainer: { display: "flex", flexWrap: "wrap", gap: 6 },
  tag: {
    padding: "3px 10px",
    background: "#e0e7ff",
    color: "#3730a3",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
  },
  footer: {
    marginTop: 20,
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
};
