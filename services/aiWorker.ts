
import { BoardCell, Coordinates, Piece, Player, PieceType } from '../types';
import { PIECE_SCORES, BOARD_ROWS, BOARD_COLS, PROMOTION_ZONES } from '../constants';
import { getValidMoves, isCheckmate, isStalemate, simulateMove, isKingInCheck } from './gameLogic';

interface Move {
    from: Coordinates;
    to: Coordinates;
    promotion?: PieceType;
    score?: number; // Internal score for sorting
}

// Helper to create a simplified string representation of the board for history tracking
const boardToString = (board: (BoardCell | null)[][]): string => {
    return board.map(row => 
        row.map(cell => {
            if (!cell?.piece) return ' ';
            // Use a consistent format: Player initial + Piece initial
            return `${cell.piece.player[0]}${cell.piece.type[0]}`;
        }).join('')
    ).join('|');
};

// Calculate rough distance to the center (approx row 6, col 9-10)
const getDistanceFromCenter = (row: number, col: number): number => {
    const centerRow = 6;
    const centerCol = 9.5;
    return Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
};

// Calculate distance between two points
const getDistance = (p1: Coordinates, p2: Coordinates): number => {
    return Math.abs(p1.row - p2.row) + Math.abs(p1.col - p2.col);
};

// Heuristic to encourage pawns to move forward
const getPawnProgressScore = (piece: Piece, r: number, c: number): number => {
    const targets = PROMOTION_ZONES[piece.player];
    let minDist = Infinity;
    
    for (const target of targets) {
        const dist = Math.abs(target.row - r) + Math.abs(target.col - c);
        if (dist < minDist) minDist = dist;
    }
    
    // The closer to 0, the higher the score.
    // Max distance on board is roughly 20.
    return (20 - minDist) * 15; // Increased weight
};

const evaluateBoard = (board: (BoardCell | null)[][], aiPlayer: Player, activePlayers: Player[], moveHistory: string[]): number => {
    // 1. Repetition Check (Strict Anti-Loop)
    const currentBoardStr = boardToString(board);
    const repetitionCount = moveHistory.filter(h => h === currentBoardStr).length;
    // Massive penalty for repetition to force progress
    if (repetitionCount >= 1) {
        return -5000; 
    }

    let myMaterial = 0;
    let enemyMaterial = 0;
    let myMobility = 0;
    let myKingPos: Coordinates | null = null;
    let enemyKingPos: Coordinates | null = null;
    
    // Simplified enemy identification (just focuses on "not me")
    const enemies = activePlayers.filter(p => p !== aiPlayer);

    // 2. Scan Board
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = board[r][c];
            if (cell?.piece) {
                const piece = cell.piece;
                let score = PIECE_SCORES[piece.type] * 100;

                // Track Kings
                if (piece.type === PieceType.King) {
                    if (piece.player === aiPlayer) myKingPos = { row: r, col: c };
                    else if (enemies.includes(piece.player)) enemyKingPos = { row: r, col: c }; // Just pick one enemy king to target
                }

                if (piece.player === aiPlayer) {
                    // Position Bonuses
                    
                    // Center Control (Good for minor pieces/Queen, bad for King early)
                    const distCenter = getDistanceFromCenter(r, c);
                    
                    if (piece.type !== PieceType.King && piece.type !== PieceType.Pawn) {
                        score += (10 - distCenter) * 2; 
                    }

                    // Pawn Push
                    if (piece.type === PieceType.Pawn) {
                        score += getPawnProgressScore(piece, r, c);
                    }

                    myMaterial += score;
                } else {
                    enemyMaterial += score;
                }
            }
        }
    }

    // 3. Game Phase Detection
    const isEndgame = (myMaterial + enemyMaterial) < 4500; 

    // 4. King Safety vs Activity
    if (myKingPos) {
        const distCenter = getDistanceFromCenter(myKingPos.row, myKingPos.col);
        if (!isEndgame) {
            // MIDGAME: Stay away from center! HIDE!
            // Penalize low distance to center
            if (distCenter < 4) {
                myMaterial -= (5 - distCenter) * 50; 
            }
        } else {
            // ENDGAME: Go to center / Activate
            myMaterial += (10 - distCenter) * 10;
        }
    }

    // 5. Mobility (Expensive but worth it for "intelligence")
    // We sample a few pieces or calculate raw moves to see if we are suffocating
    // To save performance, we only add mobility bonus for sliding pieces (Queen, Rook, Bishop)
    // inside the Minimax loop is too heavy. We rely on the center-control heuristic above as a proxy for mobility.

    let totalScore = myMaterial - enemyMaterial;

    // 6. Endgame Aggression ("Mop-Up")
    if (isEndgame && myMaterial > enemyMaterial + 300 && enemyKingPos && myKingPos) {
        // Push Enemy King to Edges
        const enemyDistFromCenter = getDistanceFromCenter(enemyKingPos.row, enemyKingPos.col);
        totalScore += enemyDistFromCenter * 20;

        // Move Our King Closer (Assisted Mate)
        const distBetweenKings = getDistance(myKingPos, enemyKingPos);
        totalScore += (20 - distBetweenKings) * 15;
    }

    // 7. Terminal States
    if (isCheckmate(aiPlayer, board)) return -100000; 
    if (isStalemate(aiPlayer, board)) return -5000; 

    // Check opponents
    for(const player of enemies) {
        if (isCheckmate(player, board)) totalScore += 100000; // HUGE WIN
        if (isStalemate(player, board)) totalScore += 15000;  // Elimination is good
    }
    
    return totalScore;
};

