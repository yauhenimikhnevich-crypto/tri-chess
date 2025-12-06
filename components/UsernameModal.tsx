
import React, { useState } from 'react';
import * as firebase from '../services/firebase';

interface UsernameModalProps {
  onSetUsername: (name: string) => void;
}

const UsernameModal: React.FC<UsernameModalProps> = ({ onSetUsername }) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 3) return;

    setIsSubmitting(true);
    
    try {
        const currentUser = firebase.getCurrentUser();
        if (currentUser) {
            await firebase.registerUser({ 
                id: currentUser.uid, 
                name: trimmedName, 
                isOnline: true 
            });
            onSetUsername(trimmedName);
        } else {
            setError("Auth error. Please reload.");
        }
    } catch (err: any) {
        console.error("Registration error:", err);
        if (err.message && err.message.includes("already taken")) {
            setError("This nickname is already taken. Please choose another.");
        } else if (err.code === "permission-denied") {
            setError("Database permission denied. Check Setup Guide.");
        } else {
            setError("Failed to register. " + err.message);
        }
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center max-w-md w-full">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Welcome to Tri-Chess</h1>
        <p className="text-gray-400 mb-6">Please enter your nickname to play online.</p>
        
        {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4 text-sm">
                {error}
            </div>
        )}

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
            disabled={isSubmitting}
          />
          <button
            type="submit"
            className="w-full mt-4 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
            disabled={!name.trim() || name.trim().length < 3 || isSubmitting}
          >
            {isSubmitting ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;
