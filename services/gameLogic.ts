
import { BoardCell, Coordinates, Piece, Player, PieceType } from '../types';
import { BOARD_COLS, BOARD_ROWS, PROMOTION_ZONES } from '../constants';

const isWithinBoard = (coords: Coordinates): boolean => {
  const { row, col } = coords;
  if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) {
    return false;
  }
  const cellsInRow = 2 * (row + 1);
  const padding = (BOARD_COLS - cellsInRow) / 2;
  return col >= padding && col < BOARD_COLS - padding;
};

const isPlayable = (coords: Coordinates, boardState: (BoardCell | null)[][]): boolean => {
  if (!isWithinBoard(coords)) return false;
  const cell = boardState[coords.row][coords.col];
  return cell?.isPlayable === true;
};

// Internal function to calculate all potential moves for a piece, without validating against checks.
const calculateRawMoves = (piece: Piece, position: Coordinates, boardState: (BoardCell | null)[][], kingIsCurrentlyInCheck: boolean = false): Coordinates[] => {
  const moves: Coordinates[] = [];

  const addSlidingMoves = (directions: number[][]) => {
    for (const [dr, dc] of directions) {
      let nextPos: Coordinates = { row: position.row + dr, col: position.col + dc };
      while (isPlayable(nextPos, boardState)) {
        const pieceAtNext = boardState[nextPos.row][nextPos.col]?.piece;
        if (pieceAtNext) {
          if (pieceAtNext.player !== piece.player) {
            moves.push(nextPos);
          }
          break;
        }
        moves.push(nextPos);
        nextPos = { row: nextPos.row + dr, col: nextPos.col + dc };
      }
    }
  };
  
  const addSingleMoves = (potentialMoves: Coordinates[]) => {
      for(const move of potentialMoves) {
          if(isPlayable(move, boardState)) {
              const pieceAtNext = boardState[move.row][move.col]?.piece;
              if(!pieceAtNext || pieceAtNext.player !== piece.player) {
                  moves.push(move);
              }
          }
      }
  };

  switch (piece.type) {
    case PieceType.Pawn:
      // --- Universal Pawn Logic ---

      // 1. Orthogonal Movement (Non-Capture)
      // This is relative to the board axes, not the pawn's 'forward' direction.
      const movementDirections: { [key in Player]: { forward: number[], backward: number[], sideways: number[][] } } = {
        [Player.Gray]: { forward: [1, 0], backward: [-1, 0], sideways: [[0, -1], [0, 1]] },
        [Player.White]: { forward: [0, 1], backward: [0, -1], sideways: [[-1, 0], [1, 0]] },
        [Player.Black]: { forward: [0, -1], backward: [0, 1], sideways: [[-1, 0], [1, 0]] },
      };
      
      const dirs = movementDirections[piece.player];

      // Forward & Double-Step
      const oneStep: Coordinates = { row: position.row + dirs.forward[0], col: position.col + dirs.forward[1] };
      if (isPlayable(oneStep, boardState) && !boardState[oneStep.row][oneStep.col]?.piece) {
        moves.push(oneStep);
        if (!piece.hasMoved) {
          const twoSteps: Coordinates = { row: position.row + 2 * dirs.forward[0], col: position.col + 2 * dirs.forward[1] };
          if (isPlayable(twoSteps, boardState) && !boardState[twoSteps.row][twoSteps.col]?.piece) {
            moves.push(twoSteps);
          }
        }
      }

      // Sideways
      for (const sideDir of dirs.sideways) {
        const sideMove: Coordinates = { row: position.row + sideDir[0], col: position.col + sideDir[1] };
        if (isPlayable(sideMove, boardState) && !boardState[sideMove.row][sideMove.col]?.piece) {
          moves.push(sideMove);
        }
      }
      
      // Backward
      if (!kingIsCurrentlyInCheck) {
        const backMove: Coordinates = { row: position.row + dirs.backward[0], col: position.col + dirs.backward[1] };
        if (isPlayable(backMove, boardState) && !boardState[backMove.row][backMove.col]?.piece) {
          moves.push(backMove);
        }
      }

      // 2. Omnidirectional Diagonal Capture
      const captureMoves: Coordinates[] = [
        { row: position.row - 1, col: position.col - 1 }, { row: position.row - 1, col: position.col + 1 },
        { row: position.row + 1, col: position.col - 1 }, { row: position.row + 1, col: position.col + 1 },
      ];
      for (const move of captureMoves) {
        if (isPlayable(move, boardState)) {
          const pieceAtNext = boardState[move.row][move.col]?.piece;
          if (pieceAtNext && pieceAtNext.player !== piece.player) {
            moves.push(move);
          }
        }
      }
      break;

    case PieceType.Rook:
      addSlidingMoves([[0, 1], [0, -1], [1, 0], [-1, 0]]);
      break;

    case PieceType.Bishop:
      addSlidingMoves([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
      // Allow single orthogonal move to change diagonal color, if not on cooldown
      if (!piece.justSwitchedDiagonal) {
        const orthogonalMoves: Coordinates[] = [
          { row: position.row + 1, col: position.col },
          { row: position.row - 1, col: position.col },
          { row: position.row, col: position.col + 1 },
          { row: position.row, col: position.col - 1 },
        ];
        addSingleMoves(orthogonalMoves);
      }
      break;

    case PieceType.Queen:
      addSlidingMoves([[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
      break;

    case PieceType.King:
      const kingMoves: Coordinates[] = [];
      for(let dr = -1; dr <= 1; dr++) {
          for(let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              kingMoves.push({row: position.row + dr, col: position.col + dc});
          }
      }
      addSingleMoves(kingMoves);
      break;
      
    case PieceType.Knight:
      const knightMoves: Coordinates[] = [
          { row: position.row - 2, col: position.col - 1 }, { row: position.row - 2, col: position.col + 1 },
          { row: position.row + 2, col: position.col - 1 }, { row: position.row + 2, col: position.col + 1 },
          { row: position.row - 1, col: position.col - 2 }, { row: position.row - 1, col: position.col + 2 },
          { row: position.row + 1, col: position.col - 2 }, { row: position.row + 1, col: position.col + 2 },
      ];
      addSingleMoves(knightMoves);
      break;
  }

  return moves;
};

const findKing = (player: Player, boardState: (BoardCell | null)[][]): Coordinates | null => {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = boardState[r][c];
      if (cell?.piece?.player === player && cell.piece.type === PieceType.King) {
        return { row: r, col: c };
      }
    }
  }
  return null;
};

export const simulateMove = (
  board: (BoardCell | null)[][], 
  from: Coordinates, 
  to: Coordinates
): (BoardCell | null)[][] => {
    const newBoard = JSON.parse(JSON.stringify(board));
    const pieceToMove = (newBoard[from.row][from.col] as BoardCell).piece;
    (newBoard[to.row][to.col] as BoardCell).piece = pieceToMove;
    (newBoard[from.row][from.col] as BoardCell).piece = null;
    return newBoard;
}

export const isKingInCheck = (player: Player, boardState: (BoardCell | null)[][]): boolean => {
  const kingPos = findKing(player, boardState);
  if (!kingPos) return false;

  const opponents = [Player.White, Player.Black, Player.Gray].filter(p => p !== player);

  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = boardState[r][c];
      if (cell?.piece && opponents.includes(cell.piece.player)) {
        if (cell.piece.type === PieceType.Bishop) {
            // Bishops only check diagonally. We must calculate their attacking moves separately
            // to exclude the non-attacking orthogonal "diagonal switch" move.
            const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (const [dr, dc] of directions) {
                let nextPos: Coordinates = { row: r + dr, col: c + dc };
                while (isPlayable(nextPos, boardState)) {
                    if (nextPos.row === kingPos.row && nextPos.col === kingPos.col) {
                        return true; // Found a check
                    }
                    const pieceAtNext = boardState[nextPos.row][nextPos.col]?.piece;
                    if (pieceAtNext) {
                        break; // Path is blocked
                    }
                    nextPos = { row: nextPos.row + dr, col: nextPos.col + dc };
                }
            }
        } else {
            const moves = calculateRawMoves(cell.piece, { row: r, col: c }, boardState);
            if (moves.some(move => move.row === kingPos.row && move.col === kingPos.col)) {
              return true;
            }
        }
      }
    }
  }
  return false;
};

export const getValidMoves = (piece: Piece, position: Coordinates, boardState: (BoardCell | null)[][]): Coordinates[] => {
  const kingIsCurrentlyInCheck = isKingInCheck(piece.player, boardState);
  const rawMoves = calculateRawMoves(piece, position, boardState, kingIsCurrentlyInCheck);
  
  return rawMoves.filter(move => {
    const tempBoard = simulateMove(boardState, position, move);
    return !isKingInCheck(piece.player, tempBoard);
  });
};

export const isCheckmate = (player: Player, boardState: (BoardCell | null)[][]): boolean => {
    if(!isKingInCheck(player, boardState)) {
        return false;
    }

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = boardState[r][c];
            if (cell?.piece?.player === player) {
                const validMoves = getValidMoves(cell.piece, { row: r, col: c }, boardState);
                if (validMoves.length > 0) {
                    return false; // Found a move to escape check
                }
            }
        }
    }

    return true; // No valid moves found for any piece
};

