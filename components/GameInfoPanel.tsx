
import React from 'react';
import { Player } from '../types';
import { PLAYER_COLORS } from '../constants';

interface GameInfoPanelProps {
  currentPlayer: Player;
  statusMessage: string;
}

const GameInfoPanel: React.FC<GameInfoPanelProps> = ({ currentPlayer, statusMessage }) => {
  const playerInfo = PLAYER_COLORS[currentPlayer];
  return (
    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl text-center">
      <h2 className="text-xl font-bold mb-2">Current Turn</h2>
      <div className="flex items-center justify-center space-x-2">
        <span className={`w-4 h-4 rounded-full ${playerInfo.bg}`}></span>
        <span className={`text-2xl font-semibold ${playerInfo.text}`}>{playerInfo.name}</span>
      </div>
      <p className="mt-4 text-gray-400 h-10">{statusMessage}</p>
    </div>
  );
};

export default GameInfoPanel;