
import React from 'react';
import { BoardCell, Coordinates } from '../types';
import CellComponent from './Cell';

interface BoardProps {
  boardState: (BoardCell | null)[][];
  selectedPiece: Coordinates | null;
  validMoves: Coordinates[];
  gamePhase: string;
  onCellClick: (coords: Coordinates) => void;
  onCellDrop: (coords: Coordinates) => void;
  onCellDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  customCellSize?: string;
}

const Board: React.FC<BoardProps> = ({ boardState, selectedPiece, validMoves, onCellClick, onCellDrop, onCellDragOver, gamePhase, customCellSize }) => {
  return (
    <div className="flex flex-col items-center p-4 rounded-lg">
      {boardState.map((row, r) => (
        <div key={r} className="flex">
          {row.map((cell, c) => {
            const coords = { row: r, col: c };
            return (
              <CellComponent
                key={`${r}-${c}`}
                cell={cell}
                coords={coords}
                isSelected={selectedPiece?.row === r && selectedPiece?.col === c}
                isValidMove={validMoves.some(move => move.row === r && move.col === c)}
                isSetupPhase={gamePhase.startsWith('SETUP_')}
                onClick={onCellClick}
                onDrop={() => onCellDrop(coords)}
                onDragOver={onCellDragOver}
                customSize={customCellSize}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default Board;
