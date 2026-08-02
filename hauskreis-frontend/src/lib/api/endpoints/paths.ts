/** Pfadbau an einer Stelle, damit die Hauskreis-Schachtelung nirgends verrutscht. */
export const hkPath = (hauskreisId: string, suffix = '') =>
  `/hauskreise/${hauskreisId}${suffix}`;
