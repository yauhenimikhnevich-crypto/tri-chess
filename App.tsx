
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BoardCell, Coordinates, Piece, PieceType, Player, PlayerType, AppState, OnlineUser, OnlineGame, Turn, HistoryEntry, ChatMessage } from './types';
import { generateInitialBoard, PIECES_TO_SETUP, SETUP_ZONES, PLAYER_COLORS, PIECE_SCORES, generateEmptyBoard, initialSandboxPieces, firebaseConfig, isFirebaseConfigValid, SETUP_ORDER, PIECE_UNICODE } from './constants';
import * as firebase from './services/firebase';
import { getValidMoves, isKingInCheck, isCheckmate, isStalemate, determineStalemateWinner, isPromotionMove, isDrawByInsufficientMaterial } from './services/gameLogic';
import { findBestMove, getAiSetup } from './services/aiPlayer';
import { calculateNewRatings, calculateResignationRatings } from './services/ratingSystem';
import Board from './components/Board';
import GameInfoPanel from './components/GameInfoPanel';
import PieceStash from './components/PieceStash';
import PlayerStats from './components/PlayerStats';
import PromotionModal from './components/PromotionModal';
import SandboxPalette from './components/SandboxPalette';
import MainMenu from './components/MainMenu';
import UsernameModal from './components/UsernameModal';
import OnlineLobby from './components/OnlineLobby';
import FirebaseSetupInstructions from './components/FirebaseSetupInstructions';
import AuthErrorScreen from './components/AuthErrorScreen';
import ConfirmationModal from './components/ConfirmationModal';
import GameSetup from './components/GameSetup';
import RulesModal from './components/RulesModal';
import MoveHistory from './components/MoveHistory';
import ChatWidget from './components/ChatWidget';

type GamePhase = 'SETUP' | 'PLAY' | 'PROMOTION' | 'GAME_OVER';
type DuelingState = { attacker: Player; defender: Player } | null;

const initialScores = { [Player.Gray]: 0, [Player.White]: 0, [Player.Black]: 0 };
const initialCapturedPieces: { [key in Player]: Piece[] } = { [Player.Gray]: [], [Player.White]: [], [Player.Black]: [] };

const coordsToNotation = (coords: Coordinates): string => {
    if (!coords) return '';
    const { row, col } = coords;
    const rank = 10 - row;
    const file = String.fromCharCode(97 + col);
    return `${file}${rank}`;
};

const boardToString = (board: (BoardCell | null)[][], currentPlayer: Player): string => {
    const boardStr = board.map(row => 
        row.map(cell => {
            if (!cell?.piece) return ' ';
            return `${cell.piece.player[0]}${cell.piece.type[0]}`;
        }).join('')
    ).join('|');
    return `${boardStr}#${currentPlayer}`; 
};

