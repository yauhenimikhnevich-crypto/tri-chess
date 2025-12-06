
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

export interface Turn {
  turn: number;
  white?: string;
  black?: string;
  gray?: string;
}

export interface HistoryEntry {
  boardState: (BoardCell | null)[][];
  scores: { [key in Player]: number };
  capturedPieces: { [key in Player]: Piece[] };
  eliminatedPlayers: Player[];
  leftPlayers: Player[];
  currentPlayer: Player;
  statusMessage: string;
  duelingState: { attacker: Player; defender: Player } | null;
}

export type AppState = 'GETTING_USERNAME' | 'MAIN_MENU' | 'LOCAL_SETUP' | 'ONLINE_LOBBY' | 'IN_GAME' | 'SANDBOX_SETUP' | 'RULES';

export interface OnlineUser {
  id: string; 
  name: string;
  isOnline: boolean;
  rating: number;
}

export interface Invite {
  id: string; 
  from: { id: string; name: string; };
  to: { id: string; name: string; };
  status: 'pending' | 'accepted' | 'declined';
  mode?: 'VS_AI' | 'STANDARD'; 
  timestamp?: any; 
  gameId?: string; 
  proposalId?: string; 
}

export interface GameProposal {
  id: string;
  hostId: string;
  players: { [key in Player]?: { id: string; name: string; rating?: number } }; 
  invitedUserIds: string[];
  status: 'pending' | 'completed' | 'negotiating_ai'; 
  timestamp?: any;
  createdAt?: any; 
  gameId?: string; 
  aiVotes?: { [userId: string]: boolean }; 
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: any;
}

export interface OnlineGame {
  id: string; 
  players: { [key in Player]?: { id: string, name: string, rating: number } }; 
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
  finalRatings?: { [userId: string]: number }; 
  isGamePaused?: boolean;
  moveHistory: Turn[];
  isRanked?: boolean;
  chatMessages: ChatMessage[];
}
