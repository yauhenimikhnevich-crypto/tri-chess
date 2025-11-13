
import React from 'react';
import { PieceType, Player } from '../types';
import { PLAYER_COLORS } from '../constants';
import PieceComponent from './Piece';

interface SandboxPaletteProps {
  selectedPiece: { player: Player; type: PieceType } | 'ERASER' | null;
  onSelect: (selection: { player: Player; type: PieceType } | 'ERASER' | null) => void;
  availablePieces: { [key in Player]: { [key in PieceType]?: number } };
}

const SandboxPalette: React.FC<SandboxPaletteProps> = ({ selectedPiece, onSelect, availablePieces }) => {
  const players = [Player.White, Player.Black, Player.Gray];

  const isSelected = (player: Player, type: PieceType) => {
    return typeof selectedPiece === 'object' && selectedPiece?.player === player && selectedPiece?.type === type;
  };

  return (
    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl text-center flex flex-col gap-4">
      <h2 className="text-xl font-bold mb-2">Sandbox Palette</h2>
      <p className="text-sm text-gray-400 -mt-4 mb-2">Select a piece, then click on the board to place it.</p>
      
      {players.map(player => (
        <div key={player}>
          <h3 className={`text-lg font-semibold ${PLAYER_COLORS[player].text}`}>{PLAYER_COLORS[player].name}</h3>
          <div className="grid grid-cols-6 gap-1 mt-1">
            {(Object.keys(availablePieces[player]) as PieceType[]).map(type => {
              const count = availablePieces[player][type] ?? 0;
              const pieceIsAvailable = count > 0;
              
              return (
                <button
                  key={`${player}-${type}`}
                  onClick={() => pieceIsAvailable && onSelect({ player, type })}
                  disabled={!pieceIsAvailable}
                  className={`relative flex items-center justify-center aspect-square rounded-md transition-all duration-150 ${
                    isSelected(player, type) 
                      ? 'bg-yellow-500/50 ring-2 ring-yellow-400' 
                      : pieceIsAvailable 
                        ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                        : 'bg-gray-800/50 opacity-50 cursor-not-allowed'
                  }`}
                  title={pieceIsAvailable ? `Place ${player} ${type}` : `${type} not available`}
                >
                  <PieceComponent piece={{ player, type }} />
                  {pieceIsAvailable && (
                    <span className="absolute bottom-0 right-1 text-xs font-bold text-white" style={{ textShadow: '1px 1px 1px black' }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <h3 className="text-lg font-semibold text-red-400">Tools</h3>
        <button
          onClick={() => onSelect('ERASER')}
          className={`w-full flex items-center justify-center p-2 mt-1 rounded-md transition-all duration-150 ${selectedPiece === 'ERASER' ? 'bg-red-500/50 ring-2 ring-red-400' : 'bg-gray-700 hover:bg-gray-600'}`}
          title="Erase Piece"
        >
          <span className="text-2xl" role="img" aria-label="eraser">❌</span>
          <span className="ml-2 font-bold">Eraser</span>
        </button>
      </div>
    </div>
  );
};

export default SandboxPalette;
