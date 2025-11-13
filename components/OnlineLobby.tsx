

import React, { useState, useEffect, useRef } from 'react';
import { Player, PlayerType, OnlineUser, Invite, OnlineGame, GameProposal } from '../types';
import * as firebase from '../services/firebase';
import { generateInitialBoard, PLAYER_COLORS } from '../constants';

interface OnlineLobbyProps {
  user: OnlineUser;
  onGameStarted: (gameId: string) => void;
  onCancel: () => void;
}

const ProposalModal: React.FC<{ proposal: GameProposal; user: OnlineUser; onAccept: (proposalId: string) => void; onDecline: (proposalId: string) => void; }> = 
  ({ proposal, user, onAccept, onDecline }) => {
    const otherPlayer = (Object.values(proposal.players) as {id: string, name: string}[]).find(p => p.id !== user.id);
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border border-gray-700 text-center">
                <h2 className="text-xl font-bold mb-2">Game Proposal</h2>
                <p className="text-gray-400 mb-4">
                    Not enough players found. Play with <span className="font-bold text-white">{otherPlayer?.name}</span> and an AI?
                </p>
                <div className="flex gap-4">
                    <button onClick={() => onAccept(proposal.id)} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold">Accept</button>
                    <button onClick={() => onDecline(proposal.id)} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold">Decline</button>
                </div>
            </div>
        </div>
    );
};


