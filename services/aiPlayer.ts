
import { BoardCell, Player, PieceType } from '../types';
import { SETUP_ZONES } from '../constants';

const workerCode = `
// --- Inlined Dependencies ---

const Player = { Gray: 'GRAY', White: 'WHITE', Black: 'BLACK' };
const PieceType = { Pawn: 'PAWN', Rook: 'ROOK', Knight: 'KNIGHT', Bishop: 'BISHOP', Queen: 'QUEEN', King: 'KING' };

const BOARD_ROWS = 10;
const BOARD_COLS = 20;

const PIECE_SCORES = {
  [PieceType.Pawn]: 100,
  [PieceType.Rook]: 500,
  [PieceType.Knight]: 320,
  [PieceType.Bishop]: 330,
  [PieceType.Queen]: 900,
  [PieceType.King]: 20000,
};

const PROMOTION_ZONES = {
  [Player.White]: [{ row: 5, col: 11 }, { row: 8, col: 11 }],
  [Player.Black]: [{ row: 8, col: 8 }, { row: 5, col: 8 }],
  [Player.Gray]: [{ row: 9, col: 9 }, { row: 9, col: 10 }],
};

const SETUP_ZONES = {
  [Player.Gray]: [
    { row: 1, col: 8 }, { row: 1, col: 9 }, { row: 1, col: 10 }, { row: 1, col: 11 },
    { row: 0, col: 9 }, { row: 0, col: 10 }
  ],
  [Player.White]: [
    { row: 9, col: 0 }, { row: 9, col: 1 }, { row: 9, col: 2 },
    { row: 8, col: 1 }, { row: 8, col: 2 },
    { row: 7, col: 2 }
  ],
  [Player.Black]: [
    { row: 9, col: 19 }, { row: 9, col: 18 }, { row: 9, col: 17 },
    { row: 8, col: 18 }, { row: 8, col: 17 },
    { row: 7, col: 17 }
  ]
};


// --- Inlined gameLogic.ts ---

const isPromotionMove = (piece, to) => {
    if (piece.type !== PieceType.Pawn) return false;
    const playerPromotionZones = PROMOTION_ZONES[piece.player];
    return playerPromotionZones.some(zone => zone.row === to.row && zone.col === to.col);
};

const isWithinBoard = (coords) => {
  const { row, col } = coords;
  if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) {
    return false;
  }
  const cellsInRow = 2 * (row + 1);
  const padding = (BOARD_COLS - cellsInRow) / 2;
  return col >= padding && col < BOARD_COLS - padding;
};

const isPlayable = (coords, boardState) => {
  if (!isWithinBoard(coords)) return false;
  const cell = boardState[coords.row][coords.col];
  return cell?.isPlayable === true;
};

const calculateRawMoves = (piece, position, boardState, kingIsCurrentlyInCheck = false) => {
  const moves = [];

  const addSlidingMoves = (directions) => {
    for (const [dr, dc] of directions) {
      let nextPos = { row: position.row + dr, col: position.col + dc };
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
  
  const addSingleMoves = (potentialMoves) => {
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
      const movementDirections = {
        [Player.Gray]: { forward: [1, 0], backward: [-1, 0], sideways: [[0, -1], [0, 1]] },
        [Player.White]: { forward: [0, 1], backward: [0, -1], sideways: [[-1, 0], [1, 0]] },
        [Player.Black]: { forward: [0, -1], backward: [0, 1], sideways: [[-1, 0], [1, 0]] },
      };
      const dirs = movementDirections[piece.player];
      const oneStep = { row: position.row + dirs.forward[0], col: position.col + dirs.forward[1] };
      if (isPlayable(oneStep, boardState) && !boardState[oneStep.row][oneStep.col]?.piece) {
        moves.push(oneStep);
        if (!piece.hasMoved) {
          const twoSteps = { row: position.row + 2 * dirs.forward[0], col: position.col + 2 * dirs.forward[1] };
          if (isPlayable(twoSteps, boardState) && !boardState[twoSteps.row][twoSteps.col]?.piece) {
            moves.push(twoSteps);
          }
        }
      }
      for (const sideDir of dirs.sideways) {
        const sideMove = { row: position.row + sideDir[0], col: position.col + sideDir[1] };
        if (isPlayable(sideMove, boardState) && !boardState[sideMove.row][sideMove.col]?.piece) {
          moves.push(sideMove);
        }
      }
      if (!kingIsCurrentlyInCheck) {
        const backMove = { row: position.row + dirs.backward[0], col: position.col + dirs.backward[1] };
        if (isPlayable(backMove, boardState) && !boardState[backMove.row][backMove.col]?.piece) {
          moves.push(backMove);
        }
      }
      const captureMoves = [
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
    case PieceType.Rook: addSlidingMoves([[0, 1], [0, -1], [1, 0], [-1, 0]]); break;
    case PieceType.Bishop:
      addSlidingMoves([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
      if (!piece.justSwitchedDiagonal) {
        const orthogonalMoves = [
          { row: position.row + 1, col: position.col }, { row: position.row - 1, col: position.col },
          { row: position.row, col: position.col + 1 }, { row: position.row, col: position.col - 1 },
        ];
        addSingleMoves(orthogonalMoves);
      }
      break;
    case PieceType.Queen: addSlidingMoves([[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]); break;
    case PieceType.King:
      const kingMoves = [];
      for(let dr = -1; dr <= 1; dr++) for(let dc = -1; dc <= 1; dc++) {
        if (dr !== 0 || dc !== 0) kingMoves.push({row: position.row + dr, col: position.col + dc});
      }
      addSingleMoves(kingMoves);
      break;
    case PieceType.Knight:
      addSingleMoves([
          { row: position.row - 2, col: position.col - 1 }, { row: position.row - 2, col: position.col + 1 },
          { row: position.row + 2, col: position.col - 1 }, { row: position.row + 2, col: position.col + 1 },
          { row: position.row - 1, col: position.col - 2 }, { row: position.row - 1, col: position.col + 2 },
          { row: position.row + 1, col: position.col - 2 }, { row: position.row + 1, col: position.col + 2 },
      ]);
      break;
  }
  return moves;
};

const findKing = (player, boardState) => {
  for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) {
    const cell = boardState[r][c];
    if (cell?.piece?.player === player && cell.piece.type === PieceType.King) return { row: r, col: c };
  }
  return null;
};

const isKingInCheck = (player, boardState) => {
  const kingPos = findKing(player, boardState);
  if (!kingPos) return false;
  const opponents = [Player.White, Player.Black, Player.Gray].filter(p => p !== player);
  for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) {
    const cell = boardState[r][c];
    if (cell?.piece && opponents.includes(cell.piece.player)) {
      if (cell.piece.type === PieceType.Bishop) {
        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dr, dc] of directions) {
          let nextPos = { row: r + dr, col: c + dc };
          while (isPlayable(nextPos, boardState)) {
            if (nextPos.row === kingPos.row && nextPos.col === kingPos.col) return true;
            if (boardState[nextPos.row][nextPos.col]?.piece) break;
            nextPos = { row: nextPos.row + dr, col: nextPos.col + dc };
          }
        }
      } else {
        const moves = calculateRawMoves(cell.piece, { row: r, col: c }, boardState);
        if (moves.some(move => move.row === kingPos.row && move.col === kingPos.col)) return true;
      }
    }
  }
  return false;
};

const getValidMoves = (piece, position, boardState) => {
  const kingIsCurrentlyInCheck = isKingInCheck(piece.player, boardState);
  const rawMoves = calculateRawMoves(piece, position, boardState, kingIsCurrentlyInCheck);
  
  const validMoves = [];
  for (const move of rawMoves) {
    const originalPiece = boardState[position.row][position.col].piece;
    const capturedPiece = boardState[move.row][move.col].piece;

    // Perform the move on the board
    boardState[move.row][move.col].piece = { ...originalPiece, hasMoved: true };
    boardState[position.row][position.col].piece = null;

    // Check if the king is safe after the move
    if (!isKingInCheck(piece.player, boardState)) {
        validMoves.push(move);
    }
    
    // Undo the move
    boardState[position.row][position.col].piece = originalPiece;
    boardState[move.row][move.col].piece = capturedPiece;
  }
  return validMoves;
};

const isCheckmate = (player, boardState) => {
    if(!isKingInCheck(player, boardState)) return false;
    for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) {
        const cell = boardState[r][c];
        if (cell?.piece?.player === player && getValidMoves(cell.piece, { row: r, col: c }, boardState).length > 0) return false;
    }
    return true;
};

const isStalemate = (player, boardState) => {
    if (isKingInCheck(player, boardState)) return false;
    for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) {
        const cell = boardState[r][c];
        if (cell?.piece?.player === player && getValidMoves(cell.piece, { row: r, col: c }, boardState).length > 0) return false;
    }
    return true;
};

// --- Original aiWorker.ts content ---

const boardToString = (board) => {
    return board.map(row => 
        row.map(cell => {
            if (!cell?.piece) return ' ';
            return \`\${cell.piece.player[0]}\${cell.piece.type[0]}\`;
        }).join('')
    ).join('|');
};

const evaluateBoard = (board, aiPlayer, activePlayers, moveHistory) => {
    const currentBoardStr = boardToString(board);
    if (moveHistory.filter(h => h === currentBoardStr).length >= 2) {
        return 0;
    }

    let scores = {
        material: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
        mobility: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
        kingSafety: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
        development: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 }
    };
    
    const setupZoneMap = new Map();
    for (const p in SETUP_ZONES) {
        SETUP_ZONES[p].forEach(coord => {
            setupZoneMap.set(\`\${coord.row}-\${coord.col}\`, p);
        });
    }

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = board[r][c];
            if (cell?.piece) {
                const piece = cell.piece;
                const player = piece.player;
                
                scores.material[player] += PIECE_SCORES[piece.type];

                if (piece.type === PieceType.Pawn) {
                    let promotionBonus = 0;
                    let progress = 0;
                    if (player === Player.Gray) {
                        progress = r - 1;
                        promotionBonus = Math.pow(progress, 2) * 5; // Reduced bonus
                    } else if (player === Player.White) {
                        progress = c - 2;
                        promotionBonus = Math.pow(progress, 2) * 5; // Reduced bonus
                    } else if (player === Player.Black) {
                        progress = 17 - c;
                        promotionBonus = Math.pow(progress, 2) * 5; // Reduced bonus
                    }
                    scores.material[player] += promotionBonus;
                }

                if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
                    const isAtHome = setupZoneMap.get(\`\${r}-\${c}\`) === player;
                    if (!isAtHome) {
                        scores.development[player] += 25; // Increased bonus
                    }
                }
            }
        }
    }

    for (const player of activePlayers) {
        scores.mobility[player] = getAllPossibleMoves(board, player).length;
        if (isKingInCheck(player, board)) {
            scores.kingSafety[player] -= 500;
             activePlayers.forEach(p => {
                if (p !== player) scores.kingSafety[p] += 250;
            });
        }
    }

    let finalScore = 0;
    const aiMaterial = scores.material[aiPlayer];
    const aiMobility = scores.mobility[aiPlayer];
    const aiKingSafety = scores.kingSafety[aiPlayer];
    const aiDevelopment = scores.development[aiPlayer];
    let opponentMaterial = 0;
    let opponentMobility = 0;
    
    activePlayers.forEach(p => {
        if (p !== aiPlayer) {
            opponentMaterial += scores.material[p];
            opponentMobility += scores.mobility[p];
            finalScore += scores.kingSafety[p];
        }
    });

    const opponentCount = Math.max(1, activePlayers.length - 1);
    finalScore += aiMaterial - (opponentMaterial / opponentCount);
    finalScore += (aiMobility - opponentMobility) * 3;
    finalScore += aiKingSafety;
    finalScore += aiDevelopment;

    if (isCheckmate(aiPlayer, board)) return -Infinity;
    if (isStalemate(aiPlayer, board)) return -10000;

    for(const player of activePlayers) {
        if (player !== aiPlayer) {
            if (isCheckmate(player, board)) finalScore += 50000;
            if (isStalemate(player, board)) finalScore += 25000;
        }
    }

    return finalScore;
};


const getAllPossibleMoves = (board, player) => {
    const moves = [];
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

const minimax = (board, depth, alpha, beta, playerToMove, aiPlayer, activePlayers, moveHistory) => {
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
            const originalPiece = board[move.from.row][move.from.col].piece;
            const capturedPiece = board[move.to.row][move.to.col].piece;
            
            // Create a copy to avoid mutation issues
            const pieceToMove = { ...originalPiece, hasMoved: true };
            board[move.to.row][move.to.col].piece = pieceToMove;
            board[move.from.row][move.from.col].piece = null;
            if (isPromotionMove(originalPiece, move.to)) {
                pieceToMove.type = PieceType.Queen;
            }

            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];
            const newHistory = [...moveHistory, boardToString(board)];
            const evaluation = minimax(board, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);
            
            // Undo move
            board[move.from.row][move.from.col].piece = originalPiece;
            board[move.to.row][move.to.col].piece = capturedPiece;

            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of possibleMoves) {
            const originalPiece = board[move.from.row][move.from.col].piece;
            const capturedPiece = board[move.to.row][move.to.col].piece;

            const pieceToMove = { ...originalPiece, hasMoved: true };
            board[move.to.row][move.to.col].piece = pieceToMove;
            board[move.from.row][move.from.col].piece = null;
            if (isPromotionMove(originalPiece, move.to)) {
                pieceToMove.type = PieceType.Queen;
            }

            const nextPlayerIndex = (activePlayers.indexOf(playerToMove) + 1) % activePlayers.length;
            const nextPlayer = activePlayers[nextPlayerIndex];
            const newHistory = [...moveHistory, boardToString(board)];
            const evaluation = minimax(board, depth - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, newHistory);

            // Undo move
            board[move.from.row][move.from.col].piece = originalPiece;
            board[move.to.row][move.to.col].piece = capturedPiece;

            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

const findBestMoveInternal = (board, aiPlayer, activePlayers, depth, moveHistory) => {
    const possibleMoves = getAllPossibleMoves(board, aiPlayer);
    if (possibleMoves.length === 0) return null;
    let bestMove = null;
    let bestValue = -Infinity;
    const shuffledMoves = [...possibleMoves].sort(() => Math.random() - 0.5);

    for (const move of shuffledMoves) {
        const originalPiece = board[move.from.row][move.from.col].piece;
        const capturedPiece = board[move.to.row][move.to.col].piece;

        const pieceToMove = { ...originalPiece, hasMoved: true };
        board[move.to.row][move.to.col].piece = pieceToMove;
        board[move.from.row][move.from.col].piece = null;
        if (isPromotionMove(originalPiece, move.to)) {
           pieceToMove.type = PieceType.Queen;
        }
        
        const nextPlayerIndex = (activePlayers.indexOf(aiPlayer) + 1) % activePlayers.length;
        const nextPlayer = activePlayers[nextPlayerIndex];
        const newHistory = [...moveHistory, boardToString(board)];
        const moveValue = minimax(board, depth - 1, -Infinity, Infinity, nextPlayer, aiPlayer, activePlayers, newHistory);
        
        // Undo Move
        board[move.from.row][move.from.col].piece = originalPiece;
        board[move.to.row][move.to.col].piece = capturedPiece;

        if (moveValue > bestValue) {
            bestValue = moveValue;
            bestMove = move;
        }
    }
    
    const finalMove = bestMove || shuffledMoves[0];
    if (!finalMove) return null;

    const piece = board[finalMove.from.row][finalMove.from.col].piece;
    if (piece && isPromotionMove(piece, finalMove.to)) {
        return { ...finalMove, promotion: PieceType.Queen };
    }

    return finalMove;
};

self.onmessage = (e) => {
    const { board, aiPlayer, activePlayers, depth, moveHistory } = e.data;
    const bestMove = findBestMoveInternal(board, aiPlayer, activePlayers, depth, moveHistory);
    self.postMessage(bestMove);
};
`;

