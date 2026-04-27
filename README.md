# 🗑️ Plataforma Inteligente de Detección de Basura Urbana — La Paz

MVP de sistema de monitoreo ambiental que usa **Google Cloud Vision API** (MLaaS) para clasificar
residuos urbanos a partir de fotografías, con dashboard de mapa en tiempo real.

---

## 📁 Estructura del Proyecto

```
waste-detection/
├── backend/                  ← Next.js 14 (API Routes + lógica de clasificación)
│   ├── app/
│   │   ├── api/
│   │   │   ├── report/route.ts    ← POST: recibir imagen y procesar
│   │   │   └── incidents/route.ts ← GET: listar incidencias
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── clasificador.ts        ← Lógica de clasificación por reglas
│   │   └── supabase.ts            ← Cliente Supabase (admin)
│   ├── .env.example
│   └── package.json
├── frontend-reporte/         ← React + Vite (puerto 3001)
│   ├── src/
│   │   ├── App.tsx               ← UI de reporte de incidencias
│   │   └── main.tsx
│   └── package.json
├── frontend-dashboard/       ← React + Vite + Leaflet (puerto 3002)
│   ├── src/
│   │   ├── App.tsx               ← Dashboard con mapa y tabla
│   │   ├── supabase.ts           ← Cliente Supabase (anon)
│   │   └── main.tsx
│   ├── .env.example
│   └── package.json
└── supabase_setup.sql        ← Script SQL para crear la tabla en Supabase
```

---

## ✅ Requisitos Previos

Antes de empezar necesitas tener instalado:

| Herramienta | Versión mínima | Verificar con |
|-------------|---------------|---------------|
| Node.js     | 18.x o superior | `node --version` |
| npm         | 9.x o superior  | `npm --version` |
| Git         | cualquier versión | `git --version` |

Y cuentas en:
- **Google Cloud Platform** (GCP) — cuenta gratuita sirve
- **Supabase** — cuenta gratuita en https://supabase.com

---

## 🔧 PASO 1 — Configurar Supabase

### 1.1 Crear proyecto en Supabase
1. Ve a https://supabase.com → **New Project**
2. Nombre: `waste-detection-lapaz`
3. Contraseña de base de datos: guárdala en algún lado "m_tLM595%zX#dDS"
4. Región: la más cercana (ej. South America)
5. Espera ~2 minutos a que se cree

### 1.2 Crear la tabla
1. En el dashboard de Supabase → **SQL Editor** → **New Query**
2. Copia y pega el contenido de `supabase_setup.sql`
3. Haz clic en **Run** (▶️)
4. Verifica en **Table Editor** que se creó la tabla `incidents`

### 1.3 Obtener las credenciales


## 🔧 PASO 2 — Configurar Google Cloud Platform

### 2.1 Crear proyecto en GCP
1. Ve a https://console.cloud.google.com
2. Crea un nuevo proyecto: `waste-detection-lapaz`
3. Asegúrate de tener activa una cuenta de facturación (la capa gratuita es suficiente)

### 2.2 Habilitar las APIs necesarias
En el proyecto de GCP, habilita estas APIs (busca cada una en el buscador):
- **Cloud Vision API**
- **Cloud Storage API**

### 2.3 Crear el bucket en Cloud Storage
1. Ve a **Cloud Storage** → **Buckets** → **Create**
2. Nombre: `la-paz-waste-images` (debe ser único globalmente; si falla agrega un número al final)
3. Region: `us-central1` (o cualquier región)
4. Storage class: **Standard**
5. Access control: **Uniform**
6. Haz clic en **Create**

### 2.4 Hacer el bucket público para lectura (para ver las imágenes en el dashboard)
1. Abre el bucket → pestaña **Permissions**
2. Haz clic en **Grant Access**
3. New principals: `allUsers`
4. Role: **Storage Object Viewer**
5. Guarda

> ⚠️ Esto hace las imágenes legibles públicamente vía URL. Es correcto para el MVP.

### 2.5 Crear Service Account (credenciales para el backend)
1. Ve a **IAM & Admin** → **Service Accounts** → **Create Service Account**
2. Nombre: `waste-detection-backend`
3. Roles a asignar:
   - **Cloud Vision API User** (o `roles/cloudvision.user`)
   - **Storage Object Admin** (o `roles/storage.objectAdmin`)
4. Haz clic en **Done**

### 2.6 Descargar el archivo de credenciales JSON
1. En la lista de Service Accounts, haz clic en la que creaste
2. Ve a la pestaña **Keys** → **Add Key** → **Create new key**
3. Formato: **JSON** → **Create**
4. Se descargará un archivo `.json` — **guárdalo bien, no lo pierdas**
5. **Renómbralo** a `gcp-credentials.json`

---

## 🔧 PASO 3 — Instalar dependencias

Abre **tres terminales** (o usa tabs). En cada una ejecuta:

### Terminal 1 — Backend
```bash
cd waste-detection/backend

# Copiar variables de entorno
cp .env.example .env.local

# Editar .env.local con tus credenciales (ver paso 4)
# Copiar el archivo de credenciales GCP aquí
cp /ruta/a/tu/gcp-credentials.json ./gcp-credentials.json

# Instalar dependencias
npm install
```

### Terminal 2 — Frontend Reporte
```bash
cd waste-detection/frontend-reporte
npm install
```

### Terminal 3 — Frontend Dashboard
```bash
cd waste-detection/frontend-dashboard

# Copiar variables de entorno
cp .env.example .env.local

# Editar .env.local con tus credenciales de Supabase
npm install
```

---

## 🔧 PASO 4 — Configurar Variables de Entorno

### Backend (`backend/.env.local`)
```env
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
GCS_BUCKET_NAME=la-paz-waste-images

NEXT_PUBLIC_SUPABASE_URL=https://TU-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...tu-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...tu-service-role-key...
```