export const isStalemate = (player: Player, boardState: (BoardCell | null)[][]): boolean => {
    if (isKingInCheck(player, boardState)) {
        return false;
    }

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = boardState[r][c];
            if (cell?.piece?.player === player) {
                const validMoves = getValidMoves(cell.piece, { row: r, col: c }, boardState);
                if (validMoves.length > 0) {
                    return false; // Found a legal move
                }
            }
        }
    }

    return true; // No legal moves found for any piece
};

export const determineStalemateWinner = (stalematedPlayer: Player, boardState: (BoardCell | null)[][], activeOpponents: Player[]): Player | null => {
    const kingPos = findKing(stalematedPlayer, boardState);
    if (!kingPos) return null;

    const surroundingSquares: Coordinates[] = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const square = { row: kingPos.row + dr, col: kingPos.col + dc };
            if (isPlayable(square, boardState)) {
                surroundingSquares.push(square);
            }
        }
    }

    const controlCounts: { [key in Player]?: number } = {};
    activeOpponents.forEach(p => controlCounts[p] = 0);

    for (const opponent of activeOpponents) {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const cell = boardState[r][c];
                if (cell?.piece?.player === opponent) {
                    const controlledMoves = calculateRawMoves(cell.piece, { row: r, col: c }, boardState);
                    for (const move of controlledMoves) {
                        if (surroundingSquares.some(s => s.row === move.row && s.col === move.col)) {
                            controlCounts[opponent]!++;
                        }
                    }
                }
            }
        }
    }

    let winner: Player | null = null;
    let maxControl = -1;
    for (const opponent of activeOpponents) {
        if (controlCounts[opponent]! > maxControl) {
            maxControl = controlCounts[opponent]!;
            winner = opponent;
        } else if (controlCounts[opponent]! === maxControl) {
            winner = null; // Tie, no single winner
        }
    }
    
    return winner;
};

export const isPromotionMove = (piece: Piece, to: Coordinates): boolean => {
    if (piece.type !== PieceType.Pawn) return false;
    const playerPromotionZones = PROMOTION_ZONES[piece.player];
    return playerPromotionZones.some(zone => zone.row === to.row && zone.col === to.col);
};
