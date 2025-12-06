
import React from 'react';
import { Player } from '../types';
import { PLAYER_COLORS } from '../constants';

interface GameInfoPanelProps {
  currentPlayer: Player;
  statusMessage: string;
  playerNames: { [key in Player]?: string };
  isAiGame?: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

const GameInfoPanel: React.FC<GameInfoPanelProps> = ({ 
  currentPlayer, 
  statusMessage, 
  playerNames,
  isAiGame,
  isPaused,
  onTogglePause 
}) => {
  const playerInfo = PLAYER_COLORS[currentPlayer];
  const nickname = playerNames[currentPlayer];

  return (
    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl text-center relative">
      <h2 className="text-xl font-bold mb-2">Current Turn</h2>
      
      {onTogglePause && (
        <button
          onClick={onTogglePause}
          className={`absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${
            isPaused 
              ? 'bg-green-600 hover:bg-green-500 text-white' 
              : 'bg-yellow-600 hover:bg-yellow-500 text-white'
          }`}
          title={isPaused ? "Resume Game" : "Pause Game"}
        >
          {isPaused ? '▶' : '||'}
        </button>
      )}

      <div className="flex items-center justify-center space-x-2">
        <span className={`w-4 h-4 rounded-full ${playerInfo.bg}`}></span>
        <span className={`text-2xl font-semibold ${playerInfo.text}`}>
          {playerInfo.name} {nickname ? <span className="text-lg font-normal opacity-90">({nickname})</span> : ''}
        </span>
      </div>
      <p className="mt-4 text-gray-400 h-10">{statusMessage}</p>
    </div>
  );
};

export default GameInfoPanel;
