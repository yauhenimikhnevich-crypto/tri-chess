import React, { useEffect, useRef } from 'react';
import { Turn, Player } from '../types';

interface MoveHistoryProps {
  turnHistory: Turn[];
  isReviewable: boolean;
  onMoveClick: (moveIndex: number) => void;
}

const MoveHistory: React.FC<MoveHistoryProps> = ({ turnHistory, isReviewable, onMoveClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turnHistory]);

  let moveCounter = 0;

  return (
    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl flex flex-col">
      <h2 className="text-xl font-bold mb-3 text-center">Move History</h2>
      <div ref={scrollRef} className="flex-grow overflow-y-auto max-h-48 bg-gray-900/50 p-2 rounded">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase">
            <tr>
              <th scope="col" className="px-2 py-2 w-1/12">#</th>
              <th scope="col" className="px-2 py-2">White</th>
              <th scope="col" className="px-2 py-2">Black</th>
              <th scope="col" className="px-2 py-2">Gray</th>
            </tr>
          </thead>
          <tbody>
            {turnHistory.map((turn) => {
              const whiteMoveIndex = turn.white ? moveCounter++ : -1;
              const blackMoveIndex = turn.black ? moveCounter++ : -1;
              const grayMoveIndex = turn.gray ? moveCounter++ : -1;
              
              const tdClass = (isClickable: boolean) => 
                `px-2 py-1 ${isClickable && isReviewable ? 'cursor-pointer hover:bg-gray-700 rounded' : ''}`;

              return (
                <tr key={turn.turn} className="border-b border-gray-700">
                  <th scope="row" className="px-2 py-1 font-medium text-gray-300">{turn.turn}</th>
                  <td 
                    className={tdClass(!!turn.white)}
                    onClick={() => isReviewable && whiteMoveIndex !== -1 && onMoveClick(whiteMoveIndex)}
                  >
                    {turn.white || ''}
                  </td>
                  <td 
                    className={tdClass(!!turn.black)}
                    onClick={() => isReviewable && blackMoveIndex !== -1 && onMoveClick(blackMoveIndex)}
                  >
                    {turn.black || ''}
                  </td>
                  <td 
                    className={tdClass(!!turn.gray)}
                    onClick={() => isReviewable && grayMoveIndex !== -1 && onMoveClick(grayMoveIndex)}
                  >
                    {turn.gray || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MoveHistory;