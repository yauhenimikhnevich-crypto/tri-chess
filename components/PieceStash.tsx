
import React from 'react';
import { PieceType, Player } from '../types';
import { PLAYER_COLORS } from '../constants';
import PieceComponent from './Piece';

interface PieceStashProps {
  playerToSetup: Player;
  piecesToPlace: PieceType[];
  onPieceDragStart: (pieceType: PieceType) => void;
  onPieceDragEnd: () => void;
  onRandomPlacement: () => void;
}

const PieceStash: React.FC<PieceStashProps> = ({ playerToSetup, piecesToPlace, onPieceDragStart, onPieceDragEnd, onRandomPlacement }) => {
  if (piecesToPlace.length === 0) return null;

  const playerInfo = PLAYER_COLORS[playerToSetup];

  return (
    <>
      <h2 className={`text-lg font-semibold mb-3 ${playerInfo.text}`}>Place your pieces:</h2>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {piecesToPlace.map((pieceType, index) => (
          <div
            key={`${pieceType}-${index}`}
            draggable
            onDragStart={() => onPieceDragStart(pieceType)}
            onDragEnd={onPieceDragEnd}
            className="relative flex items-center justify-center aspect-square rounded-lg bg-gray-700 hover:bg-gray-600 cursor-grab active:cursor-grabbing transition-all duration-200 transform hover:scale-105"
            title={`Drag to place ${pieceType.toLowerCase()}`}
          >
            <PieceComponent piece={{ player: playerToSetup, type: pieceType }} />
          </div>
        ))}
      </div>
      <button
        onClick={onRandomPlacement}
        className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-lg shadow-lg transition-transform hover:scale-105"
      >
        Random Placement
      </button>
    </>
  );
};

export default PieceStash;
