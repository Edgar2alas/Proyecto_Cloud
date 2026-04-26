// app/page.tsx
export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>🗑️ Waste Detection API</h1>
      <p>Backend activo.</p>
      <ul>
        <li><code>POST /api/report</code> — Reportar incidencia</li>
        <li><code>GET /api/incidents</code> — Listar incidencias</li>
      </ul>
    </main>
  );
}
