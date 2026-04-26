// lib/clasificador.ts
// Lógica de clasificación de residuos basada en respuesta de Cloud Vision API

export interface VisionLabel {
  description: string;
  score: number;
}

export interface VisionObject {
  name: string;
  score: number;
  boundingPoly?: unknown;
}

export interface VisionResponse {
  labelAnnotations: VisionLabel[];
  localizedObjectAnnotations: VisionObject[];
}

export interface ClassificationResult {
  wasteType: string;
  pollutionLevel: "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO";
  objectCount: number;
  detectedKeywords: string[];
  isCritical: boolean;
}

// Mapeo de palabras clave (inglés, idioma nativo de Cloud Vision) → categoría
const keywordToCategory: Record<string, string> = {
  // Plásticos
  plastic: "PLÁSTICOS",
  bottle: "PLÁSTICOS",
  container: "PLÁSTICOS",
  bag: "PLÁSTICOS",
  packaging: "PLÁSTICOS",
  "plastic bag": "PLÁSTICOS",
  "plastic bottle": "PLÁSTICOS",
  // Metales
  can: "METALES",
  metal: "METALES",
  aluminum: "METALES",
  tin: "METALES",
  steel: "METALES",
  // Orgánicos
  food: "ORGÁNICOS",
  fruit: "ORGÁNICOS",
  vegetable: "ORGÁNICOS",
  "organic waste": "ORGÁNICOS",
  compost: "ORGÁNICOS",
  "food waste": "ORGÁNICOS",
  // Papel y cartón
  paper: "PAPEL",
  cardboard: "PAPEL",
  newspaper: "PAPEL",
  box: "PAPEL",
  carton: "PAPEL",
  // Residuos mezclados / default
  waste: "RESIDUOS MEZCLADOS",
  garbage: "RESIDUOS MEZCLADOS",
  litter: "RESIDUOS MEZCLADOS",
  debris: "RESIDUOS MEZCLADOS",
  trash: "RESIDUOS MEZCLADOS",
  rubbish: "RESIDUOS MEZCLADOS",
  junk: "RESIDUOS MEZCLADOS",
  dump: "RESIDUOS MEZCLADOS",
};

/**
 * Determina la categoría de residuo predominante a partir de las etiquetas de Vision.
 */
function getWasteType(labels: VisionLabel[]): string {
  const scores: Record<string, number> = {};

  for (const label of labels) {
    const lowerDesc = label.description.toLowerCase();
    for (const [keyword, category] of Object.entries(keywordToCategory)) {
      if (lowerDesc.includes(keyword)) {
        scores[category] = (scores[category] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "RESIDUOS MEZCLADOS";
}

/**
 * Determina el nivel de contaminación según la cantidad de objetos detectados.
 */
function getPollutionLevel(
  objectCount: number
): "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO" {
  if (objectCount <= 3) return "BAJO";
  if (objectCount <= 8) return "MEDIO";
  if (objectCount <= 15) return "ALTO";
  return "CRÍTICO";
}

/**
 * Función principal de clasificación.
 */
export function classifyIncident(
  visionData: VisionResponse
): ClassificationResult {
  const labels = visionData.labelAnnotations || [];
  const objects = visionData.localizedObjectAnnotations || [];

  const wasteType = getWasteType(labels);
  const pollutionLevel = getPollutionLevel(objects.length);
  const detectedKeywords = labels.slice(0, 7).map((l) => l.description);

  return {
    wasteType,
    pollutionLevel,
    objectCount: objects.length,
    detectedKeywords,
    isCritical: pollutionLevel === "CRÍTICO",
  };
}