const getAlgebraicNotation = (
    from: Coordinates, 
    to: Coordinates, 
    piece: Piece, 
    capturedPiece: Piece | null,
    isCheck: boolean,
    isCheckmate: boolean
): string => {
    const pieceNotation = PIECE_UNICODE[piece.player][piece.type];
    const fromNotation = coordsToNotation(from);
    const captureNotation = capturedPiece ? 'x' : '-';
    const toNotation = coordsToNotation(to);
    const checkNotation = isCheckmate ? '#' : isCheck ? '+' : '';
    return `${pieceNotation} ${fromNotation}${captureNotation}${toNotation}${checkNotation}`;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('GETTING_USERNAME');
  const [user, setUser] = useState<OnlineUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'CHECKING' | 'DONE'>('CHECKING');

  // Game State
  const [boardState, setBoardState] = useState<(BoardCell | null)[][]>(generateEmptyBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>(Player.White);
  const [gamePhase, setGamePhase] = useState<GamePhase | null>(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<Player[]>([]);
  const [leftPlayers, setLeftPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState(initialScores);
  const [capturedPieces, setCapturedPieces] = useState(initialCapturedPieces);
  const [statusMessage, setStatusMessage] = useState<string>('Welcome to Tri-Chess!');
  const [winner, setWinner] = useState<Player | null>(null);
  const [playerTypes, setPlayerTypes] = useState<{ [key in Player]: PlayerType | 'ONLINE_HUMAN' }>({
    [Player.White]: PlayerType.Human,
    [Player.Black]: PlayerType.Human,
    [Player.Gray]: PlayerType.Human,
  });
  const [duelingState, setDuelingState] = useState<DuelingState>(null);
  const [turnHistory, setTurnHistory] = useState<Turn[]>([]);
  const [positionHistory, setPositionHistory] = useState<string[]>([]);
  const [fullHistory, setFullHistory] = useState<HistoryEntry[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [finalRatingChanges, setFinalRatingChanges] = useState<{ [playerId: string]: number } | null>(null);
  const [isRankedGame, setIsRankedGame] = useState<boolean>(true);
  
  // --- CHAT STATE ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // --- GLOBAL PAUSE STATE ---
  const [isGamePaused, setIsGamePaused] = useState<boolean>(false);

  // UI State
  const [selectedPiece, setSelectedPiece] = useState<Coordinates | null>(null);
  const [validMoves, setValidMoves] = useState<Coordinates[]>([]);
  const [promotionState, setPromotionState] = useState<{ from: Coordinates; to: Coordinates; player: Player } | null>(null);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showContinueVsAiModal, setShowContinueVsAiModal] = useState(false);
  
  // Fullscreen Ref & State
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Setup State
  const [piecesToPlaceByPlayer, setPiecesToPlaceByPlayer] = useState<{ [key in Player]?: PieceType[] }>({});
  const [draggedPieceInfo, setDraggedPieceInfo] = useState<{ player: Player; type: PieceType } | null>(null);
  const [localSetupPlayerIndex, setLocalSetupPlayerIndex] = useState<number | null>(null);
  const [setupCompleted, setSetupCompleted] = useState<{ [key in Player]?: boolean; }>({});
  
  // Sandbox State
  const [sandboxSelectedPiece, setSandboxSelectedPiece] = useState<{ player: Player; type: PieceType } | 'ERASER' | null>(null);
  const [sandboxAvailablePieces, setSandboxAvailablePieces] = useState(initialSandboxPieces);
  
  // Online State
  const [onlineGameId, setOnlineGameId] = useState<string | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlineGame['players'] | null>(null);
  const myColor = useMemo<Player | null>(() => {
    if (!user || !onlinePlayers) return null;
    for (const color of SETUP_ORDER) {
      if (onlinePlayers[color]?.id === user.id) {
        return color;
      }
    }
    return null;
  }, [user, onlinePlayers]);

  const playerNames = useMemo<{ [key in Player]?: string }>(() => {
    const names: { [key in Player]?: string } = {};
    SETUP_ORDER.forEach(p => {
        if (onlinePlayers && onlinePlayers[p]) {
            names[p] = onlinePlayers[p]!.name;
        } else {
            const type = playerTypes[p];
            if (type?.startsWith('AI')) {
                names[p] = type === PlayerType.AIEasy ? 'Bot (Easy)' : 'Bot (Medium)';
            }
        }
    });
    return names;
  }, [onlinePlayers, playerTypes]);
  
  const leftPlayersRef = useRef(leftPlayers);
  const prevActiveHumanCount = useRef<number>(0);

  // --- Sandbox Validation ---
  const sandboxValidation = useMemo(() => {
    if (appState !== 'SANDBOX_SETUP') return { isValid: false, message: '' };

    const playersOnBoard = new Map<Player, { hasKing: boolean }>();
    for (const row of boardState) {
        for (const cell of row) {
            if (cell?.piece) {
                if (!playersOnBoard.has(cell.piece.player)) {
                    playersOnBoard.set(cell.piece.player, { hasKing: false });
                }
                if (cell.piece.type === PieceType.King) {
                    playersOnBoard.get(cell.piece.player)!.hasKing = true;
                }
            }
        }
    }

    if (playersOnBoard.size < 2) {
        return { isValid: false, message: 'At least two players must be on the board.' };
    }

    for (const [player, data] of playersOnBoard.entries()) {
        if (!data.hasKing) {
            return { isValid: false, message: `Player ${PLAYER_COLORS[player].name} is on the board but is missing a King.` };
        }
    }

    return { isValid: true, message: 'Ready to start!' };
  }, [boardState, appState]);
  
  // --- Initialization & Auth ---
  useEffect(() => {
    if (!isFirebaseConfigValid(firebaseConfig)) {
      setAuthStatus('DONE');
      return;
    }
    firebase.initialize();
    const unsubscribe = firebase.onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userData = await firebase.getUserProfile(firebaseUser.uid);
          const onlineUser: OnlineUser = { 
              id: firebaseUser.uid, 
              name: userData?.name || 'Anonymous', 
              isOnline: true, 
              rating: userData?.rating || 1000 
          };
          setUser(onlineUser);
          firebase.setupPresence(onlineUser);
          setAppState(userData?.name ? 'MAIN_MENU' : 'GETTING_USERNAME');
          setAuthStatus('DONE');
        } catch (error: any) {
            setAuthError("Database access failed. This is usually caused by incorrect Firebase Security Rules.");
            setAuthStatus('DONE');
        }
      } else {
        try {
            await firebase.signIn();
        } catch (error: any) {
            setAuthError(`Authentication failed. Ensure "Anonymous" sign-in is enabled. Error: ${error.message}`);
            setAuthStatus('DONE');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- REFRESH USER DATA ON MENU ENTRY ---
  useEffect(() => {
      if ((appState === 'MAIN_MENU' || appState === 'ONLINE_LOBBY') && user) {
          firebase.getUserProfile(user.id).then(updatedUser => {
              if (updatedUser && updatedUser.rating !== user.rating) {
                  console.log("Refreshed user profile. New rating:", updatedUser.rating);
                  setUser(prev => prev ? { ...prev, rating: updatedUser.rating } : null);
              }
          }).catch(console.error);
      }
  }, [appState, user?.id]);

  // --- UNRANKED LEAVE DETECTION ---
  useEffect(() => {
      // Logic: Only run this if we are in an unranked online game that is actively playing.
      // We want to detect when the number of HUMAN players drops to 1 (meaning the other left).
      if (onlineGameId && !isRankedGame && gamePhase === 'PLAY' && !winner && playerTypes) {
          
          const activeHumanPlayers = SETUP_ORDER.filter(p => 
              playerTypes[p] === 'ONLINE_HUMAN' && 
              !leftPlayers.includes(p) && 
              !eliminatedPlayers.includes(p)
          );
          
          const currentCount = activeHumanPlayers.length;
          
          // Initialize ref on first valid render if it's 0 (prevents modal on page reload)
          // We assume a game starts with > 1 human. 
          if (prevActiveHumanCount.current === 0 && currentCount > 0) {
              prevActiveHumanCount.current = currentCount;
          }

          // Trigger Condition: 
          // 1. We now have exactly 1 active human.
          // 2. We previously had more than 1 (meaning someone JUST left).
          if (currentCount === 1 && prevActiveHumanCount.current > 1) {
              // 3. I am that one remaining human.
              if (activeHumanPlayers[0] === myColor) {
                  setShowContinueVsAiModal(true);
              }
          }
          
          // Update ref for next render
          prevActiveHumanCount.current = currentCount;
      } else {
          // Reset if we leave the game context
          prevActiveHumanCount.current = 0;
      }
  }, [leftPlayers, isRankedGame, onlineGameId, gamePhase, winner, playerTypes, myColor, eliminatedPlayers]);


  // --- GAME RESET & SETUP ---
  const resetGame = useCallback((backTo: AppState = 'MAIN_MENU') => {
    setBoardState(generateEmptyBoard());
    setCurrentPlayer(Player.White);
    setGamePhase(null);
    setSelectedPiece(null);
    setValidMoves([]);
    setPiecesToPlaceByPlayer({});
    setDraggedPieceInfo(null);
    setLocalSetupPlayerIndex(null);
    setStatusMessage('Welcome to Tri-Chess!');
    setWinner(null);
    setEliminatedPlayers([]);
    setLeftPlayers([]);
    setScores(initialScores);
    setCapturedPieces(initialCapturedPieces);
    setPromotionState(null);
    setSandboxSelectedPiece(null);
    setSandboxAvailablePieces(initialSandboxPieces);
    setDuelingState(null);
    setPlayerTypes({ [Player.White]: PlayerType.Human, [Player.Black]: PlayerType.Human, [Player.Gray]: PlayerType.Human });
    setOnlineGameId(null);
    setOnlinePlayers(null);
    setSetupCompleted({});
    setShowLeaveConfirmation(false);
    setShowContinueVsAiModal(false);
    setTurnHistory([]);
    setPositionHistory([]);
    setFullHistory([]);
    setReviewIndex(null);
    setFinalRatingChanges(null);
    setIsGamePaused(false);
    setIsRankedGame(true); // Default to ranked for standard play
    setChatMessages([]);
    setAppState(backTo);
  }, []);

  // --- Real-time Game Sync ---
  useEffect(() => {
    if (!onlineGameId || !user) return;

    const unsubscribe = firebase.onGameUpdate(onlineGameId, (gameData) => {
      if (gameData) {
        let myColorForThisUpdate: Player | null = null;
        if (gameData.players) {
            for (const color of SETUP_ORDER) {
                if (gameData.players[color]?.id === user.id) {
                    myColorForThisUpdate = color;
                    break;
                }
            }
        }

        setBoardState(gameData.boardState);
        setCurrentPlayer(gameData.currentPlayer);
        setEliminatedPlayers(gameData.eliminatedPlayers);
        setLeftPlayers(gameData.leftPlayers || []);
        setScores(gameData.scores);
        setCapturedPieces(gameData.capturedPieces);
        setDuelingState(gameData.duelingState);
        setStatusMessage(gameData.statusMessage);
        setGamePhase(gameData.gamePhase);
        setWinner(gameData.winner);
        setPlayerTypes(gameData.playerTypes);
        setOnlinePlayers(gameData.players);
        setSetupCompleted(gameData.setupCompleted || {});
        setIsRankedGame(gameData.isRanked ?? true);
        setChatMessages(gameData.chatMessages || []); // Sync Chat
        
        // CRITICAL: Sync Turn History from Server
        // We use || [] to ensure we don't accidentally set undefined and break local logic
        if (gameData.moveHistory) {
            setTurnHistory(gameData.moveHistory);
        } else {
            setTurnHistory([]); 
        }
        
        setSelectedPiece(null); 
        setValidMoves([]);
        
        if (gameData.isGamePaused !== undefined) {
            setIsGamePaused(gameData.isGamePaused);
        }

        // Handle Rating Updates
        // 1. Check for 'finalRatings' (Winner-based end game from standard play)
        if (gameData.finalRatings && user && gameData.finalRatings[user.id]) {
            const newRating = gameData.finalRatings[user.id];
            const diff = newRating - user.rating;
            setFinalRatingChanges(prev => ({...prev, [myColorForThisUpdate || '']: diff}));

            if (user.rating !== newRating) {
                firebase.updateMyRating(user.id, newRating).catch(console.error);
                setUser(prev => prev ? ({...prev, rating: newRating}) : null);
            }
        }
        // 2. Check for updates in 'players' object (Resignation-based updates)
        else if (gameData.players && myColorForThisUpdate) {
            const myDataInGame = gameData.players[myColorForThisUpdate];
            if (myDataInGame && myDataInGame.rating !== user.rating) {
                const newRating = myDataInGame.rating;
                const diff = newRating - user.rating;
                setFinalRatingChanges(prev => ({...prev, [myColorForThisUpdate || '']: diff}));
                
                firebase.updateMyRating(user.id, newRating).catch(console.error);
                setUser(prev => prev ? ({...prev, rating: newRating}) : null);
            }
        }

        if (gameData.gamePhase === 'SETUP') {
          const playersInGame = SETUP_ORDER.filter(p => gameData.playerTypes[p]);
          const allPlayersDone = playersInGame.every(p => gameData.setupCompleted[p]);
          if (allPlayersDone) {
            if (myColorForThisUpdate === Player.White) {
               firebase.updateGame(onlineGameId, { gamePhase: 'PLAY', statusMessage: 'All pieces are set. White to move.' });
            }
          }
        }
      } else {
        // If the game document is deleted while we are in it, reset.
        if (appState === 'IN_GAME') {
            resetGame('MAIN_MENU');
            alert("The game has ended or was cancelled.");
        }
      }
    });
    return () => unsubscribe();
  }, [onlineGameId, user, resetGame, appState]);

  const handleSetUsername = (name: string) => {
    if (user) {
      const updatedUser = { ...user, name };
      firebase.updateUserProfile(updatedUser);
      firebase.setupPresence(updatedUser);
      setUser(updatedUser);
      setAppState('MAIN_MENU');
    }
  };

  const handleSendMessage = (text: string) => {
    if (onlineGameId && user) {
        const msg: ChatMessage = {
            id: Date.now().toString(), // Simple client-side ID for list keys before sync
            senderId: user.id,
            senderName: user.name,
            text,
            timestamp: null
        };
        firebase.sendChatMessage(onlineGameId, msg).catch(console.error);
    }
  };

  const toggleFullscreen = () => {
    if (!boardContainerRef.current) return;
    
    if (!document.fullscreenElement) {
        boardContainerRef.current.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  };


  // --- GLOBAL PAUSE HANDLER ---
  const handleToggleGlobalPause = () => {
      const newState = !isGamePaused;
      setIsGamePaused(newState);
      if (onlineGameId) {
          firebase.updateGame(onlineGameId, { isGamePaused: newState });
      }
  };

  // --- AI LOGIC ---
  const aiWorkerRef = useRef<{ worker: Worker; url: string } | null>(null);

  const isAiCalculator = useMemo(() => {
    if (!onlineGameId) return true; 
    if (!myColor) return false; 

    const activeHumanParticipants = SETUP_ORDER.filter(p => 
        playerTypes[p] === 'ONLINE_HUMAN' && !leftPlayers.includes(p)
    );

    return activeHumanParticipants.length > 0 && activeHumanParticipants[0] === myColor;
  }, [onlineGameId, myColor, playerTypes, leftPlayers]);
  
  const handleAiResignation = (resigningPlayer: Player) => {
        const newBoard = boardState.map(row => 
            row.map(cell => cell?.piece?.player === resigningPlayer ? { ...cell, piece: null } : cell)
        );
        
        const newEliminated = [...eliminatedPlayers, resigningPlayer];
        const activePlayers = SETUP_ORDER.filter(p => !newEliminated.includes(p) && !leftPlayers.includes(p));
        
        let nextPlayer: Player = currentPlayer; 
        let newWinner: Player | null = null;
        let newMessage = `${PLAYER_COLORS[resigningPlayer].name} has resigned (No valid moves).`;

        if (activePlayers.length <= 1) {
            newWinner = activePlayers[0] || null;
            newMessage = `${PLAYER_COLORS[resigningPlayer].name} eliminated. ${newWinner ? PLAYER_COLORS[newWinner].name + ' wins!' : 'Game Over.'}`;
        } else {
            const currentIndex = SETUP_ORDER.indexOf(resigningPlayer);
            let nextIndex = (currentIndex + 1) % SETUP_ORDER.length;
            while (!activePlayers.includes(SETUP_ORDER[nextIndex])) {
                nextIndex = (nextIndex + 1) % SETUP_ORDER.length;
            }
            nextPlayer = SETUP_ORDER[nextIndex];
            newMessage = `${PLAYER_COLORS[resigningPlayer].name} eliminated. ${PLAYER_COLORS[nextPlayer].name}'s turn.`;
        }

        setBoardState(newBoard);
        setEliminatedPlayers(newEliminated);
        setStatusMessage(newMessage);
        setCurrentPlayer(nextPlayer);
        
        if (newWinner !== null || activePlayers.length <= 1) {
             setWinner(newWinner);
             setGamePhase('GAME_OVER');
        }
        
        setSelectedPiece(null);
        setValidMoves([]);
        
        if (onlineGameId) {
            // If online, update firebase
             firebase.updateGame(onlineGameId, {
                boardState: newBoard,
                eliminatedPlayers: newEliminated,
                currentPlayer: nextPlayer,
                winner: newWinner || undefined,
                gamePhase: newWinner !== null ? 'GAME_OVER' : 'PLAY',
                statusMessage: newMessage
            });
        }
  };

  useEffect(() => {
    const gameIsRunning = gamePhase === 'PLAY' && winner === null;
    const isAiTurn = gameIsRunning && playerTypes[currentPlayer]?.startsWith('AI');
    const shouldCalculate = isAiTurn && isAiCalculator && !isGamePaused;

    if (isAiTurn && isGamePaused) {
        setStatusMessage(`Game Paused (AI Waiting)`);
    }

    if (shouldCalculate) {
      setStatusMessage(`${PLAYER_COLORS[currentPlayer].name} is thinking...`);

      const timeoutId = setTimeout(() => {
        const depth = playerTypes[currentPlayer] === PlayerType.AIEasy ? 2 : 3;
        const activePlayers = SETUP_ORDER.filter(p => !eliminatedPlayers.includes(p) && !leftPlayers.includes(p));
        const { worker, url } = findBestMove(boardState, currentPlayer, activePlayers, depth, positionHistory);
        
        aiWorkerRef.current = { worker, url };
        
        worker.onmessage = (e) => {
          const bestMove = e.data;
          if (aiWorkerRef.current && worker === aiWorkerRef.current.worker) {
            if (bestMove) {
              movePiece(bestMove.from, bestMove.to, bestMove.promotion);
            } else {
                // AI returned null (Resignation / Crash / No Moves)
                handleAiResignation(currentPlayer);
            }
          }
        };

        worker.onerror = (e) => {
          console.error('AI worker error', e);
          handleAiResignation(currentPlayer);
        };
      }, 500); // 500ms delay to allow UI to render 'Thinking...' and prevent 'instant' moves

      return () => {
        clearTimeout(timeoutId);
      };
    }

    return () => {
      if (aiWorkerRef.current) {
        aiWorkerRef.current.worker.terminate();
        URL.revokeObjectURL(aiWorkerRef.current.url);
        aiWorkerRef.current = null;
      }
    };
  }, [currentPlayer, gamePhase, winner, playerTypes, eliminatedPlayers, leftPlayers, onlineGameId, isAiCalculator, isGamePaused, boardState]);
  
  // Online AI Setup
  useEffect(() => {
    if (gamePhase !== 'SETUP' || !onlineGameId) return;
    SETUP_ORDER.forEach(player => {
      const isAiToSetup = playerTypes[player]?.startsWith('AI') && !setupCompleted[player];
      if(isAiToSetup && isAiCalculator) { 
        const boardAfterAISetup = getAiSetup(boardState, player, PIECES_TO_SETUP);
        firebase.updateGame(onlineGameId, { boardState: boardAfterAISetup, [`setupCompleted.${player}`]: true });
      }
    });
  }, [gamePhase, playerTypes, setupCompleted, boardState, onlineGameId, isAiCalculator]);

  useEffect(() => {
    if (onlineGameId || gamePhase !== 'SETUP') return;
    
    const allPlayersInGame = Object.keys(playerTypes) as Player[];
    const allPlayersSetup = allPlayersInGame.every(p => setupCompleted[p]);

    if (allPlayersSetup) {
      setGamePhase('PLAY');
      setCurrentPlayer(Player.White);
      setStatusMessage('All pieces are set. White to move.');
      const initialHistoryEntry: HistoryEntry = {
        boardState, scores, capturedPieces, eliminatedPlayers, leftPlayers, currentPlayer: Player.White, statusMessage: 'All pieces are set. White to move.', duelingState
      };
      setFullHistory([initialHistoryEntry]);
    }
  }, [setupCompleted, gamePhase, onlineGameId, playerTypes]);
    
  // --- MOVE LOGIC ---
  const processTurnEnd = (boardAfterMove: (BoardCell | null)[][], movingPlayer: Player, updatedScores: any, updatedCapturedPieces: any, from: Coordinates, to: Coordinates) => {
    let currentEliminated = [...eliminatedPlayers];
    let newBoard = boardAfterMove;
    let turnMessage = '';
    let didCheckmate = false;
    let newWinner: Player | null | undefined = undefined; 

    const activePlayersBeforeMove = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));

    // 1. Check for eliminations
    const opponents = activePlayersBeforeMove.filter(p => p !== movingPlayer);
    for (const opponent of opponents) {
        let opponentEliminated = false;
        let pointsWinner: Player | null = movingPlayer;

        if (isCheckmate(opponent, newBoard)) {
            turnMessage = `${PLAYER_COLORS[opponent].name} has been checkmated!`;
            opponentEliminated = true;
            didCheckmate = true;
        } else if (isStalemate(opponent, newBoard)) {
            turnMessage = `${PLAYER_COLORS[opponent].name} is stalemated!`;
            const activeOpponentsForStalemate = activePlayersBeforeMove.filter(p => p !== opponent);
            pointsWinner = determineStalemateWinner(opponent, newBoard, activeOpponentsForStalemate);
            opponentEliminated = true;
        }

        if (opponentEliminated) {
            if (pointsWinner) updatedScores[pointsWinner] += 13;
            currentEliminated.push(opponent);
            const remainingPlayersAfterElimination = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));
            if (remainingPlayersAfterElimination.length > 1) {
              newBoard = newBoard.map(row => row.map(cell => (cell?.piece?.player === opponent ? { ...cell, piece: null } : cell)));
            }
            break; 
        }
    }

    // 2. Check for game over
    const remainingPlayers = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));
    
    if (isDrawByInsufficientMaterial(newBoard, remainingPlayers)) {
        newWinner = null; // null indicates a draw
        turnMessage = "Draw by insufficient material!";
    } else if (remainingPlayers.length <= 1) {
        newWinner = remainingPlayers[0] || null;
        turnMessage = `${turnMessage} ${newWinner ? `${PLAYER_COLORS[newWinner].name} is the winner!` : 'Game is a draw!'}`;
    }

    let nextPlayer: Player;
    let newDuelingState: DuelingState = duelingState;
    const activePlayersAfterMove = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));
    const newlyCheckedOpponents = activePlayersAfterMove.filter(p => p !== movingPlayer && isKingInCheck(p, newBoard));

    if (duelingState) {
        if (movingPlayer === duelingState.defender) {
            nextPlayer = duelingState.attacker;
            turnMessage = `Check defended! ${PLAYER_COLORS[duelingState.attacker].name} gets a bonus move.`;
        }
        else if (movingPlayer === duelingState.attacker) {
            newDuelingState = null;
            if (newlyCheckedOpponents.length === 1 && !didCheckmate) {
                newDuelingState = { attacker: movingPlayer, defender: newlyCheckedOpponents[0] };
                nextPlayer = newlyCheckedOpponents[0];
                turnMessage = `${PLAYER_COLORS[movingPlayer].name} checks again! ${PLAYER_COLORS[newlyCheckedOpponents[0]].name} must respond.`;
            } else {
                const movingPlayerIndex = activePlayersAfterMove.indexOf(movingPlayer);
                nextPlayer = activePlayersAfterMove[(movingPlayerIndex + 1) % activePlayersAfterMove.length];
                turnMessage = `Duel ended. Turn proceeds to ${PLAYER_COLORS[nextPlayer].name}.`;
                 if (newlyCheckedOpponents.length > 1) {
                    turnMessage = `${PLAYER_COLORS[movingPlayer].name} checks multiple players! Turn proceeds to ${PLAYER_COLORS[nextPlayer].name}.`;
                }
            }
        } else {
            newDuelingState = null;
            const movingPlayerIndex = activePlayersAfterMove.indexOf(movingPlayer);
            nextPlayer = activePlayersAfterMove[(movingPlayerIndex + 1) % activePlayersAfterMove.length];
        }
    } else { 
        if (newlyCheckedOpponents.length === 1 && !didCheckmate) {
            newDuelingState = { attacker: movingPlayer, defender: newlyCheckedOpponents[0] };
            nextPlayer = newlyCheckedOpponents[0];
            turnMessage = `${PLAYER_COLORS[movingPlayer].name} checks ${PLAYER_COLORS[newlyCheckedOpponents[0]].name}! ${PLAYER_COLORS[newlyCheckedOpponents[0]].name} must respond.`;
        } else {
            const movingPlayerIndex = activePlayersAfterMove.indexOf(movingPlayer);
            nextPlayer = activePlayersAfterMove[(movingPlayerIndex + 1) % activePlayersAfterMove.length];
            if (newlyCheckedOpponents.length > 1) {
                turnMessage = `${PLAYER_COLORS[movingPlayer].name} checks multiple players!`;
            }
        }
    }
    
    if (!turnMessage) {
        const nextPlayerInCheck = isKingInCheck(nextPlayer, newBoard);
        turnMessage = `${PLAYER_COLORS[nextPlayer].name}'s turn${nextPlayerInCheck ? '. You are in check!' : '.'}`;
    }
    
    const pieceThatMoved = (newBoard[to.row][to.col] as BoardCell).piece as Piece;
    const wasCapture = updatedCapturedPieces[movingPlayer].length > (capturedPieces[movingPlayer] || []).length;
    const capturedPiece = wasCapture ? updatedCapturedPieces[movingPlayer][updatedCapturedPieces[movingPlayer].length - 1] : null;

    const isAnyOpponentInCheck = newlyCheckedOpponents.length > 0;
    const isAnyOpponentCheckmated = didCheckmate;
    const notation = getAlgebraicNotation(from, to, pieceThatMoved, capturedPiece, isAnyOpponentInCheck, isAnyOpponentCheckmated);
    const playerColor = movingPlayer.toLowerCase() as 'white' | 'black' | 'gray';
    
    // --- SYNCHRONOUS HISTORY CALCULATION ---
    let updatedTurnHistory = [...turnHistory];
    
    if (playerColor === 'white') {
        updatedTurnHistory.push({ turn: updatedTurnHistory.length + 1, [playerColor]: notation });
    } else {
        if (updatedTurnHistory.length === 0) {
            updatedTurnHistory.push({ turn: 1, [playerColor]: notation });
        } else {
            const lastTurn = { ...updatedTurnHistory[updatedTurnHistory.length - 1] };
            lastTurn[playerColor] = notation;
            updatedTurnHistory[updatedTurnHistory.length - 1] = lastTurn;
        }
    }
    
    setTurnHistory(updatedTurnHistory); // Update local state
    setPositionHistory(prev => [...prev, boardToString(newBoard, nextPlayer)]);

    const finalGameState: any = {
        boardState: newBoard,
        currentPlayer: nextPlayer,
        eliminatedPlayers: currentEliminated,
        scores: updatedScores,
        capturedPieces: updatedCapturedPieces,
        duelingState: newDuelingState,
        statusMessage: turnMessage,
        gamePhase: newWinner !== undefined ? 'GAME_OVER' : 'PLAY',
        moveHistory: updatedTurnHistory // Send to Firebase
    };
    
    if (newWinner !== undefined) {
      finalGameState.winner = newWinner;
    }
    
    if (onlineGameId) {
        if (newWinner !== undefined && onlinePlayers && isAiCalculator) {
            const allParticipants = SETUP_ORDER.map(color => {
                if (onlinePlayers[color]) {
                    return { id: onlinePlayers[color]!.id, rating: onlinePlayers[color]!.rating, color };
                }
                return null;
            }).filter(p => p !== null) as { id: string; rating: number; color: Player }[];

            if (allParticipants.length >= 2 && isRankedGame) {
                const newRatings = calculateNewRatings(allParticipants, newWinner);
                firebase.updateGame(onlineGameId, finalGameState, newRatings);
            } else {
                firebase.updateGame(onlineGameId, finalGameState);
            }
        } else {
            firebase.updateGame(onlineGameId, finalGameState);
        }
    } else {
        const { winner: finalWinner, gamePhase: finalPhase, ...restOfState } = finalGameState;
        setBoardState(restOfState.boardState);
        setCurrentPlayer(restOfState.currentPlayer);
        setEliminatedPlayers(restOfState.eliminatedPlayers);
        setScores(restOfState.scores);
        setCapturedPieces(restOfState.capturedPieces);
        setDuelingState(restOfState.duelingState);
        setStatusMessage(restOfState.statusMessage);
        setGamePhase(finalPhase as GamePhase);
        if (finalWinner !== undefined) {
          setWinner(finalWinner);
        }
        setFullHistory(prev => [...prev, { 
            boardState: restOfState.boardState,
            scores: restOfState.scores,
            capturedPieces: restOfState.capturedPieces,
            eliminatedPlayers: restOfState.eliminatedPlayers,
            leftPlayers: leftPlayers,
            currentPlayer: restOfState.currentPlayer,
            statusMessage: restOfState.statusMessage,
            duelingState: restOfState.duelingState
        }]);
    }
  };
  
  const movePiece = (from: Coordinates, to: Coordinates, promotionChoice?: PieceType) => {
    const movingPlayer = currentPlayer;
    const newBoard = JSON.parse(JSON.stringify(boardState));
    
    const pieceToMove = (newBoard[from.row][from.col] as BoardCell).piece as Piece;
    const capturedPiece = (newBoard[to.row][to.col] as BoardCell).piece;
    let newScores = { ...scores };
    let newCapturedPieces = { ...capturedPieces };

    if (capturedPiece) {
      newScores[movingPlayer] += PIECE_SCORES[capturedPiece.type];
      newCapturedPieces[movingPlayer] = [...newCapturedPieces[movingPlayer], capturedPiece];
    }

    pieceToMove.hasMoved = true;
    if (pieceToMove.type === PieceType.Bishop) {
      pieceToMove.justSwitchedDiagonal = from.row === to.row || from.col === to.col;
    }

    (newBoard[to.row][to.col] as BoardCell).piece = pieceToMove;
    (newBoard[from.row][from.col] as BoardCell).piece = null;
    
    setSelectedPiece(null);
    setValidMoves([]);

    const needsPromotion = isPromotionMove(pieceToMove, to);

    // AI or Online moves often come with promotionChoice pre-filled
    if (needsPromotion && promotionChoice) {
        (newBoard[to.row][to.col] as BoardCell).piece = { ...pieceToMove, type: promotionChoice };
        processTurnEnd(newBoard, movingPlayer, newScores, newCapturedPieces, from, to);
    } else if (needsPromotion) {
        setPromotionState({ from, to, player: movingPlayer });
        if (onlineGameId) {
            firebase.updateGame(onlineGameId, { boardState: newBoard, gamePhase: 'PROMOTION' });
        } else {
            setBoardState(newBoard);
            setGamePhase('PROMOTION');
        }
    } else {
        processTurnEnd(newBoard, movingPlayer, newScores, newCapturedPieces, from, to);
    }
  };
  
  const handleCellClick = (coords: Coordinates) => {
    if (appState === 'SANDBOX_SETUP') {
      handleSandboxPlacement(coords);
      return;
    }
    
    // Allow clicking on board to place pieces during setup phase (For mobile / non-drag users)
    if (gamePhase === 'SETUP') {
       if (draggedPieceInfo) {
           handleDropOnBoard(coords);
       }
       return;
    }
    
    if (gamePhase !== 'PLAY' || winner !== null || reviewIndex !== null) return;

    const isMyTurn = (onlineGameId && myColor === currentPlayer) || 
                   (!onlineGameId && playerTypes[currentPlayer] === PlayerType.Human);

    if (isGamePaused && playerTypes[currentPlayer]?.startsWith('AI')) return;
    if (!isMyTurn) return;

    if (selectedPiece) {
      if (validMoves.some(m => m.row === coords.row && m.col === coords.col)) {
        movePiece(selectedPiece, coords);
      } else {
        setSelectedPiece(null);
        setValidMoves([]);
      }
    } else {
      const piece = boardState[coords.row][coords.col]?.piece;
      if (piece && piece.player === currentPlayer) {
        setSelectedPiece(coords);
        setValidMoves(getValidMoves(piece, coords, boardState));
      }
    }
  };
  
  const handlePromotionSelect = (promotedPieceType: PieceType) => {
    if (!promotionState) return;
    const { from, to, player } = promotionState;
    const newBoard = JSON.parse(JSON.stringify(boardState));
    (newBoard[to.row][to.col] as BoardCell).piece = { player, type: promotedPieceType, hasMoved: true };
    setPromotionState(null);
    processTurnEnd(newBoard, player, scores, capturedPieces, from, to);
  };
  
  const advanceLocalSetupTurn = (completedPlayerIndex: number) => {
    const nextHumanIndex = SETUP_ORDER.findIndex((p, idx) => idx > completedPlayerIndex && playerTypes[p] === PlayerType.Human);
    if (nextHumanIndex !== -1) {
        setLocalSetupPlayerIndex(nextHumanIndex);
        setStatusMessage(`${PLAYER_COLORS[SETUP_ORDER[nextHumanIndex]].name}, place your pieces.`);
    } else {
        setLocalSetupPlayerIndex(null); // All humans are done, game will start via useEffect
    }
  };

  const handleStartLocalGame = (config: { types: { [key in Player]: PlayerType } }) => {
    resetGame('IN_GAME');
    setPlayerTypes(config.types);
    
    let boardAfterSetup = generateInitialBoard();
    const newSetupCompleted: { [key in Player]?: boolean } = {};
    const newPiecesToPlace: { [key in Player]?: PieceType[] } = {};

    SETUP_ORDER.forEach(player => {
        if (config.types[player].startsWith('AI')) {
            boardAfterSetup = getAiSetup(boardAfterSetup, player, PIECES_TO_SETUP);
            newSetupCompleted[player] = true;
        } else {
            newSetupCompleted[player] = false;
            newPiecesToPlace[player] = [...PIECES_TO_SETUP];
        }
    });
    
    const firstHumanIndex = SETUP_ORDER.findIndex(p => config.types[p] === PlayerType.Human);
    setLocalSetupPlayerIndex(firstHumanIndex !== -1 ? firstHumanIndex : null);
    
    setBoardState(boardAfterSetup);
    setPositionHistory([boardToString(boardAfterSetup, Player.White)]);
    setSetupCompleted(newSetupCompleted);
    setPiecesToPlaceByPlayer(newPiecesToPlace);
    setGamePhase('SETUP');
    const firstHumanPlayer = firstHumanIndex !== -1 ? SETUP_ORDER[firstHumanIndex] : Player.White;
    setStatusMessage(`${PLAYER_COLORS[firstHumanPlayer].name}, place your pieces.`);
  };

  const handleSandboxSetup = () => {
    resetGame('SANDBOX_SETUP');
    setBoardState(generateEmptyBoard());
    setSandboxAvailablePieces(JSON.parse(JSON.stringify(initialSandboxPieces)));
    setStatusMessage('Sandbox Mode: Place pieces anywhere.');
  };
  
  const handleStartFromSandbox = () => {
    const playersOnBoard = new Set<Player>();
    for (const row of boardState) {
        for (const cell of row) {
            if (cell?.piece) {
                playersOnBoard.add(cell.piece.player);
            }
        }
    }

    const playersToEliminate = SETUP_ORDER.filter(p => !playersOnBoard.has(p));
    
    setAppState('IN_GAME');
    setGamePhase('PLAY');
    setPlayerTypes({
        [Player.White]: PlayerType.Human,
        [Player.Black]: PlayerType.Human,
        [Player.Gray]: PlayerType.Human,
    });

    const firstPlayer = SETUP_ORDER.find(p => playersOnBoard.has(p)) || Player.White;
    setCurrentPlayer(firstPlayer);
    setStatusMessage(`Game started from custom position. ${PLAYER_COLORS[firstPlayer].name} to move.`);
    
    setSelectedPiece(null);
    setValidMoves([]);
    setWinner(null);
    setEliminatedPlayers(playersToEliminate);
    setLeftPlayers([]);
    setScores(initialScores);
    setCapturedPieces(initialCapturedPieces);
    setPromotionState(null);
    setDuelingState(null);
    setSandboxSelectedPiece(null);
    setPositionHistory([boardToString(boardState, firstPlayer)]);

    const initialHistoryEntry: HistoryEntry = {
        boardState, scores: initialScores, capturedPieces: initialCapturedPieces, eliminatedPlayers: playersToEliminate, leftPlayers: [], currentPlayer: firstPlayer, statusMessage: `Game started from custom position. ${PLAYER_COLORS[firstPlayer].name} to move.`, duelingState: null
    };
    setFullHistory([initialHistoryEntry]);
  };

  const handleEnterOnlineLobby = () => setAppState('ONLINE_LOBBY');
  
  const handleGameStarted = (gameId: string) => {
    setOnlineGameId(gameId);
    setAppState('IN_GAME');
  };
  
  const handleDropOnBoard = (coords: Coordinates) => {
    if (!draggedPieceInfo) return;
    const { player, type } = draggedPieceInfo;

    if (validMoves.some(m => m.row === coords.row && m.col === coords.col)) {
        if (onlineGameId) {
            firebase.updateGameWithTransaction(onlineGameId, (gameData) => {
                const newBoard = JSON.parse(JSON.stringify(gameData.boardState));
                (newBoard[coords.row][coords.col] as BoardCell).piece = { player, type, hasMoved: false };
                const updates: any = { boardState: newBoard };

                const placedPieces = gameData.boardState.flat().filter(c => c?.piece?.player === player && PIECES_TO_SETUP.includes(c.piece.type));
                
                if (placedPieces.length + 1 >= PIECES_TO_SETUP.length) {
                    updates[`setupCompleted.${player}`] = true;
                }
                return updates;
            });
        } else {
          // Local Game Logic
          const newBoard = JSON.parse(JSON.stringify(boardState));
          (newBoard[coords.row][coords.col] as BoardCell).piece = { player, type, hasMoved: false };
          const newPiecesForPlayer = (piecesToPlaceByPlayer[player] || []).filter((p, i) => i !== (piecesToPlaceByPlayer[player] || []).indexOf(type));
          setBoardState(newBoard);
          setPiecesToPlaceByPlayer(prev => ({...prev, [player]: newPiecesForPlayer }));

          if (newPiecesForPlayer.length === 0) {
            setSetupCompleted(prev => ({ ...prev, [player]: true }));
            const playerIndex = SETUP_ORDER.indexOf(player);
            advanceLocalSetupTurn(playerIndex);
          }
        }
    }
    setDraggedPieceInfo(null);
    setValidMoves([]);
  };

  const handleRandomSetupForPlayer = (player: Player) => {
    if (!player) return;
    if (onlineGameId) {
        firebase.updateGameWithTransaction(onlineGameId, (gameData) => {
            const piecesToRandomlyPlace: PieceType[] = [];
            const neededPieceCounts: { [key in PieceType]?: number } = {};
            PIECES_TO_SETUP.forEach(t => { neededPieceCounts[t] = (neededPieceCounts[t] || 0) + 1; });
            gameData.boardState.flat().forEach(c => {
                if(c?.piece?.player === player && PIECES_TO_SETUP.includes(c.piece.type) && neededPieceCounts[c.piece.type]) {
                    neededPieceCounts[c.piece.type]!--;
                }
            });
            (Object.keys(neededPieceCounts) as PieceType[]).forEach(type => {
                for (let i = 0; i < neededPieceCounts[type]!; i++) { piecesToRandomlyPlace.push(type); }
            });

            if (piecesToRandomlyPlace.length > 0) {
                const newBoard = getAiSetup(gameData.boardState, player, piecesToRandomlyPlace);
                return { boardState: newBoard, [`setupCompleted.${player}`]: true };
            }
            return { [`setupCompleted.${player}`]: true };
        });
    } else {
        const piecesToRandomlyPlace = piecesToPlaceByPlayer[player] || [];
        if (piecesToRandomlyPlace.length === 0) return;
        const newBoard = getAiSetup(boardState, player, piecesToRandomlyPlace);
        setBoardState(newBoard);
        setPiecesToPlaceByPlayer(prev => ({ ...prev, [player]: [] }));
        setSetupCompleted(prev => ({ ...prev, [player]: true }));
        const playerIndex = SETUP_ORDER.indexOf(player);
        advanceLocalSetupTurn(playerIndex);
    }
  };

   useEffect(() => {
    if (gamePhase !== 'SETUP' || !draggedPieceInfo) {
      setValidMoves([]);
      return;
    }
    const { player } = draggedPieceInfo;
    setValidMoves(SETUP_ZONES[player].filter(c => !boardState[c.row][c.col]?.piece));
  }, [gamePhase, draggedPieceInfo, boardState]);

  const handleSandboxPlacement = (coords: Coordinates) => {
    const newBoard = JSON.parse(JSON.stringify(boardState));
    const newAvailablePieces = JSON.parse(JSON.stringify(sandboxAvailablePieces));
    const cellToModify = (newBoard[coords.row][coords.col] as BoardCell);
    const existingPiece = cellToModify.piece;

    if (existingPiece) {
        newAvailablePieces[existingPiece.player][existingPiece.type]++;
    }
    cellToModify.piece = null;

    if (sandboxSelectedPiece && sandboxSelectedPiece !== 'ERASER') {
        const { player, type } = sandboxSelectedPiece;
        if (newAvailablePieces[player][type] > 0) {
            cellToModify.piece = { player, type, hasMoved: true };
            newAvailablePieces[player][type]--;
        }
    }
    
    setBoardState(newBoard);
    setSandboxAvailablePieces(newAvailablePieces);
  };

  const handleBackToMenuClick = useCallback(() => {
    if (onlineGameId && appState === 'IN_GAME' && winner === null) {
      setShowLeaveConfirmation(true);
    } else {
      resetGame('MAIN_MENU');
    }
  }, [onlineGameId, appState, winner, resetGame]);

  const handleConfirmLeave = async () => {
    setShowLeaveConfirmation(false);
    if (onlineGameId && myColor && user) {
      let updatedUserRating: number | null = null;

      await firebase.runTransaction(firebase.db, async (transaction) => {
        const gameRef = firebase.doc(firebase.db, "games", onlineGameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;

        const gameData = gameDoc.data();
        const boardAsArray = firebase.boardFromFirestore(gameData.boardState);
        const currentLeftPlayers = gameData.leftPlayers || [];
        if (currentLeftPlayers.includes(myColor)) return;

        const newLeftPlayers = [...currentLeftPlayers, myColor];
        const remainingPlayers = SETUP_ORDER.filter(p =>
          !newLeftPlayers.includes(p) && !gameData.eliminatedPlayers.includes(p)
        );

        // --- CALCULATE RATING PENALTY ---
        let playersUpdate = gameData.players;
        const isRanked = gameData.isRanked ?? true; // Default to true if not set

        if (isRanked && gameData.players) {
            const meInfo = { id: user.id, rating: gameData.players[myColor].rating, color: myColor };
            
            // Opponents are active players
            const opponentInfos = remainingPlayers.map(p => {
                const pData = gameData.players[p];
                return pData ? { id: pData.id, rating: pData.rating, color: p } : null;
            }).filter(p => p !== null) as { id: string, rating: number, color: Player }[];

            if (opponentInfos.length > 0) {
                const resignationRatings = calculateResignationRatings(meInfo, opponentInfos);
                
                // 1. Update Leaver's Rating (Me) immediately in Users Collection
                if (resignationRatings[user.id]) {
                    updatedUserRating = resignationRatings[user.id]; // Capture for local state update
                    console.log(`Applying resignation penalty to ${user.name}: ${resignationRatings[user.id]}`);
                    const userRef = firebase.doc(firebase.db, "users", user.id);
                    transaction.update(userRef, { rating: resignationRatings[user.id] });
                }

                // 2. Update 'players' object in Game Document so others can see new ratings
                playersUpdate = { ...gameData.players };
                Object.keys(resignationRatings).forEach(uid => {
                    const pColor = Object.keys(playersUpdate).find(c => playersUpdate[c].id === uid);
                    if (pColor) {
                        playersUpdate[pColor] = { ...playersUpdate[pColor], rating: resignationRatings[uid] };
                    }
                });
            }
        }

        const updates: any = {
            leftPlayers: newLeftPlayers,
            players: playersUpdate 
        };

        if (remainingPlayers.length <= 1 && isRanked) {
          // --- GAME OVER (Last Man Standing) - Ranked Logic ---
          const finalWinner = remainingPlayers[0] || null; 
          updates.statusMessage = finalWinner 
            ? `${PLAYER_COLORS[finalWinner].name} wins by resignation!` 
            : "Game Over (All players left)";
          updates.gamePhase = 'GAME_OVER';
          updates.winner = finalWinner;
          // Note: calculateResignationRatings already distributed the points incrementally.
          // No need to calculate final winner bonus again here.

        } else if (remainingPlayers.length <= 1 && !isRanked) {
             // --- GAME OVER (Last Man Standing) - Unranked Logic ---
             // Allow unranked games to end gracefully without ratings
             const finalWinner = remainingPlayers[0] || null; 
             updates.statusMessage = finalWinner 
                ? `${PLAYER_COLORS[finalWinner].name} wins by resignation!` 
                : "Game Over (All players left)";
             updates.gamePhase = 'GAME_OVER';
             updates.winner = finalWinner;

        } else {
          // --- GAME CONTINUES ---
          const newBoard = boardAsArray.map(row =>
            row.map(cell =>
              cell?.piece?.player === myColor ? { ...cell, piece: null } : cell
            )
          );

          updates.boardState = firebase.boardToFirestore(newBoard);
          updates.statusMessage = `${PLAYER_COLORS[myColor].name} has left the game.`;
          
          let newCurrentPlayer = gameData.currentPlayer;
          if (gameData.currentPlayer === myColor) {
            let nextPlayerIndex = SETUP_ORDER.indexOf(myColor);
            while (true) {
              nextPlayerIndex = (nextPlayerIndex + 1) % SETUP_ORDER.length;
              const potentialNextPlayer = SETUP_ORDER[nextPlayerIndex];
              // In unranked games, we might want to continue even if only 1 human is left vs AI
              if (remainingPlayers.includes(potentialNextPlayer)) {
                newCurrentPlayer = potentialNextPlayer;
                break;
              }
            }
          }
          updates.currentPlayer = newCurrentPlayer;
        }

        transaction.update(gameRef, updates);
      });

      // --- CRITICAL FIX: Update Local State Immediately ---
      if (updatedUserRating !== null) {
          setUser(prev => prev ? { ...prev, rating: updatedUserRating } : null);
      }
    }
    resetGame('MAIN_MENU');
  };

  // --- REVIEW MODE LOGIC ---
  const handleMoveHistoryClick = (moveIndex: number) => {
      if (gamePhase === 'GAME_OVER' && !onlineGameId) {
          setReviewIndex(moveIndex);
      }
  };

  const handleContinueFromPosition = () => {
      if (reviewIndex === null || !fullHistory[reviewIndex]) return;

      const reviewState = fullHistory[reviewIndex];
      
      resetGame('IN_GAME');

      setBoardState(reviewState.boardState);
      setScores(reviewState.scores);
      setCapturedPieces(reviewState.capturedPieces);
      setEliminatedPlayers(reviewState.eliminatedPlayers);
      setLeftPlayers(reviewState.leftPlayers);
      setCurrentPlayer(reviewState.currentPlayer);
      setStatusMessage(`Game continued from a previous position. ${PLAYER_COLORS[reviewState.currentPlayer].name}'s turn.`);
      setDuelingState(reviewState.duelingState);
      setGamePhase('PLAY');
      
      const newFullHistory = fullHistory.slice(0, reviewIndex + 1);
      setFullHistory(newFullHistory);

      const numMovesMade = newFullHistory.length - 1;
      const turnsToKeep = Math.ceil(numMovesMade / 3);
      const slicedTurnHistory = turnHistory.slice(0, turnsToKeep);
      setTurnHistory(slicedTurnHistory);
  };
  
  const handleExportHistory = () => {
      let content = `Tri-Chess Game History\n\n`;
      content += `#\tWhite\t\tBlack\t\tGray\n`;
      content += `--------------------------------------------------\n`;
      turnHistory.forEach(turn => {
          content += `${turn.turn}\t${turn.white || ''}\t\t${turn.black || ''}\t\t${turn.gray || ''}\n`;
      });

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tri-chess-history.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // --- RENDER LOGIC ---
  const isReviewing = reviewIndex !== null;
  const displayedState = isReviewing ? fullHistory[reviewIndex!] : { boardState, scores, capturedPieces, eliminatedPlayers, leftPlayers, currentPlayer, statusMessage, duelingState };

  // Only show pause if it's a local game AND there is at least one AI player
  const canShowPause = !onlineGameId && Object.values(playerTypes).some(type => type.startsWith('AI'));

  // Define sizing classes for Fullscreen vs Normal
  const cellHeightClass = isFullscreen ? "h-[4.2vw] landscape:h-[7.5vh]" : "h-5 sm:h-7 md:h-9 lg:h-12";
  const cellWidthClass = isFullscreen ? "w-[4.2vw] landscape:w-[7.5vh]" : "w-5 sm:w-7 md:w-9 lg:w-12";
  const boardCellSizeClass = `${cellWidthClass} ${cellHeightClass}`;


  if (!isFirebaseConfigValid(firebaseConfig)) return <FirebaseSetupInstructions />;
  if (authStatus === 'CHECKING') return <div className="min-h-screen flex items-center justify-center">Authenticating...</div>;
  if (authError) return <AuthErrorScreen message={authError} onRetry={() => window.location.reload()} />;
  if (!user || appState === 'GETTING_USERNAME') return <UsernameModal onSetUsername={handleSetUsername} />;
  
  if (appState === 'MAIN_MENU') return <MainMenu onLocalGameSetup={() => setAppState('LOCAL_SETUP')} onOnlineGame={handleEnterOnlineLobby} onSandbox={handleSandboxSetup} onShowRules={() => setAppState('RULES')} />;
  if (appState === 'LOCAL_SETUP') return <GameSetup onStart={handleStartLocalGame} onBack={() => setAppState('MAIN_MENU')} />;
  if (appState === 'ONLINE_LOBBY') return <OnlineLobby user={user} onGameStarted={handleGameStarted} onCancel={() => resetGame('MAIN_MENU')} />;
  if (appState === 'RULES') return <RulesModal onClose={() => setAppState('MAIN_MENU')} />;
  
  const localPlayerToSetup = localSetupPlayerIndex !== null ? SETUP_ORDER[localSetupPlayerIndex] : null;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-2 sm:p-4 font-sans">
      <ConfirmationModal
        isOpen={showLeaveConfirmation}
        title="Leave Game?"
        message={isRankedGame 
            ? "WARNING: Leaving now will count as a LOSS and reduce your rating. Are you sure?" 
            : "Are you sure you want to leave? The game will continue for others."}
        onConfirm={handleConfirmLeave}
        onCancel={() => setShowLeaveConfirmation(false)}
        confirmText={isRankedGame ? "Leave & Lose Rating" : "Leave Game"}
        cancelText="Stay"
      />
      <ConfirmationModal
        isOpen={showContinueVsAiModal}
        title="Opponent Left"
        message="Your opponent has left the game. Do you want to continue playing against the AI?"
        onConfirm={() => setShowContinueVsAiModal(false)}
        onCancel={() => handleConfirmLeave()} // Correctly call handleConfirmLeave to exit
        confirmText="Continue"
        cancelText="Exit Game"
      />
       {gamePhase === 'PROMOTION' && promotionState && (
        <PromotionModal player={promotionState.player} onSelect={handlePromotionSelect} />
      )}
      <div className={`w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-center gap-4 md:gap-8 ${isFullscreen ? 'h-screen justify-center' : ''}`}>
        
        {/* CENTER COLUMN: BOARD */}
        <div className={`order-2 md:order-1 flex flex-col items-center gap-4 ${isFullscreen ? 'justify-center h-full w-full' : ''}`}>
           {/* WRAPPER FOR FULLSCREEN */}
           <div 
             ref={boardContainerRef} 
             className={`relative rounded-xl overflow-hidden flex items-center justify-center p-2 transition-all duration-300 ${isFullscreen ? 'bg-gray-900 w-full h-full' : 'bg-gray-900/0'}`}
           >
              {/* Fullscreen Toggle Button */}
              <button 
                  onClick={toggleFullscreen}
                  className="absolute top-4 right-4 z-20 p-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-full shadow-lg opacity-70 hover:opacity-100 transition-opacity"
                  title="Toggle Fullscreen"
              >
                  {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                  )}
              </button>

              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1">
                  {/* Left Ranks */}
                  <div className="flex flex-col justify-around items-center h-full row-start-1 col-start-1">
                      {Array.from({ length: 10 }, (_, i) => 10 - i).map(rank => (
                          <span key={`rank-l-${rank}`} className={`text-gray-500 text-base font-mono flex items-center justify-center w-6 ${cellHeightClass}`}>{rank}</span>
                      ))}
                  </div>

                  <Board
                    boardState={displayedState.boardState}
                    selectedPiece={selectedPiece}
                    validMoves={validMoves}
                    gamePhase={gamePhase || ''}
                    onCellClick={handleCellClick}
                    onCellDrop={handleDropOnBoard}
                    onCellDragOver={(e) => e.preventDefault()}
                    customCellSize={boardCellSizeClass}
                  />

                  {/* Right Ranks */}
                  <div className="flex flex-col justify-around items-center h-full row-start-1 col-start-3">
                      {Array.from({ length: 10 }, (_, i) => 10 - i).map(rank => (
                          <span key={`rank-r-${rank}`} className={`text-gray-500 text-base font-mono flex items-center justify-center w-6 ${cellHeightClass}`}>{rank}</span>
                      ))}
                  </div>
              </div>
          </div>
          
          {/* Bottom Files - Only show if not full screen or if desired (can hide in phone landscape to save space) */}
          <div className={`flex justify-around items-center w-full px-[32px] ${isFullscreen ? 'hidden landscape:hidden' : ''}`}>
              {Array.from({ length: 20 }, (_, i) => String.fromCharCode(97 + i)).map(file => (
                  <span key={`file-${file}`} className={`text-gray-500 text-base font-mono text-center ${cellWidthClass}`}>{file}</span>
              ))}
          </div>

          {/* CHAT WIDGET (Below Board) - Hide in Fullscreen */}
          {!isFullscreen && onlineGameId && user && (
             <div className="w-full max-w-[90vw] md:max-w-none px-4">
                 <ChatWidget 
                    messages={chatMessages} 
                    currentUser={user} 
                    onSendMessage={handleSendMessage} 
                 />
             </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONTROLS - Hide in Fullscreen */}
        {!isFullscreen && (
        <div className="order-1 md:order-2 w-full md:w-auto md:min-w-[300px] flex flex-col gap-4">
            <div className="flex justify-end">
                <button onClick={handleBackToMenuClick} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md shadow-md text-sm transition-transform hover:scale-105">
                   Back to Menu
                </button>
            </div>
            
            {gamePhase === 'SETUP' && !onlineGameId && localPlayerToSetup && (
              <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl mb-4">
                  <PieceStash 
                      playerToSetup={localPlayerToSetup} 
                      piecesToPlace={piecesToPlaceByPlayer[localPlayerToSetup] || []} 
                      onPieceDragStart={(type) => setDraggedPieceInfo({ player: localPlayerToSetup, type })}
                      onPieceDragEnd={() => setDraggedPieceInfo(null)}
                      onRandomPlacement={() => handleRandomSetupForPlayer(localPlayerToSetup)}
                      selectedPieceType={draggedPieceInfo?.type}
                      onPieceSelect={(type) => setDraggedPieceInfo(prev => prev?.type === type ? null : { player: localPlayerToSetup, type })}
                  />
              </div>
            )}

            {gamePhase === 'SETUP' && onlineGameId && myColor && !setupCompleted[myColor] && (() => {
                const piecesToPlace: PieceType[] = [];
                const neededPieceCounts: { [key in PieceType]?: number } = {};
                PIECES_TO_SETUP.forEach(t => { neededPieceCounts[t] = (neededPieceCounts[t] || 0) + 1; });
                boardState.flat().forEach(c => {
                    if(c?.piece?.player === myColor && PIECES_TO_SETUP.includes(c.piece.type) && neededPieceCounts[c.piece.type]) {
                        neededPieceCounts[c.piece.type]!--;
                    }
                });
                (Object.keys(neededPieceCounts) as PieceType[]).forEach(type => {
                    for (let i = 0; i < neededPieceCounts[type]!; i++) { piecesToPlace.push(type); }
                });
                return (
                    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl">
                        <PieceStash 
                            playerToSetup={myColor} 
                            piecesToPlace={piecesToPlace}
                            onPieceDragStart={(type) => setDraggedPieceInfo({ player: myColor, type })} 
                            onPieceDragEnd={() => setDraggedPieceInfo(null)}
                            onRandomPlacement={() => handleRandomSetupForPlayer(myColor)}
                            selectedPieceType={draggedPieceInfo?.type}
                            onPieceSelect={(type) => setDraggedPieceInfo(prev => prev?.type === type ? null : { player: myColor, type })}
                        />
                    </div>
                );
            })()}
            
            {appState === 'SANDBOX_SETUP' && (
              <>
                <SandboxPalette
                    selectedPiece={sandboxSelectedPiece}
                    onSelect={setSandboxSelectedPiece}
                    availablePieces={sandboxAvailablePieces}
                />
                <button
                    onClick={handleStartFromSandbox}
                    disabled={!sandboxValidation.isValid}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-lg shadow-lg transition-transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    Start Game from this Position
                </button>
                 {!sandboxValidation.isValid && (
                    <p className="text-sm text-yellow-400 mt-2 text-center">
                        {sandboxValidation.message}
                    </p>
                )}
              </>
            )}

            {(appState === 'SANDBOX_SETUP' || gamePhase && (gamePhase !== 'SETUP' || (gamePhase === 'SETUP' && !onlineGameId && localSetupPlayerIndex === null))) && (
              <GameInfoPanel 
                currentPlayer={displayedState.currentPlayer} 
                statusMessage={displayedState.statusMessage} 
                playerNames={playerNames}
                isAiGame={Object.values(playerTypes).every(t => t !== 'ONLINE_HUMAN' && t !== 'HUMAN')}
                isPaused={isGamePaused}
                onTogglePause={canShowPause ? handleToggleGlobalPause : undefined}
              />
            )}
            
            {(gamePhase === 'PLAY' || gamePhase === 'PROMOTION' || gamePhase === 'GAME_OVER') && (
              <>
                <PlayerStats 
                  scores={displayedState.scores} 
                  capturedPieces={displayedState.capturedPieces} 
                  eliminatedPlayers={displayedState.eliminatedPlayers} 
                  leftPlayers={displayedState.leftPlayers}
                  currentPlayer={displayedState.currentPlayer}
                  myColor={myColor}
                  playerNames={playerNames}
                  finalRatingChanges={finalRatingChanges}
                  playerTypes={playerTypes}
                />
                <MoveHistory 
                    turnHistory={turnHistory} 
                    isReviewable={!onlineGameId && gamePhase === 'GAME_OVER'}
                    onMoveClick={handleMoveHistoryClick}
                />
                {!onlineGameId && (
                  <div className="mt-2 flex flex-col gap-2">
                    {isReviewing && (
                      <button
                        onClick={handleContinueFromPosition}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105"
                      >
                        Continue Game From This Position
                      </button>
                    )}
                     <button
                        onClick={handleExportHistory}
                        className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg shadow-md"
                      >
                        Export Move History
                      </button>
                  </div>
                )}
              </>
            )}
        </div>
        )}
      </div>
    </div>
  );
};

export default App;