export const findBestMove = (
    board: (BoardCell | null)[][], 
    aiPlayer: Player, 
    activePlayers: Player[],
    depth: number,
    moveHistory: string[]
): { worker: Worker; url: string } => {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.postMessage({ board, aiPlayer, activePlayers, depth, moveHistory });
    return { worker, url };
};

export const getAiSetup = (board: (BoardCell | null)[][], aiPlayer: Player, piecesToPlace: PieceType[]): (BoardCell | null)[][] => {
    const newBoard = JSON.parse(JSON.stringify(board));
    const validZoneCoords = SETUP_ZONES[aiPlayer];
    const availableCells = validZoneCoords.filter(coords => !newBoard[coords.row][coords.col]?.piece);
    
    if (availableCells.length < piecesToPlace.length) {
        console.error(`AI for ${aiPlayer} has not enough space to set up pieces.`);
        return newBoard; // Return original board if something is wrong
    }
    
    const shuffledCells = [...availableCells].sort(() => Math.random() - 0.5);

    piecesToPlace.forEach((pieceType, index) => {
        const targetCellCoords = shuffledCells[index];
        (newBoard[targetCellCoords.row][targetCellCoords.col] as BoardCell).piece = { player: aiPlayer, type: pieceType, hasMoved: false };
    });

    return newBoard;
};