### Dashboard (`frontend-dashboard/.env.local`)
```env
VITE_SUPABASE_URL=https://TU-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...tu-anon-key...
```

> 💡 El dashboard solo necesita la `anon key` (solo lectura). La `service_role key` NUNCA va en el frontend.

---

## 🚀 PASO 5 — Ejecutar el proyecto

Con las tres terminales del paso 3, ejecuta en cada una:

### Terminal 1 — Backend (puerto 3000)
```bash
cd waste-detection/backend
npm run dev
```
✅ Deberías ver: `ready - started server on 0.0.0.0:3000`

### Terminal 2 — Frontend Reporte (puerto 3001)
```bash
cd waste-detection/frontend-reporte
npm run dev
```
✅ Deberías ver: `Local: http://localhost:3001/`

### Terminal 3 — Frontend Dashboard (puerto 3002)
```bash
cd waste-detection/frontend-dashboard
npm run dev
```
✅ Deberías ver: `Local: http://localhost:3002/`

---

## 🎯 PASO 6 — Probar el sistema

1. Abre **http://localhost:3001** → Frontend de Reporte
2. Haz clic en el área de carga y selecciona una **foto real de basura**
   - Puedes buscar en Google Images: "urban garbage pile", "plastic waste street", etc.
   - Guárdala como JPG y úsala
3. Haz clic en **"Reportar incidencia"**
4. Espera ~3-5 segundos
5. Verás el resultado: tipo de residuo, nivel de contaminación, objetos detectados
6. Abre **http://localhost:3002** → Dashboard
7. El nuevo marcador aparecerá en el mapa de La Paz automáticamente

---

## 🔍 Verificación paso a paso

### ¿Cómo saber que todo funciona?

| Qué verificar | Dónde mirarlo |
|---------------|---------------|
| Backend activo | Terminal 1: sin errores rojos |
| GCS funcionando | Terminal 1: `[GCS] ✓ Imagen subida: https://storage...` |
| Cloud Vision funcionando | Terminal 1: `[VISION] ✓ Etiquetas detectadas: N` |
| Supabase funcionando | Terminal 1: `[SUPABASE] ✓ Incidencia guardada con ID: N` |
| Dashboard actualizado | http://localhost:3002 muestra el marcador en el mapa |
| Supabase directo | Supabase → Table Editor → tabla `incidents` → nueva fila |

### Para la demo de alerta crítica
Usa una imagen con **muchos objetos de basura** (ej. un vertedero). Cuando Cloud Vision detecte >15 objetos verás en la Terminal 1:
```
🚨 ========================================
[SIMULACIÓN] ¡ALERTA CRÍTICA DETECTADA!
[SIMULACIÓN] Enviar alerta a unidad municipal: incidente CRÍTICO en La Paz
🚨 ========================================
```

---

## ❗ Problemas Comunes

### Error: `GOOGLE_APPLICATION_CREDENTIALS` no encontrado
- Verifica que `gcp-credentials.json` esté en la carpeta `backend/`
- Verifica que en `.env.local` diga exactamente: `GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json`

### Error: `403 Forbidden` en Cloud Vision o GCS
- El Service Account no tiene los roles correctos
- Ve a GCP → IAM → verifica los roles del service account

### Error: `Invalid API key` en Supabase
- Copia las keys de nuevo desde Supabase → Settings → API
- Verifica que no haya espacios al pegar

### El dashboard no muestra datos
- Verifica que el backend esté corriendo en puerto 3000
- Verifica las variables en `frontend-dashboard/.env.local`
- Abre la consola del navegador (F12) para ver errores

### `CORS error` en el frontend de reporte
- El backend Next.js acepta requests de cualquier origen por defecto en desarrollo
- Si persiste, reinicia el servidor backend

---

## 📊 Flujo Técnico del Sistema

```
Usuario sube imagen (localhost:3001)
    ↓
POST /api/report (multipart/form-data)
    ↓
Backend Next.js (localhost:3000)
    ├── Sube imagen → Google Cloud Storage
    ├── Envía imagen → Cloud Vision API
    │       └── Recibe: etiquetas + objetos localizados
    ├── Clasificador.ts
    │       ├── getWasteType() → PLÁSTICOS / METALES / ORGÁNICOS / PAPEL / MIXTO
    │       └── getPollutionLevel() → BAJO / MEDIO / ALTO / CRÍTICO
    ├── Inserta en Supabase (tabla: incidents)
    └── Si CRÍTICO → console.log simulación de alerta
    ↓
Respuesta JSON al frontend (reporte)
    ↓
Dashboard (localhost:3002) polling cada 3s
    └── Muestra marcador en mapa Leaflet + fila en tabla
```

---

## 🏗️ Tecnologías Utilizadas

| Capa | Tecnología | Puerto |
|------|-----------|--------|
| Backend API | Next.js 14 (App Router) | 3000 |
| Frontend Reporte | React 18 + Vite | 3001 |
| Frontend Dashboard | React 18 + Vite + Leaflet | 3002 |
| ML (visión) | Google Cloud Vision API | — |
| Almacenamiento imágenes | Google Cloud Storage | — |
| Base de datos | Supabase (PostgreSQL) | — |
| Mapas | OpenStreetMap + Leaflet.js | — |

---

## 📝 Notas para la Defensa

- Todo corre en **localhost** — solo las llamadas a GCP y Supabase salen a internet
- La geolocalización es **simulada** con coordenadas reales de La Paz
- Las alertas son **simuladas** con `console.log` (suficiente para demostrar el concepto)
- El flujo completo tarda **menos de 5 segundos** en la demo
- La capa gratuita de Cloud Vision: **1000 unidades/mes** — más que suficiente
