

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BoardCell, Coordinates, Piece, PieceType, Player, PlayerType, AppState, OnlineUser, OnlineGame } from './types';
// FIX: Import SETUP_ORDER directly and remove alias
import { generateInitialBoard, PIECES_TO_SETUP, SETUP_ZONES, PLAYER_COLORS, PIECE_SCORES, generateEmptyBoard, initialSandboxPieces, firebaseConfig, isFirebaseConfigValid, SETUP_ORDER } from './constants';
import * as firebase from './services/firebase';
import { getValidMoves, isKingInCheck, isCheckmate, isStalemate, determineStalemateWinner, isPromotionMove } from './services/gameLogic';
import { findBestMove, getAiSetup } from './services/aiPlayer';
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


type GamePhase = 'SETUP' | 'PLAY' | 'PROMOTION' | 'GAME_OVER';
type DuelingState = { attacker: Player; defender: Player } | null;

// FIX: Removed local definition of SETUP_ORDER, as it's now imported from constants.ts
const initialScores = { [Player.Gray]: 0, [Player.White]: 0, [Player.Black]: 0 };
const initialCapturedPieces: { [key in Player]: Piece[] } = { [Player.Gray]: [], [Player.White]: [], [Player.Black]: [] };

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
  
  // UI State
  const [selectedPiece, setSelectedPiece] = useState<Coordinates | null>(null);
  const [validMoves, setValidMoves] = useState<Coordinates[]>([]);
  const [promotionState, setPromotionState] = useState<{ coords: Coordinates; player: Player } | null>(null);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);

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
  
  const leftPlayersRef = useRef(leftPlayers);
  leftPlayersRef.current = leftPlayers;

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
          const onlineUser: OnlineUser = { id: firebaseUser.uid, name: userData?.name || 'Anonymous', isOnline: true };
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

  // --- Real-time Game Sync ---
  useEffect(() => {
    if (!onlineGameId || !user) return;

    const unsubscribe = firebase.onGameUpdate(onlineGameId, (gameData) => {
      if (gameData) {
        const oldLeftPlayers = leftPlayersRef.current;
        
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
        setSelectedPiece(null); // Deselect piece on any update to prevent stale state
        setValidMoves([]);

        const newlyLeftPlayer = gameData.leftPlayers?.find(p => !oldLeftPlayers.includes(p));
        const amIStillInGame = myColorForThisUpdate && !gameData.leftPlayers?.includes(myColorForThisUpdate);

        if (newlyLeftPlayer && amIStillInGame) {
             setStatusMessage(`${PLAYER_COLORS[newlyLeftPlayer].name} has left the game.`);
             const originalHumansCount = Object.values(gameData.playerTypes).filter(t => t === 'ONLINE_HUMAN').length;
             const remainingPlayers = SETUP_ORDER.filter(p => !gameData.leftPlayers?.includes(p) && !gameData.eliminatedPlayers.includes(p));
             const remainingHumansCount = remainingPlayers.filter(p => gameData.playerTypes[p] === 'ONLINE_HUMAN').length;

             if (originalHumansCount === 2 && remainingHumansCount === 1) {
                 setShowContinuePrompt(true);
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
      }
    });
    return () => unsubscribe();
  }, [onlineGameId, user]);

  const handleSetUsername = (name: string) => {
    if (user) {
      const updatedUser = { ...user, name };
      firebase.updateUserProfile(updatedUser);
      firebase.setupPresence(updatedUser);
      setUser(updatedUser);
      setAppState('MAIN_MENU');
    }
  };

  // --- AI LOGIC ---
  useEffect(() => {
    const isAiTurn = gamePhase === 'PLAY' && !winner && playerTypes[currentPlayer]?.startsWith('AI');
    if (isAiTurn) {
      const currentActor = playerTypes[currentPlayer] as PlayerType;
      setStatusMessage(`${PLAYER_COLORS[currentPlayer].name} is thinking...`);
      const timeoutId = setTimeout(() => {
        const depth = currentActor === PlayerType.AIEasy ? 2 : 3;
        const activePlayers = SETUP_ORDER.filter(p => !eliminatedPlayers.includes(p) && !leftPlayers.includes(p));
        const bestMove = findBestMove(boardState, currentPlayer, activePlayers, depth);
        if (bestMove) movePiece(bestMove.from, bestMove.to);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [currentPlayer, gamePhase, winner, playerTypes, boardState, eliminatedPlayers, leftPlayers]);
  
  // Online AI Setup
  useEffect(() => {
    if (gamePhase !== 'SETUP' || !onlineGameId) return;
    SETUP_ORDER.forEach(player => {
      const isAiToSetup = playerTypes[player]?.startsWith('AI') && !setupCompleted[player];
      if(isAiToSetup && myColor === Player.White) { // Only White's client runs AI setup
        const boardAfterAISetup = getAiSetup(boardState, player, PIECES_TO_SETUP);
        firebase.updateGame(onlineGameId, { boardState: boardAfterAISetup, [`setupCompleted.${player}`]: true });
      }
    });
  }, [gamePhase, playerTypes, setupCompleted, boardState, onlineGameId, myColor]);

  // Local Game: Post-setup transition
  useEffect(() => {
    if (onlineGameId || gamePhase !== 'SETUP') return;
    
    // Check if all players (human and AI) have completed their setup
    const allPlayersInGame = Object.keys(playerTypes) as Player[];
    const allPlayersSetup = allPlayersInGame.every(p => setupCompleted[p]);

    if (allPlayersSetup) {
      setGamePhase('PLAY');
      setCurrentPlayer(Player.White);
      setStatusMessage('All pieces are set. White to move.');
    }
  }, [setupCompleted, gamePhase, onlineGameId, playerTypes]);


  // --- GAME RESET & SETUP ---
  const resetGame = (backTo: AppState = 'MAIN_MENU') => {
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
    setShowContinuePrompt(false);
    setAppState(backTo);
  };
    
  // --- MOVE LOGIC ---
  const processTurnEnd = (boardAfterMove: (BoardCell | null)[][], movingPlayer: Player, updatedScores: any, updatedCapturedPieces: any) => {
    let currentEliminated = [...eliminatedPlayers];
    let newBoard = boardAfterMove;
    let turnMessage = '';
    let didCheckmate = false;

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
            newBoard = newBoard.map(row => row.map(cell => (cell?.piece?.player === opponent ? { ...cell, piece: null } : cell)));
            break; 
        }
    }

    // 2. Check for game over
    const remainingPlayers = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));
    let newWinner = winner;
    if (remainingPlayers.length <= 1) {
        newWinner = remainingPlayers[0] || null;
        turnMessage = `${turnMessage} ${newWinner ? `${PLAYER_COLORS[newWinner].name} is the winner!` : 'Game is a draw!'}`;
    }

    // 3. Determine next player
    let nextPlayer: Player;
    const activePlayersAfterMove = SETUP_ORDER.filter(p => !currentEliminated.includes(p) && !leftPlayers.includes(p));
    let newDuelingState = duelingState;

    if (didCheckmate) {
        newDuelingState = null;
        const movingPlayerIndex = activePlayersAfterMove.indexOf(movingPlayer);
        nextPlayer = activePlayersAfterMove[(movingPlayerIndex + 1) % activePlayersAfterMove.length];
    } else if (duelingState && movingPlayer === duelingState.defender) {
        nextPlayer = duelingState.attacker;
        turnMessage = `Check defended! Turn returns to ${PLAYER_COLORS[duelingState.attacker].name}.`;
        if (!isKingInCheck(duelingState.defender, newBoard)) newDuelingState = null;
    } else {
        const newlyCheckedOpponent = activePlayersAfterMove.find(p => p !== movingPlayer && isKingInCheck(p, newBoard));
        if (newlyCheckedOpponent) {
            newDuelingState = { attacker: movingPlayer, defender: newlyCheckedOpponent };
            nextPlayer = newlyCheckedOpponent;
            turnMessage = `${PLAYER_COLORS[movingPlayer].name} checks ${PLAYER_COLORS[nextPlayer].name}!`;
        } else {
            newDuelingState = null;
            const movingPlayerIndex = activePlayersAfterMove.indexOf(movingPlayer);
            nextPlayer = activePlayersAfterMove[(movingPlayerIndex + 1) % activePlayersAfterMove.length];
        }
    }

    if (!turnMessage) {
        const nextPlayerInCheck = isKingInCheck(nextPlayer, newBoard);
        turnMessage = `${PLAYER_COLORS[nextPlayer].name}'s turn${nextPlayerInCheck ? '. You are in check!' : '.'}`;
    }
    
    const finalGameState = {
        boardState: newBoard,
        currentPlayer: nextPlayer,
        eliminatedPlayers: currentEliminated,
        scores: updatedScores,
        capturedPieces: updatedCapturedPieces,
        duelingState: newDuelingState,
        statusMessage: turnMessage,
        gamePhase: newWinner ? 'GAME_OVER' : 'PLAY',
        winner: newWinner,
    };
    
    if (onlineGameId) {
        firebase.updateGame(onlineGameId, finalGameState);
    } else {
        setBoardState(finalGameState.boardState);
        setCurrentPlayer(finalGameState.currentPlayer);
        setEliminatedPlayers(finalGameState.eliminatedPlayers);
        setScores(finalGameState.scores);
        setCapturedPieces(finalGameState.capturedPieces);
        setDuelingState(finalGameState.duelingState);
        setStatusMessage(finalGameState.statusMessage);
        setGamePhase(finalGameState.gamePhase as GamePhase);
        setWinner(finalGameState.winner);
    }
  };
  
  const movePiece = (from: Coordinates, to: Coordinates) => {
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

    if (isPromotionMove(pieceToMove, to)) {
        setPromotionState({ coords: to, player: movingPlayer });
        if (onlineGameId) {
            firebase.updateGame(onlineGameId, { boardState: newBoard, gamePhase: 'PROMOTION' });
        } else {
            setBoardState(newBoard);
            setGamePhase('PROMOTION');
        }
    } else {
        processTurnEnd(newBoard, movingPlayer, newScores, newCapturedPieces);
    }
  };
  
  const handleCellClick = (coords: Coordinates) => {
    if (appState === 'SANDBOX_SETUP') {
      handleSandboxPlacement(coords);
      return;
    }
    
    if (gamePhase !== 'PLAY' || winner) return;

    const isMyTurn = (onlineGameId && myColor === currentPlayer) || 
                   (!onlineGameId && playerTypes[currentPlayer] === PlayerType.Human);

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
    const { coords, player } = promotionState;
    const newBoard = JSON.parse(JSON.stringify(boardState));
    (newBoard[coords.row][coords.col] as BoardCell).piece = { player, type: promotedPieceType, hasMoved: true };
    setPromotionState(null);
    processTurnEnd(newBoard, player, scores, capturedPieces);
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

  const handleLocalGameSetup = (config: { types: { [key in Player]: PlayerType } }) => {
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
    
    // Keep the board from the sandbox
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
    
    // Reset all other relevant game states to their initial values
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
        const newBoard = JSON.parse(JSON.stringify(boardState));
        (newBoard[coords.row][coords.col] as BoardCell).piece = { player, type, hasMoved: false };
        
        if (onlineGameId) {
          const remainingPieces = (piecesToPlaceByPlayer[player] || []).filter((p, i) => i !== (piecesToPlaceByPlayer[player] || []).indexOf(type));
          const isSetupNowComplete = remainingPieces.length === 0;

          const updateData: any = { boardState: newBoard };
          if (isSetupNowComplete) {
              updateData[`setupCompleted.${player}`] = true;
          }
          firebase.updateGame(onlineGameId, updateData);
        } else {
          // Local Game Logic
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
    
    let piecesToRandomlyPlace: PieceType[] = [];
    if(onlineGameId) {
        const neededPieceCounts: { [key in PieceType]?: number } = {};
        PIECES_TO_SETUP.forEach(type => { neededPieceCounts[type] = (neededPieceCounts[type] || 0) + 1; });
        const placedPieceCounts: { [key in PieceType]?: number } = {};
        SETUP_ZONES[player].forEach(coord => {
            const piece = boardState[coord.row][coord.col]?.piece;
            if (piece && piece.player === player && PIECES_TO_SETUP.includes(piece.type)) {
                placedPieceCounts[piece.type] = (placedPieceCounts[piece.type] || 0) + 1;
            }
        });
        (Object.keys(neededPieceCounts) as PieceType[]).forEach(type => {
            const needed = neededPieceCounts[type] || 0;
            const placed = placedPieceCounts[type] || 0;
            for (let i = 0; i < needed - placed; i++) { piecesToRandomlyPlace.push(type); }
        });
    } else {
        piecesToRandomlyPlace = piecesToPlaceByPlayer[player] || [];
    }

    if (piecesToRandomlyPlace.length === 0) return;

    const newBoard = getAiSetup(boardState, player, piecesToRandomlyPlace);
    
    if (onlineGameId) {
        firebase.updateGame(onlineGameId, { boardState: newBoard, [`setupCompleted.${player}`]: true });
    } else {
        // Local Game Logic
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

  const handleBackToMenuClick = () => {
    if (onlineGameId && appState === 'IN_GAME' && !winner) {
      setShowLeaveConfirmation(true);
    } else {
      resetGame('MAIN_MENU');
    }
  };

  const handleConfirmLeave = () => {
    if (onlineGameId && myColor) {
      const newLeftPlayers = [...leftPlayers, myColor];
      firebase.updateGame(onlineGameId, { leftPlayers: newLeftPlayers });
    }
    resetGame('MAIN_MENU');
  };

  // --- RENDER LOGIC ---
  if (!isFirebaseConfigValid(firebaseConfig)) return <FirebaseSetupInstructions />;
  if (authStatus === 'CHECKING') return <div className="min-h-screen flex items-center justify-center">Authenticating...</div>;
  if (authError) return <AuthErrorScreen message={authError} onRetry={() => window.location.reload()} />;
  if (!user || appState === 'GETTING_USERNAME') return <UsernameModal onSetUsername={handleSetUsername} />;
  
  if (appState === 'MAIN_MENU') return <MainMenu onLocalGame={handleLocalGameSetup} onOnlineGame={handleEnterOnlineLobby} onSandbox={handleSandboxSetup} />;
  if (appState === 'ONLINE_LOBBY') return <OnlineLobby user={user} onGameStarted={handleGameStarted} onCancel={() => resetGame('MAIN_MENU')} />;
  
  const localPlayerToSetup = localSetupPlayerIndex !== null ? SETUP_ORDER[localSetupPlayerIndex] : null;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      <ConfirmationModal
        isOpen={showLeaveConfirmation}
        title="Leave Game?"
        message="Are you sure you want to leave this online match? This action cannot be undone."
        onConfirm={handleConfirmLeave}
        onCancel={() => setShowLeaveConfirmation(false)}
        confirmText="Leave"
        cancelText="Stay"
      />
       <ConfirmationModal
        isOpen={showContinuePrompt}
        title="Player Left"
        message="An opponent has left the game. Do you want to continue playing against the AI?"
        onConfirm={() => setShowContinuePrompt(false)}
        onCancel={() => resetGame('MAIN_MENU')}
        confirmText="Continue"
        cancelText="Leave Game"
      />
       {gamePhase === 'PROMOTION' && promotionState && (
        <PromotionModal player={promotionState.player} onSelect={handlePromotionSelect} />
      )}
      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-center gap-8">
        <div className="order-2 md:order-1 flex-grow">
          <Board
            boardState={boardState}
            selectedPiece={selectedPiece}
            validMoves={validMoves}
            gamePhase={gamePhase || ''}
            onCellClick={handleCellClick}
            onCellDrop={handleDropOnBoard}
            onCellDragOver={(e) => e.preventDefault()}
          />
        </div>
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
                  />
              </div>
            )}

            {gamePhase === 'SETUP' && onlineGameId && myColor && !setupCompleted[myColor] && (() => {
                const neededPieceCounts: { [key in PieceType]?: number } = {};
                PIECES_TO_SETUP.forEach(type => { neededPieceCounts[type] = (neededPieceCounts[type] || 0) + 1; });
                const placedPieceCounts: { [key in PieceType]?: number } = {};
                SETUP_ZONES[myColor].forEach(coord => {
                    const piece = boardState[coord.row][coord.col]?.piece;
                    if (piece && piece.player === myColor && PIECES_TO_SETUP.includes(piece.type)) {
                        placedPieceCounts[piece.type] = (placedPieceCounts[piece.type] || 0) + 1;
                    }
                });
                const remaining: PieceType[] = [];
                (Object.keys(neededPieceCounts) as PieceType[]).forEach(type => {
                    const needed = neededPieceCounts[type] || 0;
                    const placed = placedPieceCounts[type] || 0;
                    for (let i = 0; i < needed - placed; i++) { remaining.push(type); }
                });
                return (
                    <div className="w-full p-4 bg-gray-800/50 rounded-lg shadow-xl">
                        <PieceStash 
                            playerToSetup={myColor} 
                            piecesToPlace={remaining}
                            onPieceDragStart={(type) => setDraggedPieceInfo({ player: myColor, type })} 
                            onPieceDragEnd={() => setDraggedPieceInfo(null)}
                            onRandomPlacement={() => handleRandomSetupForPlayer(myColor)}
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
              <GameInfoPanel currentPlayer={currentPlayer} statusMessage={statusMessage} />
            )}
            
            {(gamePhase === 'PLAY' || gamePhase === 'PROMOTION' || gamePhase === 'GAME_OVER') && (
              <PlayerStats 
                scores={scores} 
                capturedPieces={capturedPieces} 
                eliminatedPlayers={eliminatedPlayers} 
                leftPlayers={leftPlayers}
                currentPlayer={currentPlayer}
                myColor={myColor}
              />
            )}
        </div>
      </div>
       <footer className="text-gray-500 text-sm mt-8">
        Tri-Chess by World-Class Senior Frontend React Engineer
      </footer>
    </div>
  );
};

export default App;
