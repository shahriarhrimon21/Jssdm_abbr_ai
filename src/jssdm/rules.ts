/** Ported 1:1 from /tmp/mil/shell_bottom.html — category -> applicable rule ids. */
export const CATEGORY_RULES: Record<string, string[]> = {
  General: ["r0241a1", "r0241a2", "r0241b1", "r0241b2", "r0241b3", "r0241b4", "r0241b5", "r0241b6", "r1604", "r1605"],
  Appointment: ["r1607", "r0241a1"],
  Rank: ["r1607", "r0241a1"],
  Country: ["r0241a1"],
  "Training Institution": ["r0241a1"],
  "Corps/Regiment": ["r0241a1"],
  "Base/Unit/Branch": ["r0241a1"],
  "Correspondence Address": ["r0241c", "r0222letters"],
  "Signal Punctuation": ["r1605"],
  "Unit of Measurement": ["r0241a1"],
};
