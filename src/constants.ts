import { PieceType, Player, Coordinates, BoardCell, Piece } from './types';

// IMPORTANT: Firebase Configuration
// 1. Go to https://console.firebase.google.com/ and create a new project.
// 2. In your project, go to Project Settings (gear icon) -> General tab.
// 3. Scroll down to "Your apps" and click the web icon (</>) to create a new web app.
// 4. Firebase will give you a `firebaseConfig` object. Copy its contents and paste them here.
// 5. In the Firebase console, go to "Build" -> "Authentication" -> "Sign-in method" and enable "Anonymous".
// 6. Go to "Build" -> "Firestore Database" -> Create database. Start in test mode for now.
// 7. Go to "Build" -> "Realtime Database" -> Create database. Start in test mode.
export const firebaseConfig = {
  apiKey: "AIzaSyAXxmxxqygOOZ9isnLp_17jPiy10zeMar0",
    authDomain: "tri-chess.firebaseapp.com",
    databaseURL: "https://tri-chess-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "tri-chess",
    storageBucket: "tri-chess.firebasestorage.app",
    messagingSenderId: "867051896616",
    appId: "1:867051896616:web:3fe3cef0d41abb651c5a1d",
    measurementId: "G-VPS7E2E0G4"
};

// Function to check if the Firebase config has been filled out.
export const isFirebaseConfigValid = (config: object): boolean => {
    return Object.values(config).every(value => !value.startsWith("YOUR_"));
};


export const BOARD_ROWS = 10;
export const BOARD_COLS = 20;

export const FORTRESS_COORDS: Coordinates[] = [
  { row: 5, col: 9 }, { row: 5, col: 10 },
  { row: 6, col: 8 }, { row: 6, col: 9 }, { row: 6, col: 10 }, { row: 6, col: 11 },
  { row: 7, col: 8 }, { row: 7, col: 9 }, { row: 7, col: 10 }, { row: 7, col: 11 },
  { row: 8, col: 9 }, { row: 8, col: 10 }
];

export const PIECES_TO_SETUP: PieceType[] = [
  PieceType.King, PieceType.Queen, PieceType.Rook, PieceType.Rook, PieceType.Knight, PieceType.Bishop
];

// FIX: Export SETUP_ORDER so it can be imported and used as a single source of truth.
export const SETUP_ORDER: Player[] = [Player.White, Player.Black, Player.Gray];

export const ALL_PIECE_TYPES: PieceType[] = [
  PieceType.King, PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight, PieceType.Pawn
];

export const initialSandboxPieces: { [key in Player]: { [key in PieceType]: number } } = {
  [Player.White]: {
    [PieceType.King]: 1,
    [PieceType.Queen]: 1,
    [PieceType.Rook]: 2,
    [PieceType.Bishop]: 1,
    [PieceType.Knight]: 1,
    [PieceType.Pawn]: 4,
  },
  [Player.Black]: {
    [PieceType.King]: 1,
    [PieceType.Queen]: 1,
    [PieceType.Rook]: 2,
    [PieceType.Bishop]: 1,
    [PieceType.Knight]: 1,
    [PieceType.Pawn]: 4,
  },
  [Player.Gray]: {
    [PieceType.King]: 1,
    [PieceType.Queen]: 1,
    [PieceType.Rook]: 2,
    [PieceType.Bishop]: 1,
    [PieceType.Knight]: 1,
    [PieceType.Pawn]: 6,
  },
};


