
import React from 'react';
import { Piece as PieceProps } from '../types';
import { PIECE_UNICODE, PLAYER_COLORS } from '../constants';

const PieceComponent: React.FC<{ piece: PieceProps }> = ({ piece }) => {
  const unicode = PIECE_UNICODE[piece.player][piece.type];
  const playerInfo = PLAYER_COLORS[piece.player];

  return (
    <span
      className={`text-xl sm:text-2xl md:text-3xl lg:text-5xl transition-transform duration-200 group-hover:scale-110 ${playerInfo.text}`}
      style={{ textShadow: playerInfo.shadow }}
    >
      {unicode}
    </span>
  );
};

export default PieceComponent;