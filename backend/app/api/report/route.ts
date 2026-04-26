// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { classifyIncident, VisionResponse } from "@/lib/clasificador";
import { supabaseAdmin } from "@/lib/supabase";

// Coordenadas predefinidas de zonas conocidas de La Paz para la demo
const LA_PAZ_LOCATIONS = [
  { name: "El Prado", lat: -16.495, lng: -68.133 },
  { name: "Villa Fátima", lat: -16.48, lng: -68.11 },
  { name: "Miraflores", lat: -16.505, lng: -68.12 },
  { name: "San Pedro", lat: -16.502, lng: -68.138 },
  { name: "Sopocachi", lat: -16.51, lng: -68.13 },
];

export async function POST(request: NextRequest) {
  console.log("\n========================================");
  console.log("[BACKEND] Nueva solicitud de reporte recibida");
  console.log("========================================");

  try {
    // 1. Parsear el FormData
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const latParam = formData.get("lat") as string | null;
    const lngParam = formData.get("lng") as string | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "No se recibió imagen." },
        { status: 400 }
      );
    }

    console.log(`[BACKEND] Imagen recibida: ${imageFile.name} (${imageFile.size} bytes)`);

    // 2. Convertir a Buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Subir a Google Cloud Storage
    console.log("[GCS] Subiendo imagen al bucket...");
    const storage = new Storage();
    const bucketName = process.env.GCS_BUCKET_NAME || "la-paz-waste-images";
    const bucket = storage.bucket(bucketName);
    const fileName = `${Date.now()}_${imageFile.name.replace(/\s/g, "_")}`;
    const gcsFile = bucket.file(fileName);

    await gcsFile.save(buffer, {
      metadata: { contentType: imageFile.type || "image/jpeg" },
    });

    const imageUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log(`[GCS] ✓ Imagen subida: ${imageUrl}`);

    // 4. Llamar a Cloud Vision API
    console.log("[VISION] Enviando imagen a Cloud Vision API...");
    const visionClient = new ImageAnnotatorClient();
    const [visionResult] = await visionClient.annotateImage({
      image: { content: buffer.toString("base64") },
      features: [
        { type: "LABEL_DETECTION", maxResults: 20 },
        { type: "OBJECT_LOCALIZATION", maxResults: 20 },
      ],
    });

    console.log(
      `[VISION] ✓ Etiquetas detectadas: ${visionResult.labelAnnotations?.length || 0}`
    );
    console.log(
      `[VISION] ✓ Objetos localizados: ${visionResult.localizedObjectAnnotations?.length || 0}`
    );

    // 5. Clasificar incidencia
    const visionData: VisionResponse = {
      labelAnnotations: (visionResult.labelAnnotations || []).map((l) => ({
        description: l.description || "",
        score: l.score || 0,
      })),
      localizedObjectAnnotations: (
        visionResult.localizedObjectAnnotations || []
      ).map((o) => ({
        name: o.name || "",
        score: o.score || 0,
      })),
    };

    const classification = classifyIncident(visionData);
    console.log(`[CLASIFICADOR] Tipo de residuo: ${classification.wasteType}`);
    console.log(`[CLASIFICADOR] Nivel de contaminación: ${classification.pollutionLevel}`);
    console.log(`[CLASIFICADOR] Objetos detectados: ${classification.objectCount}`);
    console.log(`[CLASIFICADOR] Palabras clave: ${classification.detectedKeywords.join(", ")}`);

    // 6. Determinar coordenadas
    let lat = parseFloat(latParam || "");
    let lng = parseFloat(lngParam || "");

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      // Seleccionar ubicación aleatoria de La Paz para demo
      const randomLocation =
        LA_PAZ_LOCATIONS[Math.floor(Math.random() * LA_PAZ_LOCATIONS.length)];
      lat = randomLocation.lat;
      lng = randomLocation.lng;
      console.log(`[GEOLOCACIÓN] Usando coordenadas demo: ${randomLocation.name} (${lat}, ${lng})`);
    }

    // 7. Insertar en Supabase
    console.log("[SUPABASE] Guardando incidencia...");
    const { data, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        image_url: imageUrl,
        latitude: lat,
        longitude: lng,
        waste_type: classification.wasteType,
        pollution_level: classification.pollutionLevel,
        detected_objects: classification.objectCount,
        keywords: classification.detectedKeywords,
        is_critical: classification.isCritical,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[SUPABASE] Error:", error.message);
      throw new Error(`Supabase error: ${error.message}`);
    }

    console.log(`[SUPABASE] ✓ Incidencia guardada con ID: ${data.id}`);

    // 8. Simulación de alerta crítica
    if (classification.isCritical) {
      console.log("\n🚨 ========================================");
      console.log("[SIMULACIÓN] ¡ALERTA CRÍTICA DETECTADA!");
      console.log(
        `[SIMULACIÓN] Enviar alerta a unidad municipal: incidente CRÍTICO en La Paz`
      );
      console.log(
        `[SIMULACIÓN] ${classification.objectCount} objetos detectados - Tipo: ${classification.wasteType}`
      );
      console.log(`[SIMULACIÓN] Coordenadas: ${lat}, ${lng}`);
      console.log("[SIMULACIÓN] Email/SMS enviado a: unidad.ambiental@lapaz.bo");
      console.log("🚨 ========================================\n");
    }

    console.log("[BACKEND] ✓ Proceso completado exitosamente\n");

    return NextResponse.json({
      success: true,
      incidentId: data.id,
      wasteType: classification.wasteType,
      pollutionLevel: classification.pollutionLevel,
      objectCount: classification.objectCount,
      detectedKeywords: classification.detectedKeywords,
      isCritical: classification.isCritical,
      imageUrl,
      coordinates: { lat, lng },
    });
  } catch (error) {
    console.error("[BACKEND] ❌ Error:", error);
    return NextResponse.json(
      {
        error: "Error procesando la incidencia.",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// Configurar el límite de tamaño del body para imágenes
export const config = {
  api: { bodyParser: false },
};