export const SETUP_ZONES: { [key in Player]: Coordinates[] } = {
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

export const PROMOTION_ZONES: { [key in Player]: Coordinates[] } = {
  [Player.White]: [{ row: 5, col: 11 }, { row: 8, col: 11 }],
  [Player.Black]: [{ row: 8, col: 8 }, { row: 5, col: 8 }],
  [Player.Gray]: [{ row: 9, col: 9 }, { row: 9, col: 10 }],
};

export const PIECE_UNICODE: { [key in Player]: { [key in PieceType]: string } } = {
  [Player.Black]: {
    [PieceType.King]: '♔',
    [PieceType.Queen]: '♕',
    [PieceType.Rook]: '♖',
    [PieceType.Bishop]: '♗',
    [PieceType.Knight]: '♘',
    [PieceType.Pawn]: '♙',
  },
  [Player.White]: {
    [PieceType.King]: '♔',
    [PieceType.Queen]: '♕',
    [PieceType.Rook]: '♖',
    [PieceType.Bishop]: '♗',
    [PieceType.Knight]: '♘',
    [PieceType.Pawn]: '♙',
  },
  [Player.Gray]: {
    [PieceType.King]: '♔',
    [PieceType.Queen]: '♕',
    [PieceType.Rook]: '♖',
    [PieceType.Bishop]: '♗',
    [PieceType.Knight]: '♘',
    [PieceType.Pawn]: '♙',
  },
};

export const PLAYER_COLORS: { [key: string]: { text: string; bg: string; name: string; shadow: string; } } = {
  "GRAY": { text: 'text-gray-400', bg: 'bg-gray-600', name: 'Gray', shadow: '0 1px 2px rgba(0,0,0,0.7)' },
  "WHITE": { text: 'text-white', bg: 'bg-gray-200', name: 'White', shadow: '0 1px 2px rgba(0,0,0,0.7)' },
  "BLACK": { text: 'text-black', bg: 'bg-black', name: 'Black', shadow: '0 0 4px rgba(255, 255, 255, 0.6)' },
};

export const generateInitialBoard = (): (BoardCell | null)[][] => {
  const newBoard: (BoardCell | null)[][] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: (BoardCell | null)[] = [];
    const cellsInRow = 2 * (r + 1);
    const padding = (BOARD_COLS - cellsInRow) / 2;
    for (let c = 0; c < BOARD_COLS; c++) {
      if (c >= padding && c < BOARD_COLS - padding) {
        row.push({ piece: null, isPlayable: true });
      } else {
        row.push(null);
      }
    }
    newBoard.push(row);
  }

  FORTRESS_COORDS.forEach(({ row, col }) => {
    if (newBoard[row] && newBoard[row][col]) {
      const cell = newBoard[row][col];
      if (cell) {
        cell.isPlayable = false;
      }
    }
  });

  // Gray Pawns (6 total)
  (newBoard[2][8] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false };
  (newBoard[2][9] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false };
  (newBoard[2][10] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false };
  (newBoard[2][11] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false };
  (newBoard[2][7] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false }; // Extra
  (newBoard[2][12] as BoardCell).piece = { player: Player.Gray, type: PieceType.Pawn, hasMoved: false };// Extra


  // White Pawns
  (newBoard[6][3] as BoardCell).piece = { player: Player.White, type: PieceType.Pawn, hasMoved: false };
  (newBoard[7][3] as BoardCell).piece = { player: Player.White, type: PieceType.Pawn, hasMoved: false };
  (newBoard[8][3] as BoardCell).piece = { player: Player.White, type: PieceType.Pawn, hasMoved: false };
  (newBoard[9][3] as BoardCell).piece = { player: Player.White, type: PieceType.Pawn, hasMoved: false };

  // Black Pawns
  (newBoard[6][16] as BoardCell).piece = { player: Player.Black, type: PieceType.Pawn, hasMoved: false };
  (newBoard[7][16] as BoardCell).piece = { player: Player.Black, type: PieceType.Pawn, hasMoved: false };
  (newBoard[8][16] as BoardCell).piece = { player: Player.Black, type: PieceType.Pawn, hasMoved: false };
  (newBoard[9][16] as BoardCell).piece = { player: Player.Black, type: PieceType.Pawn, hasMoved: false };

  return newBoard;
};

export const generateEmptyBoard = (): (BoardCell | null)[][] => {
  const newBoard: (BoardCell | null)[][] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: (BoardCell | null)[] = [];
    const cellsInRow = 2 * (r + 1);
    const padding = (BOARD_COLS - cellsInRow) / 2;
    for (let c = 0; c < BOARD_COLS; c++) {
      if (c >= padding && c < BOARD_COLS - padding) {
        row.push({ piece: null, isPlayable: true });
      } else {
        row.push(null);
      }
    }
    newBoard.push(row);
  }

  FORTRESS_COORDS.forEach(({ row, col }) => {
    if (newBoard[row] && newBoard[row][col]) {
      const cell = newBoard[row][col];
      if (cell) {
        cell.isPlayable = false;
      }
    }
  });
  return newBoard;
};


export const PIECE_SCORES: { [key in PieceType]: number } = {
  [PieceType.Pawn]: 1,
  [PieceType.Rook]: 5,
  [PieceType.Knight]: 3,
  [PieceType.Bishop]: 3,
  [PieceType.Queen]: 9,
  [PieceType.King]: 0, // Should not be captured
};
