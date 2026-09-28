// The 36 IMD meteorological subdivisions (DESIGN §4).
// `col`/`row` place each one on a SCHEMATIC tile grid — this is not a map and
// makes no boundary claim (hard rule 9). The geographic view is used only once
// Survey-of-India-compliant boundaries are supplied (OPEN_QUESTIONS #5).

export interface Region {
  id: string;
  name: string;
  short: string;
  col: number;
  row: number;
}

export const REGIONS: Region[] = [
  { id: "IMD_SUB_JK_LADAKH", name: "Jammu & Kashmir and Ladakh", short: "J&K", col: 2, row: 0 },
  { id: "IMD_SUB_HIMACHAL", name: "Himachal Pradesh", short: "HP", col: 2, row: 1 },
  { id: "IMD_SUB_PUNJAB", name: "Punjab", short: "PB", col: 1, row: 1 },
  { id: "IMD_SUB_UTTARAKHAND", name: "Uttarakhand", short: "UK", col: 3, row: 1 },
  { id: "IMD_SUB_ARUNACHAL", name: "Arunachal Pradesh", short: "ArP", col: 8, row: 1 },
  { id: "IMD_SUB_HAR_CHD_DEL", name: "Haryana, Chandigarh & Delhi", short: "HCD", col: 1, row: 2 },
  { id: "IMD_SUB_W_RAJASTHAN", name: "West Rajasthan", short: "W Raj", col: 0, row: 2 },
  { id: "IMD_SUB_W_UP", name: "West Uttar Pradesh", short: "W UP", col: 2, row: 2 },
  { id: "IMD_SUB_E_UP", name: "East Uttar Pradesh", short: "E UP", col: 3, row: 2 },
  { id: "IMD_SUB_BIHAR", name: "Bihar", short: "BR", col: 4, row: 2 },
  { id: "IMD_SUB_SHWB_SIKKIM", name: "Sub-Himalayan West Bengal & Sikkim", short: "SHWB", col: 5, row: 2 },
  { id: "IMD_SUB_ASSAM_MEGHALAYA", name: "Assam & Meghalaya", short: "A&M", col: 7, row: 2 },
  { id: "IMD_SUB_NMMT", name: "Nagaland, Manipur, Mizoram & Tripura", short: "NMMT", col: 8, row: 2 },
  { id: "IMD_SUB_E_RAJASTHAN", name: "East Rajasthan", short: "E Raj", col: 1, row: 3 },
  { id: "IMD_SUB_W_MP", name: "West Madhya Pradesh", short: "W MP", col: 2, row: 3 },
  { id: "IMD_SUB_E_MP", name: "East Madhya Pradesh", short: "E MP", col: 3, row: 3 },
  { id: "IMD_SUB_JHARKHAND", name: "Jharkhand", short: "JH", col: 4, row: 3 },
  { id: "IMD_SUB_GANGETIC_WB", name: "Gangetic West Bengal", short: "GWB", col: 5, row: 3 },
  { id: "IMD_SUB_SAURASHTRA_KUTCH", name: "Saurashtra & Kutch", short: "S&K", col: 0, row: 4 },
  { id: "IMD_SUB_GUJARAT", name: "Gujarat Region", short: "Guj", col: 1, row: 4 },
  { id: "IMD_SUB_VIDARBHA", name: "Vidarbha", short: "Vid", col: 3, row: 4 },
  { id: "IMD_SUB_CHHATTISGARH", name: "Chhattisgarh", short: "CG", col: 4, row: 4 },
  { id: "IMD_SUB_ODISHA", name: "Odisha", short: "OD", col: 5, row: 4 },
  { id: "IMD_SUB_KONKAN_GOA", name: "Konkan & Goa", short: "K&G", col: 1, row: 5 },
  { id: "IMD_SUB_MADHYA_MAHARASHTRA", name: "Madhya Maharashtra", short: "M Mah", col: 2, row: 5 },
  { id: "IMD_SUB_MARATHWADA", name: "Marathwada", short: "Mwd", col: 3, row: 5 },
  { id: "IMD_SUB_TELANGANA", name: "Telangana", short: "TS", col: 4, row: 5 },
  { id: "IMD_SUB_COASTAL_AP", name: "Coastal Andhra Pradesh & Yanam", short: "C AP", col: 5, row: 5 },
  { id: "IMD_SUB_COASTAL_KARNATAKA", name: "Coastal Karnataka", short: "C Kar", col: 1, row: 6 },
  { id: "IMD_SUB_N_INT_KARNATAKA", name: "North Interior Karnataka", short: "NI Kar", col: 2, row: 6 },
  { id: "IMD_SUB_RAYALASEEMA", name: "Rayalaseema", short: "Ryl", col: 3, row: 6 },
  { id: "IMD_SUB_S_INT_KARNATAKA", name: "South Interior Karnataka", short: "SI Kar", col: 2, row: 7 },
  { id: "IMD_SUB_TN_PUDUCHERRY", name: "Tamil Nadu, Puducherry & Karaikal", short: "TN", col: 3, row: 7 },
  { id: "IMD_SUB_KERALA_MAHE", name: "Kerala & Mahe", short: "KL", col: 2, row: 8 },
  { id: "IMD_SUB_LAKSHADWEEP", name: "Lakshadweep", short: "LD", col: 0, row: 7 },
  { id: "IMD_SUB_ANDAMAN_NICOBAR", name: "Andaman & Nicobar Islands", short: "A&N", col: 7, row: 6 },
];

export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export function regionName(id: string): string {
  return REGION_BY_ID[id]?.name ?? id;
}

/** Official boundaries go here (OPEN_QUESTIONS #5); features need `properties.region_id`. */
export const BOUNDARY_URL = "/boundaries/imd_subdivisions.geojson";
