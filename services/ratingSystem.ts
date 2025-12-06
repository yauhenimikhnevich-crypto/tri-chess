import { Player } from '../types';

// K-Factor determines how volatile the rating is. 32 is standard for intermediate players.
const K_FACTOR = 32;

/**
 * Calculates the expected score based on ratings.
 * Standard Elo formula: E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
 */
const getExpectedScore = (myRating: number, opponentRating: number): number => {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
};

/**
 * Calculates the new rating for a player after a match.
 * In a 3-player FFA, we treat the match as individual contests against the other two players.
 * 
 * Winner: Wins against both opponents.
 * Loser: Loses against the winner. (Relationship between two losers is ignored/considered draw).
 */
export const calculateNewRatings = (
  players: { id: string; rating: number; color: Player }[],
  winnerColor: Player | null
): { [userId: string]: number } => {
  const newRatings: { [userId: string]: number } = {};

  if (!winnerColor) {
      players.forEach(p => newRatings[p.id] = p.rating);
      return newRatings;
  }

  const winner = players.find(p => p.color === winnerColor);
  const losers = players.filter(p => p.color !== winnerColor);

  if (!winner) return {}; 

  // 1. Calculate Winner's new rating
  let winnerRatingChange = 0;
  
  losers.forEach(loser => {
    const expected = getExpectedScore(winner.rating, loser.rating);
    // Elo update: K * (Actual - Expected). Actual is 1 because they won.
    winnerRatingChange += K_FACTOR * (1 - expected);
  });

  newRatings[winner.id] = Math.round(winner.rating + winnerRatingChange);

  // 2. Calculate Losers' new ratings
  losers.forEach(loser => {
    const expected = getExpectedScore(loser.rating, winner.rating);
    // Actual is 0 because they lost
    const change = K_FACTOR * (0 - expected);
    newRatings[loser.id] = Math.round(loser.rating + change);
  });

  return newRatings;
};

/**
 * Calculates ratings when a player RESIGNS (Leaves) mid-game.
 * The Leaver loses to ALL remaining players.
 * The Remaining players gain from the Leaver, but do not affect each other yet.
 */
export const calculateResignationRatings = (
    leaver: { id: string; rating: number; color: Player },
    opponents: { id: string; rating: number; color: Player }[]
): { [userId: string]: number } => {
    const newRatings: { [userId: string]: number } = {};
    
    let leaverChange = 0;

    opponents.forEach(opp => {
        // Leaver vs Opponent
        const expectedLeaver = getExpectedScore(leaver.rating, opp.rating);
        const expectedOpp = getExpectedScore(opp.rating, leaver.rating);

        // Leaver loses (0), Opponent wins (1)
        leaverChange += K_FACTOR * (0 - expectedLeaver);
        
        // Opponent gains
        const oppChange = K_FACTOR * (1 - expectedOpp);
        
        newRatings[opp.id] = Math.round(opp.rating + oppChange);
    });

    newRatings[leaver.id] = Math.round(leaver.rating + leaverChange);

    return newRatings;
};