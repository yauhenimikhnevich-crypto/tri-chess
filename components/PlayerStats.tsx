import React from 'react';
import { Player, Piece } from '../types';
import { PLAYER_COLORS, PIECE_UNICODE } from '../constants';

interface PlayerStatsProps {
  scores: { [key in Player]: number };
  capturedPieces: { [key in Player]: Piece[] };
  eliminatedPlayers: Player[];
  leftPlayers: Player[];
  currentPlayer: Player;
  myColor: Player | null; // To identify which player is "you"
}

const PlayerStats: React.FC<PlayerStatsProps> = ({ scores, capturedPieces, eliminatedPlayers, leftPlayers, currentPlayer, myColor }) => {
  const players: Player[] = [Player.White, Player.Black, Player.Gray];

  return (
    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl text-center flex flex-col gap-4">
      <h2 className="text-xl font-bold mb-2">Game Stats</h2>
      {players.map(player => {
        const playerInfo = PLAYER_COLORS[player];
        const capturesByPlayer = capturedPieces[player] || [];
        const isEliminated = eliminatedPlayers.includes(player);
        const hasLeft = leftPlayers.includes(player);
        const isInactive = isEliminated || hasLeft;
        const isCurrentTurn = currentPlayer === player && !isInactive;
        const isYou = player === myColor;

        let statusText = '';
        if (isEliminated) statusText = '(Eliminated)';
        else if (hasLeft) statusText = '(Left)';


        return (
          <div 
            key={player} 
            className={`p-3 bg-gray-900/50 rounded-md transition-all duration-300 ${isInactive ? 'opacity-40' : 'opacity-100'} ${isCurrentTurn ? 'ring-2 ring-yellow-400 shadow-lg' : ''} ${isYou ? 'border-2 border-blue-400' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full ${playerInfo.bg}`}></span>
                <span className={`font-semibold ${playerInfo.text}`}>{playerInfo.name} {isYou && '(You)'} {statusText}</span>
              </div>
              <span className="font-bold text-lg">{scores[player]} pts</span>
            </div>
            <div className="min-h-[30px] flex flex-wrap items-center gap-1 bg-gray-800/60 p-1 rounded">
              {capturesByPlayer.length > 0 ? (
                capturesByPlayer.map((piece, index) => {
                    const capturedPlayerInfo = PLAYER_COLORS[piece.player];
                    return (
                        <span key={index} className={`${capturedPlayerInfo.text} text-xl`} title={`${piece.player} ${piece.type}`}>
                          {PIECE_UNICODE[piece.player][piece.type]}
                        </span>
                    );
                })
              ) : (
                <span className="text-xs text-gray-500 italic px-1">No captures</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerStats;