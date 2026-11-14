export type Pair = [number, number];

/**
 * Round-robin "circle method": the first team stays fixed and the rest rotate.
 * n teams (n even) → n − 1 rounds in which every team plays every other team once.
 */
export function roundRobinRounds(teamIds: number[]): Pair[][] {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) throw new Error('A division needs an even number of teams (at least 2).');
  const ring = [...teamIds];
  const rounds: Pair[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pair[] = [];
    for (let i = 0; i < n / 2; i++) round.push([ring[i], ring[n - 1 - i]]);
    rounds.push(round);
    // rotate everything except the first entry
    ring.splice(1, 0, ring.pop()!);
  }
  return rounds;
}

/** Pairings for the given 1-based regular-season week; the cycle repeats after n − 1 rounds. */
export function pairingsForRegularWeek(teamIds: number[], regularNo: number): Pair[] {
  const rounds = roundRobinRounds(teamIds);
  return rounds[(regularNo - 1) % rounds.length];
}

/** Returns an error message, or null when every team in the division is paired exactly once. */
export function validatePairs(divisionTeamIds: number[], pairs: Pair[]): string | null {
  const allowed = new Set(divisionTeamIds);
  const seen = new Set<number>();
  for (const [a, b] of pairs) {
    for (const id of [a, b]) {
      if (!allowed.has(id)) return 'A matchup includes a team that is not in this division.';
      if (seen.has(id)) return 'A team is paired more than once.';
      seen.add(id);
    }
    if (a === b) return 'A team cannot play itself.';
  }
  if (seen.size !== allowed.size) return 'Every team in the division must be paired exactly once.';
  return null;
}
