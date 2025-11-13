import { BoardCell, Coordinates, Piece, Player, PieceType } from '../types';
import { PIECE_SCORES, BOARD_ROWS, BOARD_COLS } from '../constants';
import { getValidMoves, isCheckmate, isStalemate, simulateMove } from './gameLogic';

interface Move {
    from: Coordinates;
    to: Coordinates;
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

const positionalValue = (row: number, col: number): number => {
    const centerRow = 6;
    const centerCol = 9.5;
    const dist = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
    return Math.max(0, 10 - dist) * 0.01;
};

const evaluateBoard = (board: (BoardCell | null)[][], aiPlayer: Player, activePlayers: Player[], moveHistory: string[]): number => {
    // Check for threefold repetition to avoid loops. If the current move would result
    // in a third repetition of a position, it's a draw, so we score it neutrally.
    const currentBoardStr = boardToString(board);
    const repetitionCount = moveHistory.filter(h => h === currentBoardStr).length;
    if (repetitionCount >= 2) {
        return 0; // Neutral score for a repeated position
    }

    let totalScore = 0;
    
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = board[r][c];
            if (cell?.piece) {
                const piece = cell.piece;
                const score = PIECE_SCORES[piece.type] + positionalValue(r, c);
                if (piece.player === aiPlayer) {
                    totalScore += score;
                } else {
                    totalScore -= score / Math.max(1, activePlayers.length - 1);
                }
            }
        }
    }

    if (isCheckmate(aiPlayer, board)) return -Infinity;
    if (isStalemate(aiPlayer, board)) return -1000;

    for(const player of activePlayers) {
        if (player !== aiPlayer) {
            if (isCheckmate(player, board)) totalScore += 1000;
            if (isStalemate(player, board)) totalScore += 500;
        }
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
                validMoves.forEach(to => moves.push({ from: { row: r, col: c }, to }));
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

    if (depth === 0 || activePlayers.length <= 1) {
        return evaluateBoard(board, aiPlayer, activePlayers, moveHistory);
    }

    const possibleMoves = getAllPossibleMoves(board, playerToMove);
    
    if (possibleMoves.length === 0) {
        return evaluateBoard(board, aiPlayer, activePlayers, moveHistory);
    }
    
    if (playerToMove === aiPlayer) {
        let maxEval = -Infinity;
        for (const move of possibleMoves) {
            const newBoard = simulateMove(board, move.from, move.to);
            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];
            const newHistory = [...moveHistory, boardToString(board)];

            const evaluation = minimax(newBoard, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) {
                break;
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of possibleMoves) {
            const newBoard = simulateMove(board, move.from, move.to);
            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];
            const newHistory = [...moveHistory, boardToString(board)];
            
            const evaluation = minimax(newBoard, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) {
                break;
            }
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
    const possibleMoves = getAllPossibleMoves(board, aiPlayer);
    if (possibleMoves.length === 0) return null;

    let bestMove: Move | null = null;
    let bestValue = -Infinity;
    
    const shuffledMoves = [...possibleMoves].sort(() => Math.random() - 0.5);

    for (const move of shuffledMoves) {
        const newBoard = simulateMove(board, move.from, move.to);
        const nextPlayerIndex = (activePlayers.indexOf(aiPlayer) + 1) % activePlayers.length;
        const nextPlayer = activePlayers[nextPlayerIndex];
        const newHistory = [...moveHistory, boardToString(board)];
        
        const moveValue = minimax(newBoard, depth - 1, -Infinity, Infinity, nextPlayer, aiPlayer, activePlayers, newHistory);

        if (moveValue > bestValue) {
            bestValue = moveValue;
            bestMove = move;
        }
    }
    
    return bestMove || possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
};


self.onmessage = (e: MessageEvent) => {
    const { board, aiPlayer, activePlayers, depth, moveHistory } = e.data;
    const bestMove = findBestMoveInternal(board, aiPlayer, activePlayers, depth, moveHistory);
    self.postMessage(bestMove);
};
