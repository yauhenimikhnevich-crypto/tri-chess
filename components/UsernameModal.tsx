
import React, { useState } from 'react';

interface UsernameModalProps {
  onSetUsername: (name: string) => void;
}

const UsernameModal: React.FC<UsernameModalProps> = ({ onSetUsername }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim().length >= 3) {
      onSetUsername(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Welcome to Tri-Chess</h1>
        <p className="text-gray-400 mb-6">Please enter your nickname to play online.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 text-lg text-center bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Your Nickname (3+ characters)"
            minLength={3}
            maxLength={15}
            required
          />
          <button
            type="submit"
            className="w-full mt-4 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
            disabled={!name.trim() || name.trim().length < 3}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;