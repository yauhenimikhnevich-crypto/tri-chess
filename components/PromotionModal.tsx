
import React from 'react';
import { PieceType, Player } from '../types';
import { PIECE_UNICODE, PLAYER_COLORS } from '../constants';
import PieceComponent from './Piece';

interface PromotionModalProps {
  player: Player;
  onSelect: (pieceType: PieceType) => void;
}

const PromotionModal: React.FC<PromotionModalProps> = ({ player, onSelect }) => {
  const promotionPieces: PieceType[] = [
    PieceType.Queen,
    PieceType.Rook,
    PieceType.Bishop,
    PieceType.Knight,
  ];
  const playerInfo = PLAYER_COLORS[player];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border border-gray-700">
        <h2 className={`text-2xl font-bold mb-4 text-center ${playerInfo.text}`}>
          Promote Pawn
        </h2>
        <div className="flex justify-center gap-4">
          {promotionPieces.map((pieceType) => (
            <button
              key={pieceType}
              onClick={() => onSelect(pieceType)}
              className="p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-transform duration-200 transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              title={`Promote to ${pieceType}`}
            >
              <PieceComponent piece={{ player, type: pieceType }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromotionModal;
