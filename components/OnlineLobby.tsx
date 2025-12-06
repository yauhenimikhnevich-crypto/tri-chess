
import React, { useState, useEffect, useRef } from 'react';
import { Player, PlayerType, OnlineUser, Invite, OnlineGame, GameProposal } from '../types';
import * as firebase from '../services/firebase';
import { generateInitialBoard } from '../constants';

interface OnlineLobbyProps {
  user: OnlineUser;
  onGameStarted: (gameId: string) => void;
  onCancel: () => void;
}

const OnlineLobby: React.FC<OnlineLobbyProps> = ({ user, onGameStarted, onCancel }) => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [leaderboard, setLeaderboard] = useState<OnlineUser[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  const [invites, setInvites] = useState<Invite[]>([]);
  const [matchmakingQueue, setMatchmakingQueue] = useState<(OnlineUser & {timestamp: any})[]>([]);
  const [isInQueue, setIsInQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftInvites, setDraftInvites] = useState<OnlineUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [activeProposal, setActiveProposal] = useState<GameProposal | null>(null);
  const [proposalTimeLeft, setProposalTimeLeft] = useState<number>(30);

  const processingInviteRef = useRef<string | null>(null);

  useEffect(() => {
    const handleError = (err: any) => {
        if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
            setError("Permission denied! Check database rules.");
        } else if (err.code === 'failed-precondition' || (err.message && err.message.includes('index'))) {
            setError("Missing Index! Check console for link.");
        } else {
            setError(prev => prev ? prev : "Connection error.");
        }
    };

    const unsubUsers = firebase.onUsersChange(
        (users) => setOnlineUsers(users.filter(u => u.id !== user.id && u.isOnline)), 
        handleError
    );
    const unsubInvites = firebase.onInvitesChange(user.id, setInvites, handleError);
    const unsubQueue = firebase.onMatchmakingQueueChange(setMatchmakingQueue, handleError);
    
    firebase.getLeaderboard(100).then(setLeaderboard).catch(console.error);

    const unsubGameInvites = firebase.onGameInvitation(user.id, async (gameId) => {
      const gameExists = await firebase.checkGameExists(gameId);
      if (gameExists) {
        firebase.leaveMatchmakingQueue(user.id).catch(() => {});
        onGameStarted(gameId);
      } else {
        console.warn(`Stale game invitation detected for game ID: ${gameId}. Ignoring.`);
      }
    });

    return () => { 
      unsubUsers(); 
      unsubInvites(); 
      unsubQueue(); 
      unsubGameInvites();
    };
  }, [user.id, onGameStarted]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const sentInvites = invites.filter(i => i.from.id === user.id && i.status === 'pending');
      
      sentInvites.forEach(invite => {
        let createdMillis = now;
        if (invite.timestamp) {
            if (typeof invite.timestamp.toMillis === 'function') createdMillis = invite.timestamp.toMillis();
            else if (invite.timestamp.seconds) createdMillis = invite.timestamp.seconds * 1000;
        }
        
        if (now - createdMillis > 60000) {
            console.log("Deleting expired invite:", invite.id);
            firebase.deleteInvite(invite.id).catch(console.error);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [invites, user.id]);

  useEffect(() => {
    if (!activeProposalId) {
        setActiveProposal(null);
        return;
    }

    const unsubProposal = firebase.onProposalChange(activeProposalId, async (proposal) => {
        if (!proposal) {
            setActiveProposalId(null);
            onCancel(); 
            return;
        }
        
        setActiveProposal(proposal);

        if (proposal.gameId) {
             firebase.leaveMatchmakingQueue(user.id).catch(() => {});
             onGameStarted(proposal.gameId);
             return;
        }

        if (proposal.status === 'negotiating_ai' && !isCreating) {
            const votes = Object.values(proposal.aiVotes || {});
            const participantCount = Object.keys(proposal.players).length; 
            
            if (votes.some(v => v === false)) {
                await firebase.deleteProposal(proposal.id);
                return;
            }

            if (proposal.hostId === user.id) {
                if (votes.length === participantCount && votes.every(v => v === true)) {
                    setIsCreating(true);
                    
                    const players: OnlineGame['players'] = {};
                    (Object.keys(proposal.players) as Player[]).forEach(p => {
                        const playerInfo = proposal.players[p];
                        if (playerInfo) {
                            players[p] = { ...playerInfo, rating: playerInfo.rating || 1000 };
                        }
                    });
                    
                    if (!players[Player.Gray]) players[Player.Gray] = { id: 'AI_EASY', name: 'AI (Easy)', rating: 1000 };
                    else if (!players[Player.Black]) players[Player.Black] = { id: 'AI_EASY', name: 'AI (Easy)', rating: 1000 };

                    const playerTypes: OnlineGame['playerTypes'] = {
                        [Player.White]: players[Player.White]?.id.startsWith('AI') ? PlayerType.AIEasy : 'ONLINE_HUMAN',
                        [Player.Black]: players[Player.Black]?.id.startsWith('AI') ? PlayerType.AIEasy : 'ONLINE_HUMAN',
                        [Player.Gray]: players[Player.Gray]?.id.startsWith('AI') ? PlayerType.AIEasy : 'ONLINE_HUMAN',
                    };

                    const initialGame: Omit<OnlineGame, 'id'> = {
                        players, playerTypes,
                        boardState: generateInitialBoard(), currentPlayer: Player.White, eliminatedPlayers: [],
                        scores: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
                        capturedPieces: { [Player.White]: [], [Player.Black]: [], [Player.Gray]: [] },
                        duelingState: null, statusMessage: "Game Started! Setup your pieces.", gamePhase: 'SETUP', setupCompleted: {}, winner: null,
                        leftPlayers: [],
                        playerIds: Object.values(players).map(p => p!.id),
                        timestamp: null,
                        moveHistory: [],
                        isRanked: false, // Mixed AI games are unranked
                        chatMessages: []
                    };

                    try {
                        const gameId = await firebase.createGame(initialGame);
                        await firebase.updateGameProposal(proposal.id, { gameId, status: 'completed' });
                    } catch (e) {
                        setIsCreating(false);
                        console.error("Error creating AI mixed game:", e);
                    }
                }
            }
        }

        if (proposal.status === 'pending' && proposal.hostId === user.id && !isCreating) {
            const hasBlack = !!proposal.players[Player.Black];
            const hasGray = !!proposal.players[Player.Gray];
            
            if (hasBlack && hasGray) {
                setIsCreating(true);
                try {
                    const players: OnlineGame['players'] = {
                        [Player.White]: { ...proposal.players[Player.White]!, rating: proposal.players[Player.White]!.rating || 1000 },
                        [Player.Black]: { ...proposal.players[Player.Black]!, rating: proposal.players[Player.Black]!.rating || 1000 },
                        [Player.Gray]: { ...proposal.players[Player.Gray]!, rating: proposal.players[Player.Gray]!.rating || 1000 },
                    };
                    const playerTypes: OnlineGame['playerTypes'] = {
                        [Player.White]: 'ONLINE_HUMAN', [Player.Black]: 'ONLINE_HUMAN', [Player.Gray]: 'ONLINE_HUMAN',
                    };
                    const initialGame: Omit<OnlineGame, 'id'> = {
                        players, playerTypes,
                        boardState: generateInitialBoard(), currentPlayer: Player.White, eliminatedPlayers: [],
                        scores: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
                        capturedPieces: { [Player.White]: [], [Player.Black]: [], [Player.Gray]: [] },
                        duelingState: null, statusMessage: "Game Started! Setup your pieces.", gamePhase: 'SETUP', setupCompleted: {}, winner: null,
                        leftPlayers: [],
                        playerIds: [players[Player.White]!.id, players[Player.Black]!.id, players[Player.Gray]!.id],
                        timestamp: null,
                        moveHistory: [],
                        isRanked: true, // Standard 3-human games are ranked
                        chatMessages: []
                    };

                    const gameId = await firebase.createGame(initialGame);
                    await firebase.updateGameProposal(proposal.id, { gameId, status: 'completed' });
                } catch (e: any) {
                    console.error("Error creating game from proposal", e);
                    setError("Failed to create game from proposal.");
                    setIsCreating(false);
                }
            }
        }
    });

    return () => unsubProposal();
  }, [activeProposalId, user.id, isCreating, onGameStarted, onCancel]);

  useEffect(() => {
    if (!activeProposal || activeProposal.status !== 'pending') return;

    const timer = setInterval(async () => {
        let createdMillis = Date.now();
        let isValidTimestamp = false;

        if (activeProposal.createdAt) {
            if (typeof activeProposal.createdAt.toMillis === 'function') {
                createdMillis = activeProposal.createdAt.toMillis();
                isValidTimestamp = true;
            } else if (activeProposal.createdAt.seconds) {
                createdMillis = activeProposal.createdAt.seconds * 1000;
                isValidTimestamp = true;
            } else if (activeProposal.createdAt instanceof Date) {
                createdMillis = activeProposal.createdAt.getTime();
                isValidTimestamp = true;
            } else if (typeof activeProposal.createdAt === 'number') {
                createdMillis = activeProposal.createdAt;
                isValidTimestamp = true;
            }
        }

        if (isValidTimestamp) {
            const elapsedSeconds = (Date.now() - createdMillis) / 1000;
            const timeLeft = Math.max(0, Math.ceil(30 - elapsedSeconds));
            setProposalTimeLeft(timeLeft);

            if (timeLeft <= 0) {
                clearInterval(timer);
                if (activeProposal.hostId === user.id) {
                    const playerCount = Object.keys(activeProposal.players).length;
                    if (playerCount === 3) return; 

                    if (playerCount === 2) {
                        firebase.updateGameProposal(activeProposal.id, { status: 'negotiating_ai' });
                    } else {
                        firebase.deleteProposal(activeProposal.id);
                    }
                }
            }
        } else {
            setProposalTimeLeft(30);
        }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeProposal, user.id]); 


  const handleProposalVote = async (vote: boolean) => {
      if (activeProposalId) {
          try {
            if (!vote) {
                await firebase.deleteProposal(activeProposalId);
            } else {
                await firebase.submitProposalVote(activeProposalId, user.id, true);
            }
          } catch (e: any) {
              console.error("Voting failed", e);
              if (e.code === 'not-found' || (e.message && e.message.includes("found"))) {
                  setActiveProposalId(null);
                  onCancel();
              } else {
                  setError("Failed to vote. " + e.message);
              }
          }
      }
  };

    useEffect(() => {
    setIsInQueue(matchmakingQueue.some(p => p.id === user.id));
  }, [matchmakingQueue, user.id]);

  useEffect(() => {
    if (!isInQueue) return;
    
    const sortedQueue = [...matchmakingQueue].sort((a, b) => {
        const timeA = (a.timestamp?.toMillis && a.timestamp.toMillis()) || 0;
        const timeB = (b.timestamp?.toMillis && b.timestamp.toMillis()) || 0;
        return timeA - timeB;
    });

    if (sortedQueue.length < 3) return;

    const isLeader = sortedQueue[0].id === user.id;
    if (!isLeader) return;
    
    const myEntry = sortedQueue[0];
    const myRating = myEntry.rating || 1000;
    
    const waitTime = (Date.now() - ((myEntry.timestamp?.toMillis && myEntry.timestamp.toMillis()) || Date.now())) / 1000;
    
    let ratingDiffThreshold = 200; 
    if (waitTime > 15) ratingDiffThreshold = 500; 
    if (waitTime > 30) ratingDiffThreshold = Infinity; 

    const compatiblePlayers = sortedQueue.slice(1).filter(p => {
        const r = p.rating || 1000;
        return Math.abs(r - myRating) <= ratingDiffThreshold;
    });

    if (compatiblePlayers.length >= 2) {
        const match = [myEntry, compatiblePlayers[0], compatiblePlayers[1]];
        createGameWithPlayers(match);
    }

  }, [matchmakingQueue, user.id, isInQueue]);

    const createGameWithPlayers = (players: { id: string; name: string, rating: number }[]) => {
    if (isCreating) return;
    setIsCreating(true);

    const shuffled = [...players].sort(() => Math.random() - 0.5);

    let gamePlayers: OnlineGame['players'] = {
        [Player.White]: { id: shuffled[0].id, name: shuffled[0].name, rating: shuffled[0].rating },
        [Player.Black]: { id: shuffled[1].id, name: shuffled[1].name, rating: shuffled[1].rating },
        [Player.Gray]: { id: shuffled[2].id, name: shuffled[2].name, rating: shuffled[2].rating },
    };
    let gamePlayerTypes: OnlineGame['playerTypes'] = {
        [Player.White]: 'ONLINE_HUMAN',
        [Player.Black]: 'ONLINE_HUMAN',
        [Player.Gray]: 'ONLINE_HUMAN',
    };
    const allPlayerIds = shuffled.map(p => p.id);
    
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
      playerIds: allPlayerIds,
      timestamp: null,
      moveHistory: [],
      isRanked: true, // Matchmaking games are always ranked
      chatMessages: []
    };

    firebase.createGameFromQueue(players, initialGame)
      .catch(err => {
        setIsCreating(false);
        if (err.message && err.message.includes("A player has left")) {
            console.warn("Matchmaking race condition handled: " + err.message);
            return; 
        }
        console.error("Game creation transaction failed:", err.message);
        setError("Failed to create game. " + err.message);
      });
  };

  const handleToggleQueue = async () => {
    setError(null);
    try {
      if (isInQueue) {
        await firebase.leaveMatchmakingQueue(user.id);
      } else {
        await firebase.joinMatchmakingQueue(user);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        setError("Action blocked: Permission denied.");
      } else {
        setError("Action failed: " + err.message);
      }
    }
  };
  
    const handleAcceptInvite = async (invite: Invite) => {
    try {
        if (invite.proposalId) {
            await firebase.acceptGameProposal(invite.proposalId, user);
            await firebase.deleteInvite(invite.id);
            setActiveProposalId(invite.proposalId); 
        } else {
            // Direct Invite (VS AI or Standard)
            const players = {
                [Player.White]: { id: invite.from.id, name: invite.from.name, rating: 1000 },
                [Player.Black]: { id: user.id, name: user.name, rating: user.rating },
                [Player.Gray]: { id: 'AI_EASY', name: 'AI (Easy)', rating: 1000 },
            };
            const playerTypes: OnlineGame['playerTypes'] = {
                [Player.White]: 'ONLINE_HUMAN',
                [Player.Black]: 'ONLINE_HUMAN',
                [Player.Gray]: PlayerType.AIEasy,
            };
            const initialGame: Omit<OnlineGame, 'id'> = {
                players, playerTypes, boardState: generateInitialBoard(), currentPlayer: Player.White, eliminatedPlayers: [],
                scores: { [Player.White]: 0, [Player.Black]: 0, [Player.Gray]: 0 },
                capturedPieces: { [Player.White]: [], [Player.Black]: [], [Player.Gray]: [] },
                duelingState: null, statusMessage: "Game created! Place your pieces.", gamePhase: 'SETUP', setupCompleted: {}, winner: null,
                leftPlayers: [],
                playerIds: [invite.from.id, user.id, 'AI_EASY'],
                timestamp: null,
                moveHistory: [],
                isRanked: false, // VS AI games are unranked
                chatMessages: []
            };
            const gameId = await firebase.createGame(initialGame);
            await firebase.updateInvite(invite.id, { status: 'accepted', gameId });
        }
    } catch (err: any) {
        setError("Failed to accept invite: " + err.message);
    }
  };
  
    const toggleDraftPlayer = (targetUser: OnlineUser) => {
      const exists = draftInvites.find(u => u.id === targetUser.id);
      if (exists) {
          setDraftInvites(prev => prev.filter(u => u.id !== targetUser.id));
      } else {
          if (draftInvites.length >= 2) {
              setError("You can only invite up to 2 players.");
              setTimeout(() => setError(null), 3000);
              return;
          }
          setDraftInvites(prev => [...prev, targetUser]);
      }
  };

  const handleSendDraftInvites = async () => {
      if (draftInvites.length === 0) return;

      try {
        if (draftInvites.length === 1) {
             await firebase.sendInvite(user, draftInvites[0], 'VS_AI');
        } else if (draftInvites.length === 2) {
            const proposalId = await firebase.createGameProposal(user, draftInvites.map(u => u.id));
            setActiveProposalId(proposalId);
            
            for (const targetUser of draftInvites) {
                await firebase.sendInvite(user, targetUser, 'STANDARD', proposalId);
            }
        }
        setDraftInvites([]); 
      } catch (err: any) {
          setError("Failed to send invites: " + err.message);
      }
  };
  
  const handleDeclineInvite = (inviteId: string) => firebase.updateInvite(inviteId, { status: 'declined' }).catch(err => setError(err.message));
  const handleCancelInvite = (inviteId: string) => firebase.deleteInvite(inviteId).catch(err => setError(err.message));

  const receivedInvites = invites.filter(i => i.to.id === user.id && i.status === 'pending');
  const sentInvites = invites.filter(i => i.from.id === user.id && i.status === 'pending');
  const filteredOnlineUsers = onlineUsers.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (activeProposalId) {
      if (activeProposal?.status === 'negotiating_ai') {
        const hasVoted = activeProposal.aiVotes && activeProposal.aiVotes[user.id] !== undefined;
        const otherPlayer = Object.values(activeProposal.players).find(p => p?.id !== user.id);
        const otherPlayerName = otherPlayer?.name || "the other player";

        return (
             <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
              <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-xl text-center border border-yellow-500">
                  <h1 className="text-2xl font-bold mb-4 text-yellow-400">Player Missing</h1>
                  <p className="text-gray-300 mb-6">
                      The third player did not join in time.
                      <br/><br/>
                      Do you want to play with <strong>{otherPlayerName}</strong> and an AI?
                  </p>
                  
                  {hasVoted ? (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-indigo-400 font-bold animate-pulse">Waiting for {otherPlayerName}...</p>
                        <button 
                            onClick={() => handleProposalVote(false)} 
                            className="mt-4 text-sm text-red-400 hover:text-red-300 underline"
                        >
                            Cancel and Return to Menu
                        </button>
                      </div>
                  ) : (
                      <div className="flex gap-4 justify-center">
                          <button onClick={() => handleProposalVote(true)} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all">Yes</button>
                          <button onClick={() => handleProposalVote(false)} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all">No (Cancel)</button>
                      </div>
                  )}
                  <p className="text-xs text-gray-500 mt-4">If either player votes No, the session will be reset.</p>
              </div>
          </div>
        );
      }

      const playersCount = activeProposal?.players ? Object.keys(activeProposal.players).length : 1;

      return (
          <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
              <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-xl text-center">
                  <h1 className="text-3xl font-bold mb-4 text-indigo-400 animate-pulse">Waiting for Players...</h1>
                  
                  <div className="mb-4">
                      <span className={`text-4xl font-mono font-bold ${proposalTimeLeft < 10 ? 'text-red-500' : 'text-white'}`}>
                        {proposalTimeLeft}s
                      </span>
                  </div>

                  <p className="text-gray-300 mb-6">
                      {playersCount === 2 ? (
                          <>
                            One player has joined!<br/>Waiting for the last player...
                          </>
                      ) : (
                          "The game will start automatically once everyone accepts."
                      )}
                  </p>
                  <div className="flex justify-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <button onClick={() => handleProposalVote(false)} className="mt-8 text-sm text-red-400 hover:text-red-300 underline">Cancel</button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      <div className="flex items-center justify-between w-full max-w-4xl mb-4">
        <h1 className="text-3xl sm:text-4xl font-bold">Online Lobby</h1>
      </div>
      
      <div className="flex items-center gap-2 mb-6">
        <p className="text-gray-400">Welcome, <span className="font-bold text-white">{user.name}</span>!</p>
        <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded font-bold">Rating: {user.rating}</span>
      </div>

      {error && (
        <div className="w-full max-w-lg mb-6 p-4 bg-red-900/80 border border-red-500 rounded-lg text-white text-center shadow-xl animate-bounce-short">
            <h3 className="font-bold text-lg">⚠️ Error</h3>
            <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="w-full max-w-lg mb-6">
        <button 
          onClick={handleToggleQueue}
          className={`w-full px-4 py-4 text-xl font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 ${
            isInQueue ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isInQueue ? 'Cancel Search' : 'Find Game (3 Players)'}
        </button>
         {isInQueue && <p className="text-center text-gray-400 mt-2 animate-pulse">{`Searching for players... (${matchmakingQueue.length}/3)`}</p>}
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8">
        <div className="flex-1 flex flex-col gap-4">
            <div className="bg-gray-800/50 p-4 rounded-lg">
                <div className="flex flex-col gap-3 mb-3">
                    <h2 className="text-xl font-bold">Players Online ({onlineUsers.length})</h2>
                    <input 
                        type="text" 
                        placeholder="Search player nickname..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                </div>
                
                <ul className="space-y-2 max-h-60 overflow-y-auto min-h-[100px]">
                    {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map(u => {
                    const isDrafted = draftInvites.some(d => d.id === u.id);
                    const isAlreadyInvited = sentInvites.some(i => i.to.id === u.id);
                    
                    return (
                        <li key={u.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                        <div className="flex flex-col">
                            <span>{u.name}</span>
                            <span className="text-xs text-gray-400">Rating: {u.rating}</span>
                        </div>
                        <button
                            onClick={() => toggleDraftPlayer(u)}
                            disabled={isAlreadyInvited}
                            className={`px-3 py-1 text-sm rounded transition-colors ${
                                isDrafted 
                                ? 'bg-red-500 hover:bg-red-600 text-white' 
                                : isAlreadyInvited 
                                    ? 'bg-gray-500 cursor-not-allowed' 
                                    : 'bg-teal-600 hover:bg-teal-700'
                            }`}
                        >
                            {isDrafted ? 'Remove' : isAlreadyInvited ? 'Pending' : 'Add to List'}
                        </button>
                        </li>
                    );
                    }) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 italic gap-2 pt-4">
                            {searchQuery ? 'No players found.' : 'No other players online.'}
                        </div>
                    )}
                </ul>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-bold text-yellow-400">Top 100 Leaderboard</h2>
                    <button 
                        onClick={() => setShowLeaderboard(!showLeaderboard)}
                        className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                    >
                        {showLeaderboard ? 'Hide' : 'Show'}
                    </button>
                </div>
                
                {showLeaderboard && (
                    <div className="max-h-60 overflow-y-auto bg-gray-900/50 rounded">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-700 text-gray-300 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Player</th>
                                    <th className="px-3 py-2">Rating</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((player, index) => (
                                    <tr key={player.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                        <td className="px-3 py-2 font-mono text-gray-400">{index + 1}</td>
                                        <td className="px-3 py-2 font-bold">{player.name}</td>
                                        <td className="px-3 py-2 text-yellow-500">{player.rating}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>

        <div className="flex-1 bg-gray-800/50 p-4 rounded-lg flex flex-col gap-4">
          
          <div>
              <h2 className="text-xl font-bold mb-2 text-indigo-300">Draft Invites ({draftInvites.length}/2)</h2>
              <div className="bg-gray-900/50 p-3 rounded-lg min-h-[60px]">
                  {draftInvites.length === 0 ? (
                      <p className="text-gray-500 text-sm italic text-center py-2">Select players from the online list</p>
                  ) : (
                      <div className="space-y-2">
                          {draftInvites.map(u => (
                              <div key={u.id} className="flex justify-between items-center bg-gray-700/50 px-2 py-1 rounded">
                                  <span>{u.name} <span className="text-xs text-gray-400">({u.rating})</span></span>
                                  <button onClick={() => toggleDraftPlayer(u)} className="text-red-400 hover:text-red-200 text-xs font-bold">X</button>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
              <button 
                onClick={handleSendDraftInvites}
                disabled={draftInvites.length === 0}
                className="w-full mt-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded shadow-md transition-all"
              >
                  Send Invite{draftInvites.length > 1 ? 's' : ''}
              </button>
          </div>

          <div className="border-t border-gray-600 pt-2">
             <h2 className="text-xl font-bold mb-2">Invites Received</h2>
             <div className="space-y-2 max-h-40 overflow-y-auto">
                {receivedInvites.map(i => (
                <div key={i.id} className="p-3 bg-gray-700 rounded shadow-sm border-l-4 border-yellow-500">
                    <p className="font-bold text-lg">{i.from.name}</p>
                    <p className="text-sm text-gray-300 mb-2">
                        {i.mode === 'VS_AI' 
                            ? `invites you to play against them and an AI.` 
                            : `invites you to a match.`}
                    </p>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => handleAcceptInvite(i)} className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-bold">Accept</button>
                        <button onClick={() => handleDeclineInvite(i.id)} className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded">Decline</button>
                    </div>
                </div>
                ))}
                {receivedInvites.length === 0 && <p className="text-gray-500 italic text-sm">No new invites.</p>}
             </div>
          </div>

          <div className="border-t border-gray-600 pt-2">
            <h2 className="text-lg font-bold mb-2 text-gray-400">Sent (Pending)</h2>
             <div className="space-y-2 max-h-32 overflow-y-auto">
                {sentInvites.map(i => (
                    <div key={i.id} className="flex justify-between items-center p-2 bg-gray-700 rounded text-sm">
                        <span>Waiting for <span className="font-bold">{i.to.name}</span>...</span>
                        <button onClick={() => handleCancelInvite(i.id)} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-xs rounded">Cancel</button>
                    </div>
                ))}
                {sentInvites.length === 0 && <p className="text-gray-500 italic text-sm">No active sent invites.</p>}
            </div>
           </div>

           <button onClick={onCancel} className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 font-semibold rounded-lg shadow-md">Back to Main Menu</button>
        </div>
      </div>
    </div>
  );
};

export default OnlineLobby;
