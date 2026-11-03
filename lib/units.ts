export const stockUnits = [
  "Pieces", "Pairs", "Dozens", "Packs", "Packets", "Boxes", "Cartons",
  "Bags", "Sacks", "Bottles", "Cans", "Tins", "Jars", "Crates",
  "Bunches", "Rolls", "Kilograms (kg)", "Grams (g)", "Litres (L)",
  "Millilitres (mL)", "Metres (m)",
] as const;

export const isStockUnit = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 60;
