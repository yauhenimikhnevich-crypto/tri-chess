
import React from 'react';
import { BoardCell, Coordinates } from '../types';
import PieceComponent from './Piece';
import { PROMOTION_ZONE_PLAYER_MAP, PLAYER_COLORS } from '../constants';

interface CellProps {
  cell: BoardCell | null;
  coords: Coordinates;
  isSelected: boolean;
  isValidMove: boolean;
  isSetupPhase: boolean;
  onClick: (coords: Coordinates) => void;
  onDrop: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
}

const Cell: React.FC<CellProps> = ({ cell, coords, isSelected, isValidMove, isSetupPhase, onClick, onDrop, onDragOver }) => {
  if (!cell) {
    return <div className="w-5 h-5 sm:w-7 sm:h-7 md:w-9 md:h-9 lg:w-12 lg:h-12"></div>;
  }

  const isEven = (coords.row + coords.col) % 2 === 0;
  
  let bgColor = '';
  let extraClasses = 'cursor-pointer';

  if (!cell.isPlayable) {
    bgColor = 'bg-black';
    extraClasses = 'cursor-not-allowed';
  } else {
    bgColor = isEven ? 'bg-gray-700' : 'bg-gray-800';
  }

  let overlay = '';
  if (isSelected) {
    overlay = 'bg-yellow-500/50';
  } else if (isValidMove) {
    overlay = isSetupPhase ? 'bg-yellow-500/50' : 'bg-green-500/50';
  }

  const promotionPlayer = PROMOTION_ZONE_PLAYER_MAP.get(`${coords.row}-${coords.col}`);

  return (
    <div
      className={`relative group w-5 h-5 sm:w-7 sm:h-7 md:w-9 md:h-9 lg:w-12 lg:h-12 flex items-center justify-center transition-colors duration-200 ${bgColor} ${extraClasses}`}
      onClick={() => cell.isPlayable && onClick(coords)}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {cell.piece && <PieceComponent piece={cell.piece} />}
      
      {promotionPlayer && !cell.piece && (
        <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${PLAYER_COLORS[promotionPlayer].bg} opacity-50`}></div>
      )}

      {overlay && <div className={`absolute inset-0 ${overlay} rounded-full animate-pulse`}></div>}
      <div className="absolute inset-0 group-hover:bg-white/10 transition-colors duration-200"></div>
    </div>
  );
};

export default Cell;