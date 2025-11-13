export enum Player {
  Gray = 'GRAY',
  White = 'WHITE',
  Black = 'BLACK',
}

export enum PieceType {
  Pawn = 'PAWN',
  Rook = 'ROOK',
  Knight = 'KNIGHT',
  Bishop = 'BISHOP',
  Queen = 'QUEEN',
  King = 'KING',
}

export enum PlayerType {
  Human = 'HUMAN',
  AIEasy = 'AI_EASY',
  AIMedium = 'AI_MEDIUM',
}

export interface Piece {
  player: Player;
  type: PieceType;
  hasMoved?: boolean;
  justSwitchedDiagonal?: boolean;
}

export interface Coordinates {
  row: number;
  col: number;
}

export interface BoardCell {
  piece: Piece | null;
  isPlayable: boolean;
}

// --- New types for Firebase Online Functionality ---

export type AppState = 'GETTING_USERNAME' | 'MAIN_MENU' | 'LOCAL_SETUP' | 'ONLINE_LOBBY' | 'IN_GAME' | 'SANDBOX_SETUP';

export interface OnlineUser {
  id: string; // Firebase Auth UID
  name: string;
  isOnline: boolean;
}

export interface Invite {
  id: string; // Firestore document ID
  from: { id: string; name: string; };
  to: { id: string; name: string; };
  status: 'pending' | 'accepted' | 'declined';
  timestamp?: any; // For client-side sorting
  gameId?: string; // ID of the game created when accepted
}

export interface GameProposal {
  id: string;
  players: { [key: string]: { id: string; name: string } }; // key is user id
  status: { [key: string]: 'pending' | 'accepted' }; // key is user id
  timestamp?: any;
  gameId?: string;
}

export interface OnlineGame {
  id: string; // Firestore document ID
  players: { [key in Player]?: { id: string, name: string } };
  playerTypes: { [key in Player]: PlayerType | 'ONLINE_HUMAN' };
  boardState: (BoardCell | null)[][];
  currentPlayer: Player;
  eliminatedPlayers: Player[];
  scores: { [key in Player]: number };
  capturedPieces: { [key in Player]: Piece[] };
  duelingState: { attacker: Player; defender: Player } | null;
  statusMessage: string;
  gamePhase: 'SETUP' | 'PLAY' | 'PROMOTION' | 'GAME_OVER';
  setupCompleted: { [key in Player]?: boolean; };
  winner: Player | null;
  leftPlayers: Player[];
  playerIds: string[];
  timestamp: any;
}