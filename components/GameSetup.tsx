
import React, { useState } from 'react';
import { Player, PlayerType } from '../types';
import { PLAYER_COLORS } from '../constants';

interface GameSetupProps {
  onStart: (config: { types: { [key in Player]: PlayerType }}) => void;
  onBack: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStart, onBack }) => {
  const [playerTypes, setPlayerTypes] = useState<{ [key in Player]: PlayerType }>({
    [Player.White]: PlayerType.Human,
    [Player.Black]: PlayerType.AIEasy,
    [Player.Gray]: PlayerType.AIEasy,
  });

  const handleTypeChange = (player: Player, type: PlayerType) => {
    setPlayerTypes(prev => ({ ...prev, [player]: type }));
  };

  const options: { label: string; value: PlayerType }[] = [
    { label: 'Human', value: PlayerType.Human },
    { label: 'AI (Easy)', value: PlayerType.AIEasy },
    { label: 'AI (Medium)', value: PlayerType.AIMedium },
  ];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans text-center">
      <h1 className="text-4xl sm:text-5xl font-bold mb-2">Local Game Setup</h1>
      <p className="text-gray-400 mb-8">Configure players for this computer.</p>

      <div className="w-full max-w-md bg-gray-800/50 p-6 rounded-lg shadow-2xl flex flex-col gap-6">
        <p className="text-sm text-gray-400 -mt-2 mb-2">Rule: White moves first, then turn proceeds clockwise (Black, then Gray).</p>
        {(Object.keys(playerTypes) as Player[]).map(player => (
          <div key={player} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-5 h-5 rounded-full ${PLAYER_COLORS[player].bg}`}></span>
              <span className={`font-bold text-lg ${PLAYER_COLORS[player].text}`}>{PLAYER_COLORS[player].name}</span>
            </div>
            <div className="flex items-center gap-1 bg-gray-700 p-1 rounded-md">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleTypeChange(player, opt.value)}
                  className={`px-3 py-1 text-sm font-semibold rounded transition-colors duration-200 ${
                    playerTypes[player] === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-transparent text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 w-full max-w-md mt-8">
        <button 
          onClick={() => onStart({ types: playerTypes })}
          className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Start Local Game
        </button>
        <button 
          onClick={onBack}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-md"
        >
          Back to Main Menu
        </button>
      </div>
    </div>
  );
};

export default GameSetup;