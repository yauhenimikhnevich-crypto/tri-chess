import { BoardCell, Player, PieceType } from '../types';
import { SETUP_ZONES } from '../constants';

const workerCode = `
// --- Inlined Dependencies ---
const Player = { Gray: 'GRAY', White: 'WHITE', Black: 'BLACK' };
const PieceType = { Pawn: 'PAWN', Rook: 'ROOK', Knight: 'KNIGHT', Bishop: 'BISHOP', Queen: 'QUEEN', King: 'KING' };

const BOARD_ROWS = 10;
const BOARD_COLS = 20;

// Dynamic Time Limit
let CURRENT_TIME_LIMIT = 1500; 

const PIECE_VALUES = {
  [PieceType.Pawn]: 100,
  [PieceType.Knight]: 320,
  [PieceType.Bishop]: 330,
  [PieceType.Rook]: 500,
  [PieceType.Queen]: 975, 
  [PieceType.King]: 20000,
};

const PROMOTION_ZONES = {
  [Player.White]: [{ row: 5, col: 11 }, { row: 8, col: 11 }],
  [Player.Black]: [{ row: 8, col: 8 }, { row: 5, col: 8 }],
  [Player.Gray]: [{ row: 9, col: 9 }, { row: 9, col: 10 }],
};

const FORTRESS_SET = new Set([
  '5,9','5,10','6,8','6,9','6,10','6,11',
  '7,8','7,9','7,10','7,11','8,9','8,10'
]);

// --- SEARCH HEURISTICS STORAGE ---
// Killer Moves: [Ply][Slot] -> Move Object
const MAX_PLY = 30;
const killerMoves = new Array(MAX_PLY).fill(null).map(() => [null, null]);

// History Heuristic: Map<"r,c-r,c", score>
const historyMoves = new Map();

// --- HELPER: Board To String ---
const boardToString = (board) => {
    return board.map(row => 
        row.map(cell => {
            if (!cell) return ' ';
            return cell.player.charAt(0) + cell.type.charAt(0);
        }).join('')
    ).join('|');
};

// --- ZOBRIST HASHING ---
const zobristTable = [];
const zobristTurn = {}; 
const initZobrist = () => {
    for(let i=0; i<BOARD_ROWS*BOARD_COLS; i++) {
        zobristTable[i] = {};
        ['WHITE','BLACK','GRAY'].forEach(p => {
            zobristTable[i][p] = {};
            ['PAWN','ROOK','KNIGHT','BISHOP','QUEEN','KING'].forEach(t => {
                zobristTable[i][p][t] = Math.floor(Math.random() * 2147483647);
            });
        });
    }
    ['WHITE','BLACK','GRAY'].forEach(p => {
        zobristTurn[p] = Math.floor(Math.random() * 2147483647);
    });
};
initZobrist();

const computeHash = (board, playerToMove) => {
    let h = 0;
    for(let r=0; r<BOARD_ROWS; r++) {
        for(let c=0; c<BOARD_COLS; c++) {
            const p = board[r][c];
            if(p) {
                h ^= zobristTable[r*BOARD_COLS+c][p.player][p.type];
            }
        }
    }
    h ^= zobristTurn[playerToMove];
    return h;
};

// --- PRECOMPUTED TABLES ---
const pstCenter = new Int16Array(BOARD_ROWS * BOARD_COLS).fill(0);
const pstKingSafety = new Int16Array(BOARD_ROWS * BOARD_COLS).fill(0);

for(let r=0; r<BOARD_ROWS; r++) {
    for(let c=0; c<BOARD_COLS; c++) {
        const dist = Math.abs(c - 9.5) + Math.abs(r - 5);
        if (dist < 5) {
            pstCenter[r*BOARD_COLS+c] = (5 - dist) * 10;
            pstKingSafety[r*BOARD_COLS+c] = -(6 - dist) * 50; 
        } else {
            pstKingSafety[r*BOARD_COLS+c] = 30; 
        }
    }
}

// --- HELPERS ---
const isPlayable = (r, c) => {
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) return false;
    if (r >= 5 && r <= 8 && c >= 8 && c <= 11) {
        if (FORTRESS_SET.has(r + ',' + c)) return false;
    }
    const padding = (BOARD_COLS - 2 * (r + 1)) / 2;
    return c >= padding && c < BOARD_COLS - padding;
};

const isPromotionZone = (player, r, c) => {
    const zones = PROMOTION_ZONES[player];
    if (!zones) return false;
    for(let i=0; i<zones.length; i++) if (zones[i].row === r && zones[i].col === c) return true;
    return false;
};

const createPromotionMap = (player) => {
    const map = new Int16Array(BOARD_ROWS * BOARD_COLS).fill(0);
    const targets = PROMOTION_ZONES[player];
    const distMap = new Int16Array(BOARD_ROWS * BOARD_COLS).fill(-1);
    const queue = [];
    
    targets.forEach(t => {
        if (isPlayable(t.row, t.col)) {
            const idx = t.row * BOARD_COLS + t.col;
            distMap[idx] = 0;
            queue.push({r: t.row, c: t.col, d: 0});
        }
    });

    let head = 0;
    while(head < queue.length) {
        const {r, c, d} = queue[head++];
        const neighbors = [
            {r: r+1, c: c}, {r: r-1, c: c}, {r: r, c: c+1}, {r: r, c: c-1},
            {r: r+1, c: c+1}, {r: r+1, c: c-1}, {r: r-1, c: c+1}, {r: r-1, c: c-1}
        ];
        for(let i=0; i<8; i++) {
            const nr = neighbors[i].r, nc = neighbors[i].c;
            if (isPlayable(nr, nc)) {
                const idx = nr * BOARD_COLS + nc;
                if (distMap[idx] === -1) {
                    distMap[idx] = d + 1;
                    queue.push({r: nr, c: nc, d: d + 1});
                }
            }
        }
    }
    for(let i=0; i<distMap.length; i++) {
        if (distMap[i] !== -1) {
            const dist = distMap[i];
            if (dist === 0) map[i] = 800; 
            else if (dist === 1) map[i] = 500; 
            else if (dist === 2) map[i] = 300; 
            else if (dist === 3) map[i] = 150;
            else if (dist === 4) map[i] = 100;
            else map[i] = Math.max(0, 80 - dist * 5); 
        }
    }
    return map;
};

const pawnPromotionDistMap = {
    [Player.White]: createPromotionMap(Player.White),
    [Player.Black]: createPromotionMap(Player.Black),
    [Player.Gray]: createPromotionMap(Player.Gray),
};

const getDistance = (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2);

const isSquareAttackedByHero = (targetR, targetC, board, hero) => {
    // Knight
    const knightDir = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
    for (let i=0; i<8; i++) {
        const nr = targetR + knightDir[i][0], nc = targetC + knightDir[i][1];
        if (isPlayable(nr, nc)) {
            const p = board[nr][nc];
            if (p && p.player === hero && p.type === PieceType.Knight) return true;
        }
    }
    // Sliding
    const ortho = [[0,1],[0,-1],[1,0],[-1,0]];
    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    
    // Rooks/Queens
    for (let i=0; i<4; i++) {
        let nr = targetR + ortho[i][0], nc = targetC + ortho[i][1];
        while (isPlayable(nr, nc)) {
            const p = board[nr][nc];
            if (p) {
                if (p.player === hero && (p.type === PieceType.Rook || p.type === PieceType.Queen)) return true;
                break;
            }
            nr += ortho[i][0];
            nc += ortho[i][1];
        }
    }
    // Bishops/Queens
    for (let i=0; i<4; i++) {
        let nr = targetR + diag[i][0], nc = targetC + diag[i][1];
        while (isPlayable(nr, nc)) {
            const p = board[nr][nc];
            if (p) {
                if (p.player === hero && (p.type === PieceType.Bishop || p.type === PieceType.Queen)) return true;
                break;
            }
            nr += diag[i][0];
            nc += diag[i][1];
        }
    }
    
    // Pawn threats - OMNIDIRECTIONAL
    const pawnCaps = [{r:1, c:1}, {r:1, c:-1}, {r:-1, c:1}, {r:-1, c:-1}];
    for (const d of pawnCaps) {
        const pr = targetR + d.r; 
        const pc = targetC + d.c;
        if (isPlayable(pr, pc)) {
            const p = board[pr][pc];
            if (p && p.player === hero && p.type === PieceType.Pawn) return true;
        }
    }

    // King
    const kNeighbors = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let i=0; i<8; i++) {
        const nr = targetR + kNeighbors[i][0], nc = targetC + kNeighbors[i][1];
        if (isPlayable(nr, nc)) {
             const p = board[nr][nc];
             if (p && p.player === hero && p.type === PieceType.King) return true;
        }
    }

    return false;
};

// --- MOVE GENERATION ---
const generateMoves = (board, player, capturesOnly) => {
    const moves = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = board[r][c];
            if (!cell || cell.player !== player) continue;
            const type = cell.type;
            const fr = r, fc = c;
            
            if (type === PieceType.Pawn) {
                const dirs = { 
                    [Player.Gray]:{f:[1,0], s:[[0,-1],[0,1]]}, 
                    [Player.White]:{f:[0,1], s:[[-1,0],[1,0]]}, 
                    [Player.Black]:{f:[0,-1], s:[[-1,0],[1,0]]}
                }[player];

                // Captures
                const caps = [{r:1, c:1}, {r:1, c:-1}, {r:-1, c:1}, {r:-1, c:-1}];
                for (const cap of caps) {
                    const nr = r + cap.r, nc = c + cap.c;
                    if (isPlayable(nr, nc)) {
                        const target = board[nr][nc];
                        if (target && target.player !== player) {
                            const isProm = isPromotionZone(player, nr, nc);
                            moves.push({fr, fc, tr:nr, tc:nc, prom: isProm ? PieceType.Queen : undefined, cap: true});
                        }
                    }
                }

                // Non-Captures
                const f1r = r + dirs.f[0], f1c = c + dirs.f[1];
                if (isPlayable(f1r, f1c) && !board[f1r][f1c]) {
                    const isProm = isPromotionZone(player, f1r, f1c);
                    if (!capturesOnly || isProm) {
                        moves.push({fr, fc, tr:f1r, tc:f1c, prom: isProm ? PieceType.Queen : undefined});
                    }
                    if (!capturesOnly && !cell.hasMoved) {
                        const f2r = r + 2*dirs.f[0], f2c = c + 2*dirs.f[1];
                        if (isPlayable(f2r, f2c) && !board[f2r][f2c]) moves.push({fr, fc, tr:f2r, tc:f2c});
                    }
                }
                for(let i=0; i<2; i++) {
                    const sr = r + dirs.s[i][0], sc = c + dirs.s[i][1];
                    if (isPlayable(sr, sc) && !board[sr][sc]) {
                        const isProm = isPromotionZone(player, sr, sc);
                        if (!capturesOnly || isProm) {
                            moves.push({fr, fc, tr:sr, tc:sc, prom: isProm ? PieceType.Queen : undefined});
                        }
                    }
                }
            } 
            else {
                // Sliding & Knight & King
                let dirs = [];
                let sliding = false;
                if (type === PieceType.Rook) { dirs = [[0,1],[0,-1],[1,0],[-1,0]]; sliding = true; }
                else if (type === PieceType.Bishop) { dirs = [[1,1],[1,-1],[-1,1],[-1,-1]]; sliding = true; }
                else if (type === PieceType.Queen) { dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]; sliding = true; }
                else if (type === PieceType.Knight) { dirs = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]; sliding = false; }
                else if (type === PieceType.King) { dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]; sliding = false; }

                for (let i=0; i<dirs.length; i++) {
                    let nr = r + dirs[i][0], nc = c + dirs[i][1];
                    while (isPlayable(nr, nc)) {
                        const target = board[nr][nc];
                        if (target) {
                            if (target.player !== player) moves.push({fr, fc, tr:nr, tc:nc, cap: true});
                            break; 
                        }
                        if (!capturesOnly) moves.push({fr, fc, tr:nr, tc:nc});
                        if (!sliding) break;
                        nr += dirs[i][0];
                        nc += dirs[i][1];
                    }
                }
            }
        }
    }
    return moves;
};

const makeMove = (board, move) => {
    const prevCell = board[move.tr][move.tc];
    const piece = board[move.fr][move.fc];
    const undo = { move, captured: prevCell, prevHasMoved: piece.hasMoved, prevType: piece.type };
    piece.hasMoved = true;
    if (move.prom) piece.type = move.prom;
    board[move.tr][move.tc] = piece;
    board[move.fr][move.fc] = null;
    return undo;
};

const unmakeMove = (board, undo) => {
    const { move, captured, prevHasMoved, prevType } = undo;
    const piece = board[move.tr][move.tc];
    piece.hasMoved = prevHasMoved;
    piece.type = prevType;
    board[move.fr][move.fc] = piece;
    board[move.tr][move.tc] = captured;
};

const getKingPos = (board, player) => {
    for (let r=0; r<BOARD_ROWS; r++) for (let c=0; c<BOARD_COLS; c++) {
        const p = board[r][c];
        if (p && p.type === PieceType.King && p.player === player) return {r, c};
    }
    return null;
};

const isCheck = (board, player) => {
    const kPos = getKingPos(board, player);
    if (!kPos) return true; 
    const opponents = ['WHITE', 'BLACK', 'GRAY'].filter(p => p !== player);
    for (const opp of opponents) {
        if (isSquareAttackedByHero(kPos.r, kPos.c, board, opp)) return true;
    }
    return false;
};

// --- EVALUATION ---
const evaluate = (board, hero, activePlayers, pieceCount) => {
    let score = 0;
    let heroMaterial = 0;
    let enemyMaterial = 0;
    const heroPieces = []; 
    const kings = {}; 
    let heroKing = null;
    let heroInCheck = false;

    // Detect game phase
    const isOpening = pieceCount > 25; 

    for (let r=0; r<BOARD_ROWS; r++) {
        for (let c=0; c<BOARD_COLS; c++) {
            const p = board[r][c];
            if (!p) continue;
            
            if (p.type === PieceType.King) {
                kings[p.player] = {r, c};
                if (p.player === hero) heroKing = {r, c};
            }

            const val = PIECE_VALUES[p.type];
            if (p.player === hero) {
                heroPieces.push({r, c, type: p.type, hasMoved: p.hasMoved});
                heroMaterial += val;
            } else if (activePlayers.indexOf(p.player) !== -1) {
                enemyMaterial += val;
                if (p.type === PieceType.Pawn) {
                    const distToProm = pawnPromotionDistMap[p.player][r*BOARD_COLS+c];
                    if (distToProm >= 300) { 
                        score -= (distToProm * 2); 
                    }
                }
            }
        }
    }
    
    const isKillerMode = heroMaterial > (enemyMaterial + 200) && activePlayers.length <= 2;

    score += (heroMaterial * 2.0) - enemyMaterial;

    if (isKillerMode && heroKing) {
        const enemy = activePlayers.find(p => p !== hero);
        if (enemy && kings[enemy]) {
            const ek = kings[enemy];
            const distBetweenKings = getDistance(heroKing.r, heroKing.c, ek.r, ek.c);
            score += (30 - distBetweenKings) * 50; 
        }
    }

    if (heroKing) {
        if (!isKillerMode) {
            score += pstKingSafety[heroKing.r * BOARD_COLS + heroKing.c];
        }
        heroInCheck = isCheck(board, hero);
    }

    for (const p of heroPieces) {
        if (!isKillerMode && p.type !== PieceType.King) {
             score += pstCenter[p.r*BOARD_COLS+p.c];
             if (p.c > 2 && p.c < 17) score += 5;
        }
        
        if (p.type === PieceType.Pawn) {
            score += pawnPromotionDistMap[hero][p.r*BOARD_COLS+p.c];
        }

        if (isOpening && !p.hasMoved) {
            if (p.type === PieceType.Knight || p.type === PieceType.Bishop) {
                score -= 30; 
            }
        }

        if (heroKing && p.type === PieceType.Queen) {
             const distToKing = getDistance(p.r, p.c, heroKing.r, heroKing.c);
             if (heroInCheck) {
                if (distToKing > 5) score -= 300; 
             } else {
                if (!isKillerMode && (p.c < 2 || p.c > 17)) score -= 50;
             }
        }

        if (p.type !== PieceType.Pawn && p.type !== PieceType.King) {
            let isThreatened = false;
            for (const enemy of activePlayers) {
                if (enemy !== hero && isSquareAttackedByHero(p.r, p.c, board, enemy)) {
                    isThreatened = true; 
                    break;
                }
            }
            if (isThreatened) {
                 score -= (PIECE_VALUES[p.type] * 2.0); 
            }
        }
    }

    if (heroInCheck) score -= 300;

    return score;
};

// --- QUIESCENCE SEARCH ---
const quiesce = (board, alpha, beta, player, hero, active, totalPieces) => {
    if (stop) return 0;
    nodes++;
    
    const standPat = evaluate(board, hero, active, totalPieces);
    
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const moves = generateMoves(board, player, true); 

    moves.forEach(m => {
        m.score = 0;
        const victim = board[m.tr][m.tc];
        m.score += (victim ? PIECE_VALUES[victim.type] : 0) * 10;
        const attacker = board[m.fr][m.fc];
        m.score -= (attacker ? PIECE_VALUES[attacker.type] : 0);
        if (m.prom) m.score += 5000; 
    });
    moves.sort((a, b) => b.score - a.score);

    const nextIdx = (active.indexOf(player) + 1) % active.length;
    const nextPlayer = active[nextIdx];
    const isMaximizing = (player === hero);

    for (const m of moves) {
        const victimValue = board[m.tr][m.tc] ? PIECE_VALUES[board[m.tr][m.tc].type] : 0;
        if (!m.prom && isMaximizing && standPat + victimValue + 200 < alpha) continue; 

        const undo = makeMove(board, m);
        if (isCheck(board, player)) { unmakeMove(board, undo); continue; }

        const score = quiesce(board, alpha, beta, nextPlayer, hero, active, totalPieces);

        unmakeMove(board, undo);
        
        if (stop) return 0;

        if (isMaximizing) {
             if (score > alpha) alpha = score;
             if (score >= beta) return beta;
        } else {
             if (score < beta) beta = score;
             if (score <= alpha) return alpha;
        }
    }
    return alpha;
};

// --- SEARCH ---
let nodes = 0;
let stop = false;
let endTime = 0;

const alphabeta = (board, depth, alpha, beta, player, hero, active, history, totalPieces, ply) => {
    if (stop) return 0;
    nodes++;
    
    if ((nodes & 2047) === 0 && Date.now() > endTime) { stop = true; return 0; }

    const boardHash = computeHash(board, player);
    
    if (history.includes(boardHash)) {
        return 0; 
    }

    if (depth <= 0) {
        return quiesce(board, alpha, beta, player, hero, active, totalPieces);
    }

    const moves = generateMoves(board, player, false);
    
    if (moves.length === 0) {
        if (isCheck(board, player)) {
            if (player === hero) return -100000 - depth; 
            else return 100000 + depth;
        }
        if (player === hero) return -5000; 
        return 5000;
    }

    // Move Ordering with Heuristics
    moves.forEach(m => {
        m.score = 0;
        
        // 1. Captures
        if (m.cap) {
            const victim = board[m.tr][m.tc];
            m.score += (victim ? PIECE_VALUES[victim.type] : 0) * 100;
        }
        // 2. Promotions
        if (m.prom) m.score += 50000;
        
        // 3. Killer Heuristic
        const kMoves = killerMoves[ply];
        if (kMoves && ((kMoves[0] && kMoves[0].fr === m.fr && kMoves[0].tr === m.tr) || 
                       (kMoves[1] && kMoves[1].fr === m.fr && kMoves[1].tr === m.tr))) {
             m.score += 9000;
        }

        // 4. History Heuristic
        const histKey = \`\${m.fr},\${m.fc}-\${m.tr},\${m.tc}\`;
        const histScore = historyMoves.get(histKey);
        if (histScore) m.score += Math.min(histScore, 8000);

        // 5. Pawn Push
        const piece = board[m.fr][m.fc];
        if (piece.type === PieceType.Pawn) {
             const dist = pawnPromotionDistMap[player][m.tr*BOARD_COLS+m.tc];
             if (dist > 500) m.score += dist; 
        }
    });
    
    moves.sort((a, b) => b.score - a.score);

    let bestScore = -Infinity;
    let bestMove = null;
    const nextIdx = (active.indexOf(player) + 1) % active.length;
    const nextPlayer = active[nextIdx];
    const isMaximizing = (player === hero);
    
    const newHistory = [...history, boardHash];

    for (const m of moves) {
        const undo = makeMove(board, m);
        if (isCheck(board, player)) { unmakeMove(board, undo); continue; }

        let val;
        if (isMaximizing) {
            val = alphabeta(board, depth - 1, alpha, beta, nextPlayer, hero, active, newHistory, totalPieces, ply + 1);
            if (val > bestScore) {
                bestScore = val;
                bestMove = m;
            }
            alpha = Math.max(alpha, val);
        } else {
            val = alphabeta(board, depth - 1, alpha, beta, nextPlayer, hero, active, newHistory, totalPieces, ply + 1);
            if (val < beta) beta = val; 
            if (bestScore === -Infinity || val < bestScore) {
                bestScore = val;
                bestMove = m;
            }
        }
        
        unmakeMove(board, undo);
        if (stop) return 0;
        if (beta <= alpha) {
            // Update Killer Moves (if not capture)
            if (!m.cap && !m.prom) {
                const k = killerMoves[ply];
                if (k[0] === null || (k[0].fr !== m.fr || k[0].tr !== m.tr)) {
                    k[1] = k[0];
                    k[0] = { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
                }
            }
            break;
        }
    }
    
    // Update History Heuristic for the best move
    if (bestMove && !bestMove.cap && !bestMove.prom) {
        const key = \`\${bestMove.fr},\${bestMove.fc}-\${bestMove.tr},\${bestMove.tc}\`;
        const oldScore = historyMoves.get(key) || 0;
        historyMoves.set(key, oldScore + (depth * depth));
    }

    if (bestScore === -Infinity) {
         if (isCheck(board, player)) {
             if (player === hero) return -100000 - depth;
             else return 100000 + depth;
         }
         if (player === hero) return -5000;
         return 5000;
    }

    return bestScore;
};

self.onmessage = (e) => {
    try {
        const { board: rawBoard, aiPlayer, activePlayers, depth: initialDepth, positionHistory } = e.data; 
        
        const board = new Array(BOARD_ROWS);
        let heroCount = 0;
        let enemyCount = 0;
        let totalPieces = 0;
        
        for(let r=0; r<BOARD_ROWS; r++) {
            board[r] = new Array(BOARD_COLS);
            for(let c=0; c<BOARD_COLS; c++) {
                const cell = rawBoard[r][c];
                if (cell && cell.piece) {
                    board[r][c] = { type: cell.piece.type, player: cell.piece.player, hasMoved: cell.piece.hasMoved };
                    if (cell.piece.player === aiPlayer) heroCount += PIECE_VALUES[cell.piece.type];
                    else enemyCount += PIECE_VALUES[cell.piece.type];
                    totalPieces++;
                } else {
                    board[r][c] = null;
                }
            }
        }
        
        if (!getKingPos(board, aiPlayer)) { 
            console.error("AI: King not found!");
            self.postMessage(null); return; 
        }

        const isDeepEndgame = (activePlayers.length === 2 && heroCount > enemyCount + 400); 
        CURRENT_TIME_LIMIT = isDeepEndgame ? 4500 : 1500;

        nodes = 0;
        stop = false;
        endTime = Date.now() + CURRENT_TIME_LIMIT;
        
        // Reset Heuristics for new turn
        historyMoves.clear();
        for(let i=0; i<MAX_PLY; i++) { killerMoves[i][0] = null; killerMoves[i][1] = null; }

        let moves = generateMoves(board, aiPlayer, false);
        const validMoves = [];
        
        for(const m of moves) {
            const undo = makeMove(board, m);
            if (!isCheck(board, aiPlayer)) {
                const nextP = activePlayers[(activePlayers.indexOf(aiPlayer) + 1) % activePlayers.length];
                const strRep = boardToString(board) + '#' + (nextP || '');
                if (!positionHistory.includes(strRep)) {
                     validMoves.push(m);
                }
            }
            unmakeMove(board, undo);
        }
        
        if (validMoves.length === 0) { 
            console.warn("AI: No valid moves found via generateMoves (Checkmate/Stalemate)");
            self.postMessage(null); 
            return; 
        }

        const enemy = activePlayers.find(p => p !== aiPlayer);
        const enemyKingPos = enemy ? getKingPos(board, enemy) : null;

        validMoves.sort((a, b) => {
            const pA = board[a.tr][a.tc], pB = board[b.tr][b.tc];
            let valA = (pA ? PIECE_VALUES[pA.type] : 0) + (a.prom ? 50000 : 0);
            let valB = (pB ? PIECE_VALUES[pB.type] : 0) + (b.prom ? 50000 : 0);
            if (isDeepEndgame && enemyKingPos) {
                 valA += (20 - getDistance(a.tr, a.tc, enemyKingPos.r, enemyKingPos.c)) * 10;
                 valB += (20 - getDistance(b.tr, b.tc, enemyKingPos.r, enemyKingPos.c)) * 10;
            }
            return valB - valA;
        });

        let bestMove = validMoves[0];

        for (let d = 1; d <= 25; d++) {
            let alpha = -Infinity;
            let beta = Infinity;
            let levelBestMove = null;
            let levelBestScore = -Infinity;

            for (const m of validMoves) {
                const undo = makeMove(board, m);
                const nextPlayer = activePlayers[(activePlayers.indexOf(aiPlayer) + 1) % activePlayers.length];
                
                const score = alphabeta(board, d - 1, alpha, beta, nextPlayer, aiPlayer, activePlayers, [], totalPieces, 1);

                unmakeMove(board, undo);
                
                if (stop) break;

                if (score > levelBestScore) {
                    levelBestScore = score;
                    levelBestMove = m;
                }
                alpha = Math.max(alpha, levelBestScore);
            }
            
            if (stop) break;
            
            if (levelBestMove) {
                bestMove = levelBestMove;
                if (levelBestScore > 90000) break; 
            }
        }

        if (bestMove) {
            const promotion = bestMove.prom || (isPromotionZone(aiPlayer, bestMove.tr, bestMove.tc) && board[bestMove.fr][bestMove.fc].type === PieceType.Pawn ? PieceType.Queen : undefined);
            self.postMessage({
                from: { row: bestMove.fr, col: bestMove.fc },
                to: { row: bestMove.tr, col: bestMove.tc },
                promotion: promotion
            });
        } else {
            console.error("AI: Search returned no best move.");
            self.postMessage(null);
        }
    } catch (err) {
        console.error("AI Worker Critical Error:", err);
        self.postMessage(null);
    }
};
`;

export const findBestMove = (
  board: (BoardCell | null)[][], 
  aiPlayer: Player, 
  activePlayers: Player[], 
  depth: number, 
  positionHistory: string[]
): { worker: Worker; url: string } => {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  worker.postMessage({
    board,
    aiPlayer,
    activePlayers,
    depth,
    positionHistory
  });

  return { worker, url };
};

export const getAiSetup = (
  board: (BoardCell | null)[][],
  player: Player,
  piecesToPlace: PieceType[]
): (BoardCell | null)[][] => {
  const newBoard = JSON.parse(JSON.stringify(board));
  const zones = SETUP_ZONES[player];
  
  const availableSlots = zones.filter(coords => {
    const cell = newBoard[coords.row][coords.col];
    return cell && !cell.piece;
  });

  for (let i = availableSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
  }

  piecesToPlace.forEach((pieceType, index) => {
    if (index < availableSlots.length) {
      const { row, col } = availableSlots[index];
      (newBoard[row][col] as BoardCell).piece = {
        player,
        type: pieceType,
        hasMoved: false
      };
    }
  });

  return newBoard;
};