const getAllPossibleMoves = (board: (BoardCell | null)[][], player: Player): Move[] => {
    const moves: Move[] = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = board[r][c];
            if (cell?.piece?.player === player) {
                const validMoves = getValidMoves(cell.piece, { row: r, col: c }, board);
                validMoves.forEach(to => {
                    moves.push({ from: { row: r, col: c }, to });
                });
            }
        }
    }
    return moves;
};

const minimax = (
    board: (BoardCell | null)[][], 
    depth: number, 
    alpha: number, 
    beta: number,
    playerToMove: Player,
    aiPlayer: Player,
    activePlayers: Player[],
    moveHistory: string[]
): number => {

    if (depth === 0) {
        return evaluateBoard(board, aiPlayer, activePlayers, moveHistory);
    }

    const possibleMoves = getAllPossibleMoves(board, playerToMove);
    
    if (possibleMoves.length === 0) {
        return evaluateBoard(board, aiPlayer, activePlayers, moveHistory);
    }
    
    // Smart Move Ordering (Heuristic)
    // 1. Captures
    // 2. Promotions
    // 3. Checks (implied by attacking King zone, not calculated explicitly for perf)
    possibleMoves.forEach(move => {
        let score = 0;
        const target = board[move.to.row][move.to.col];
        if (target?.piece) score += PIECE_SCORES[target.piece.type] * 10;
        
        // Simple Check heuristic: Does this move attack the enemy king?
        // (Skipped for performance, sticking to captures)
        
        move.score = score;
    });

    possibleMoves.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Pruning: If deep in search, only look at top X moves unless they are captures?
    // For now, full search with alpha-beta.

    if (playerToMove === aiPlayer) {
        let maxEval = -Infinity;
        for (const move of possibleMoves) {
            const newBoard = simulateMove(board, move.from, move.to);
            const newHistory = [...moveHistory, boardToString(board)]; 
            
            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];

            const evaluation = minimax(newBoard, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of possibleMoves) {
            const newBoard = simulateMove(board, move.from, move.to);
            const newHistory = [...moveHistory, boardToString(board)];
            
            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];

            const evaluation = minimax(newBoard, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

const findBestMoveInternal = (
    board: (BoardCell | null)[][], 
    aiPlayer: Player, 
    activePlayers: Player[],
    depth: number,
    moveHistory: string[]
): Move | null => {
    // Determine search depth based on game state
    // In endgame, we need depth to see mates. In opening, depth 2-3 is fine.
    let searchDepth = depth;
    let pieceCount = 0;
    board.forEach(r => r.forEach(c => { if(c?.piece) pieceCount++; }));
    if (pieceCount < 8) searchDepth = Math.max(depth, 4); // Go deeper in endgame

    const possibleMoves = getAllPossibleMoves(board, aiPlayer);
    if (possibleMoves.length === 0) return null;

    let bestMove: Move | null = null;
    let bestValue = -Infinity;
    
    // Initial Sort
    possibleMoves.forEach(move => {
        let score = 0;
        if (board[move.to.row][move.to.col]?.piece) score += 100;
        move.score = score;
    });
    possibleMoves.sort((a, b) => (b.score || 0) - (a.score || 0));

    for (const move of possibleMoves) {
        const newBoard = simulateMove(board, move.from, move.to);
        const newHistory = [...moveHistory, boardToString(board)];
        
        const nextPlayerIndex = (activePlayers.indexOf(aiPlayer) + 1) % activePlayers.length;
        const nextPlayer = activePlayers[nextPlayerIndex];

        // Pass 'newHistory' to prevent immediate repetition loops
        const moveValue = minimax(newBoard, searchDepth - 1, -Infinity, Infinity, nextPlayer, aiPlayer, activePlayers, newHistory);

        // Random jitter to make AI less predictable in equal positions
        const jitter = Math.random() * 0.5;

        if (moveValue + jitter > bestValue) {
            bestValue = moveValue + jitter;
            bestMove = move;
        }
    }
    
    // Auto-promotion logic
    if (bestMove) {
        const piece = board[bestMove.from.row][bestMove.from.col]?.piece;
        if (piece?.type === PieceType.Pawn) {
            const zones = PROMOTION_ZONES[piece.player];
            const isPromo = zones.some(z => z.row === bestMove!.to.row && z.col === bestMove!.to.col);
            if (isPromo) {
                bestMove.promotion = PieceType.Queen;
            }
        }
    }
    
    return bestMove;
};


self.onmessage = (e: MessageEvent) => {
    const { board, aiPlayer, activePlayers, depth, moveHistory } = e.data;
    const bestMove = findBestMoveInternal(board, aiPlayer, activePlayers, depth, moveHistory);
    self.postMessage(bestMove);
};
