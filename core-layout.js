// Provisional Core layout for a 7 m square room. Coordinates and heights must
// be calibrated at the venue; the arm position is a manually editable proxy.
// Channels: rear 1–4, front 5–8, right 9–12, left 13–16, arm 17, sub 18.
export function createCoreSpeakers() {
  const speakers = [];
  const groups = ["後壁", "前壁", "右壁", "左壁"];
  for (let wall = 0; wall < 4; wall++) {
    for (const z of [0.8, 2.8]) {
      for (const along of [-1.75, 1.75]) {
        const [x, y] = wall === 0 ? [along, -3.5]
          : wall === 1 ? [along, 3.5]
            : wall === 2 ? [3.5, along]
              : [-3.5, along];
        speakers.push({ group: groups[wall], x, y, z });
      }
    }
  }
  speakers.push(
    { group: "アーム（仮）", x: 0, y: 0, z: 1.85 },
    { group: "Sub", x: 0, y: -3.5, z: 0.2 },
  );
  return speakers.map((speaker, index) => ({
    id: index + 1,
    ...speaker,
    gainDb: 0,
    delayMs: 0,
    polarity: 1,
    eq: [],
    measured: false,
  }));
}

export default createCoreSpeakers;
