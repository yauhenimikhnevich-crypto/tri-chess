

import React from 'react';
import { PlayerType } from '../types';

interface MainMenuProps {
  onLocalGameSetup: () => void;
  onOnlineGame: () => void;
  onSandbox: () => void;
  onShowRules: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onLocalGameSetup, onOnlineGame, onSandbox, onShowRules }) => {

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans text-center">
      <h1 className="text-4xl sm:text-5xl font-bold mb-2">Tri-Chess</h1>
      <p className="text-gray-400 mb-8">Welcome! Choose your game mode.</p>

      <div className="flex flex-col gap-4 w-full max-w-md mt-8">
        <button 
          onClick={onLocalGameSetup}
          className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Local Game (vs AI/Human)
        </button>
         <button 
          onClick={onOnlineGame}
          className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Play Online
        </button>
        <button 
          onClick={onSandbox}
          className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Free Placement (Sandbox)
        </button>
         <button 
          onClick={onShowRules}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Rules
        </button>
      </div>
    </div>
  );
};

export default MainMenu;