const OnlineLobby: React.FC<OnlineLobbyProps> = ({ user, onGameStarted, onCancel }) => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [matchmakingQueue, setMatchmakingQueue] = useState<(OnlineUser & {timestamp: any})[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [isInQueue, setIsInQueue] = useState(false);
  const [searchCountdown, setSearchCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingInviteRef = useRef<string | null>(null); // Guard to prevent re-processing

  // --- Listeners ---
  useEffect(() => {
    const unsubUsers = firebase.onUsersChange((users) => setOnlineUsers(users.filter(u => u.id !== user.id && u.isOnline)));
    const unsubInvites = firebase.onInvitesChange(user.id, setInvites);
    const unsubQueue = firebase.onMatchmakingQueueChange(setMatchmakingQueue);
    const unsubProposals = firebase.onProposalsChange(user.id, setProposals);
    
    const unsubGameInvites = firebase.onGameInvitation(user.id, async (gameId) => {
      const gameExists = await firebase.checkGameExists(gameId);
      if (gameExists) {
        onGameStarted(gameId);
      } else {
        console.warn(`Stale game invitation detected for game ID: ${gameId}. Ignoring.`);
      }
    });

    return () => { 
      unsubUsers(); 
      unsubInvites(); 
      unsubQueue(); 
      unsubProposals(); 
      unsubGameInvites();
    };
  }, [user.id, onGameStarted]);

  useEffect(() => {
    setIsInQueue(matchmakingQueue.some(p => p.id === user.id));
  }, [matchmakingQueue, user.id]);

  // --- New Timer-based Matchmaking ---
  
  // Countdown Timer Effect
  useEffect(() => {
    if (!isInQueue || searchCountdown === null || searchCountdown <= 0) {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      return;
    }
    countdownTimerRef.current = setTimeout(() => {
      setSearchCountdown(c => (c !== null ? c - 1 : null));
    }, 1000);

    return () => { if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current) };
  }, [isInQueue, searchCountdown]);
  
  // Matchmaking Logic (run by leader)
  useEffect(() => {
    if (!isInQueue) return;

    const sortedQueue = [...matchmakingQueue].sort((a, b) => a.timestamp?.toMillis() - b.timestamp?.toMillis());
    if (sortedQueue.length < 1) return;

    const isLeader = sortedQueue[0].id === user.id;
    if (!isLeader) return;

    // 1. Immediate game start for 3 players
    if (sortedQueue.length >= 3) {
      const playersForGame = sortedQueue.slice(0, 3);
      createGameWithPlayers(playersForGame);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      setSearchCountdown(null);
      return;
    }
    
    // 2. Timer expires logic
    if (searchCountdown === 0) {
      if (sortedQueue.length === 2) {
        const playersForProposal = sortedQueue.slice(0, 2);
        firebase.createGameProposal(playersForProposal);
      } else if (sortedQueue.length === 1) {
        alert("No opponents found. The search has been cancelled.");
        firebase.leaveMatchmakingQueue(user.id);
      }
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      setSearchCountdown(null);
    }
  }, [matchmakingQueue, searchCountdown, user.id, isInQueue]);

  
  // --- Proposal Handling ---
  useEffect(() => {
    const readyProposal = proposals.find(p =>
      Object.values(p.status).every(s => s === 'accepted')
    );
    
    if (readyProposal) {
        const playerIds = Object.keys(readyProposal.players).sort();
        const isGameCreator = playerIds[0] === user.id; 
        
        if (isGameCreator) {
            const players = Object.values(readyProposal.players) as {id: string, name: string}[];
            createGameWithPlayers(players, true); // true for 'with AI'
            firebase.deleteProposal(readyProposal.id);
        }
    }
  }, [proposals, user.id]);

  // --- Invite Handling ---
  useEffect(() => {
    const acceptedInvite = invites.find(i => i.from.id === user.id && i.status === 'accepted' && i.gameId);
    
    if (!acceptedInvite || processingInviteRef.current === acceptedInvite.id) {
        return;
    }

    const processAcceptedInvite = async (invite: Invite) => {
        processingInviteRef.current = invite.id;

        // Defensively check if the game exists before doing anything.
        // This handles the race condition where this listener fires for a game that's already over.
        const gameExists = await firebase.checkGameExists(invite.gameId!);
        
        // Always delete the invite, as it has now been processed.
        await firebase.deleteInvite(invite.id);

        if (gameExists) {
            // If the game exists, navigate to it.
            onGameStarted(invite.gameId!);
        } else {
            // If the game doesn't exist, it's a stale invite.
            // The invite has been deleted, so we just log it and do nothing.
            console.warn(`Stale accepted invite detected for game ID: ${invite.gameId}. Invite deleted.`);
        }
    };

    processAcceptedInvite(acceptedInvite);
  }, [invites, user.id, onGameStarted]);

  // --- Action Handlers ---
  const handleToggleQueue = () => {
    if (isInQueue) {
      firebase.leaveMatchmakingQueue(user.id);
    } else {
      firebase.joinMatchmakingQueue(user);
      setSearchCountdown(30);
    }
  };

  const createGameWithPlayers = async (players: { id: string; name: string; }[], withAi = false) => {
    let gamePlayers: OnlineGame['players'] = {};
    let gamePlayerTypes: OnlineGame['playerTypes'] = {} as any;
    const playerIds = players.map(p => p.id);

    const assignedColors = [Player.White, Player.Black, Player.Gray];
    players.forEach((p, i) => {
        const color = assignedColors[i];
        gamePlayers[color] = { id: p.id, name: p.name };
        gamePlayerTypes[color] = 'ONLINE_HUMAN';
    });

    if (withAi) {
        gamePlayers[Player.Gray] = { id: 'AI_MEDIUM', name: 'AI (Medium)' };
        gamePlayerTypes[Player.Gray] = PlayerType.AIMedium;
    }
    
    const initialGame: Omit<OnlineGame, 'id'> = {
      players: gamePlayers,
      playerTypes: gamePlayerTypes,
      boardState: generateInitialBoard(),
      currentPlayer: Player.White,
      eliminatedPlayers: [],
      scores: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
      capturedPieces: { [Player.White]: [], [Player.Black]: [], [Player.Gray]: [] },
      duelingState: null,
      statusMessage: "Game found! Place your pieces.",
      gamePhase: 'SETUP',
      setupCompleted: {},
      winner: null,
      leftPlayers: [],
      playerIds: withAi ? playerIds : [...playerIds, 'AI_MEDIUM'],
      timestamp: null, // Server will set this
    };

    await firebase.createGameFromQueue(players, initialGame);
  };
  
  const handleAcceptInvite = async (invite: Invite) => {
    const players = {
      [Player.White]: { id: invite.from.id, name: invite.from.name },
      [Player.Black]: { id: user.id, name: user.name },
      [Player.Gray]: { id: 'AI_MEDIUM', name: 'AI (Medium)' },
    };
    const playerTypes: OnlineGame['playerTypes'] = {
      [Player.White]: 'ONLINE_HUMAN',
      [Player.Black]: 'ONLINE_HUMAN',
      [Player.Gray]: PlayerType.AIMedium,
    };
    const initialGame: Omit<OnlineGame, 'id'> = {
      players, playerTypes, boardState: generateInitialBoard(), currentPlayer: Player.White, eliminatedPlayers: [],
      scores: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
      capturedPieces: { [Player.White]: [], [Player.Black]: [], [Player.Gray]: [] },
      duelingState: null, statusMessage: "Game created! Place your pieces.", gamePhase: 'SETUP', setupCompleted: {}, winner: null,
      leftPlayers: [],
      playerIds: [invite.from.id, user.id],
      timestamp: null,
    };
    const gameId = await firebase.createGame(initialGame);
    await firebase.updateInvite(invite.id, { status: 'accepted', gameId });
  };
  
  const handleSendInvite = (toUser: OnlineUser) => firebase.sendInvite(user, toUser);
  const handleDeclineInvite = (inviteId: string) => firebase.updateInvite(inviteId, { status: 'declined' });
  const handleCancelInvite = (inviteId: string) => firebase.deleteInvite(inviteId);
  const handleAcceptProposal = (proposalId: string) => firebase.acceptGameProposal(proposalId, user.id);
  const handleDeclineProposal = (proposalId: string) => firebase.deleteProposal(proposalId);

  const receivedInvites = invites.filter(i => i.to.id === user.id && i.status === 'pending');
  const sentInvites = invites.filter(i => i.from.id === user.id && i.status === 'pending');
  const activeProposal = proposals.find(p => p.status[user.id] === 'pending');

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      {activeProposal && <ProposalModal proposal={activeProposal} user={user} onAccept={handleAcceptProposal} onDecline={handleDeclineProposal} />}
      <h1 className="text-3xl sm:text-4xl font-bold mb-4">Online Lobby</h1>
      <p className="text-gray-400 mb-6">Welcome, <span className="font-bold text-white">{user.name}</span>! Find an opponent to play.</p>

      <div className="w-full max-w-lg mb-6">
        <button 
          onClick={handleToggleQueue}
          className={`w-full px-4 py-4 text-xl font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 ${
            isInQueue ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isInQueue ? `Cancel Search ${searchCountdown !== null ? `(${searchCountdown}s)` : ''}` : 'Start Game'}
        </button>
         {isInQueue && <p className="text-center text-gray-400 mt-2 animate-pulse">{`Searching for players... (${matchmakingQueue.length}/3)`}</p>}
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8">
        <div className="flex-1 bg-gray-800/50 p-4 rounded-lg">
          <h2 className="text-xl font-bold mb-3">Players Online ({onlineUsers.length})</h2>
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {onlineUsers.length > 0 ? onlineUsers.map(u => (
              <li key={u.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                <span>{u.name}</span>
                 <button
                  onClick={() => handleSendInvite(u)}
                  disabled={sentInvites.some(i => i.to.id === u.id) || receivedInvites.some(i => i.from.id === u.id)}
                  className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-sm rounded disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {sentInvites.some(i => i.to.id === u.id) ? 'Invited' : 'Invite'}
                </button>
              </li>
            )) : <p className="text-gray-500 italic">No other players online.</p>}
          </ul>
        </div>

        <div className="flex-1 bg-gray-800/50 p-4 rounded-lg">
          <h2 className="text-xl font-bold mb-3">Invites</h2>
           <div className="space-y-2 max-h-60 overflow-y-auto">
             {receivedInvites.map(i => (
              <div key={i.id} className="p-2 bg-gray-700 rounded">
                <p className="mb-2">Invite from <span className="font-bold">{i.from.name}</span></p>
                <div className="flex gap-2">
                  <button onClick={() => handleAcceptInvite(i)} className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-sm rounded">Accept</button>
                  <button onClick={() => handleDeclineInvite(i.id)} className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-sm rounded">Decline</button>
                </div>
              </div>
            ))}
            {sentInvites.map(i => (
                <div key={i.id} className="p-2 bg-gray-700 rounded">
                    <p className="mb-2">Waiting for <span className="font-bold">{i.to.name}</span>...</p>
                    <button onClick={() => handleCancelInvite(i.id)} className="w-full px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-sm rounded">Cancel</button>
                </div>
            ))}
            {receivedInvites.length === 0 && sentInvites.length === 0 && (
                <p className="text-gray-500 italic">No pending invites.</p>
            )}
           </div>
           <button onClick={onCancel} className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 font-semibold rounded-lg shadow-md">Back to Main Menu</button>
        </div>
      </div>
    </div>
  );
};

export default OnlineLobby;