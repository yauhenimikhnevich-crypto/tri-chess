
import { initializeApp, FirebaseApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously as firebaseSignInAnonymously,
  User as FirebaseUser,
  Auth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  Firestore,
  writeBatch,
  limit,
  runTransaction,
  getDocs,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export { doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp as rtdbServerTimestamp,
  Database
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../constants";
import { OnlineUser, Invite, OnlineGame, BoardCell, GameProposal, Player, ChatMessage } from "../types";

let firebaseApp: FirebaseApp;
let auth: Auth;
export let db: Firestore;
let rtdb: Database;

let initialized = false;

// --- Helper for Listener Errors ---
const handleListenerError = (context: string, onError?: (error: any) => void) => (error: any) => {
    if (error.code === 'permission-denied') {
        console.warn(`[${context}] Permission denied. Please check your Firebase Database Rules in the console.`);
    } else {
        console.error(`[${context}] Listener Error:`, error);
    }
    if (onError) onError(error);
};

export const boardToFirestore = (board: (BoardCell | null)[][]): { [key: string]: (BoardCell | null)[] } => {
    const boardMap: { [key: string]: (BoardCell | null)[] } = {};
    board.forEach((row, index) => {
        boardMap[index.toString()] = row;
    });
    return boardMap;
};

export const boardFromFirestore = (boardMap: { [key: string]: (BoardCell | null)[] }): (BoardCell | null)[][] => {
    const board: (BoardCell | null)[][] = [];
    if (!boardMap) return board; // Safety check
    const keys = Object.keys(boardMap).map(k => parseInt(k, 10)).sort((a, b) => a - b);
    keys.forEach(key => {
        board[key] = boardMap[key.toString()];
    });
    return board;
};


export const initialize = () => {
    if (initialized) return;
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    rtdb = getDatabase(firebaseApp);
    initialized = true;
};

// --- AUTHENTICATION ---
export const signIn = async (): Promise<FirebaseUser> => {
    const userCredential = await firebaseSignInAnonymously(auth);
    return userCredential.user;
}

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

// --- USER PROFILE & PRESENCE ---

// UPDATED: Transactional registration to ensure unique username
// Now handles idempotency (if user owns the username, allow update)
export const registerUser = async (user: Omit<OnlineUser, 'rating'>): Promise<void> => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  
  const normalizedUsername = user.name.toLowerCase().trim();
  const userRef = doc(db, "users", auth.currentUser.uid);
  const usernameRef = doc(db, "usernames", normalizedUsername);

  await runTransaction(db, async (transaction) => {
    const usernameDoc = await transaction.get(usernameRef);
    if (usernameDoc.exists()) {
      // If the username is taken, check if it belongs to the current user
      if (usernameDoc.data().uid !== auth.currentUser!.uid) {
        throw new Error("Username is already taken.");
      }
    }

    const userDoc = await transaction.get(userRef);

    // Create or Update user profile
    if (!userDoc.exists()) {
        transaction.set(userRef, { 
          name: user.name,
          createdAt: serverTimestamp(),
          rating: 1000 // Initial rating
        });
    } else {
        // If profile exists, just update name (in case of capitalization change)
        transaction.update(userRef, { name: user.name });
    }

    // Reserve username (if it didn't exist, or just to be safe)
    if (!usernameDoc.exists()) {
        transaction.set(usernameRef, { uid: auth.currentUser!.uid });
    }
  });
};

export const updateUserProfile = async (user: OnlineUser) => {
  if (auth.currentUser) {
    await updateDoc(doc(db, "users", auth.currentUser.uid), { name: user.name });
  }
};

export const updateMyRating = async (userId: string, newRating: number) => {
    // Security Rule allows: allow update: if request.auth.uid == userId;
    // This allows the client to update THEIR OWN rating based on game results.
    await updateDoc(doc(db, "users", userId), { rating: newRating });
};

export const getUserProfile = async (uid: string): Promise<OnlineUser | null> => {
  const userDoc = await getDoc(doc(db, "users", uid));
  return userDoc.exists() ? ({ id: userDoc.id, ...userDoc.data() } as OnlineUser) : null;
};

// --- NEW: Leaderboard ---
export const getLeaderboard = async (limitCount: number = 100): Promise<OnlineUser[]> => {
    const q = query(collection(db, "users"), orderBy("rating", "desc"), limit(limitCount));
    const querySnapshot = await getDocs(q); 
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OnlineUser));
};


export const setupPresence = (user: OnlineUser) => {
  const uid = user.id;
  const userStatusRef = ref(rtdb, `/status/${uid}`);

  const isOfflineForRTDB = {
    id: uid,
    name: user.name,
    rating: user.rating, // Keep rating in RTDB for quick lookup
    isOnline: false,
    last_changed: rtdbServerTimestamp(),
  };

  const isOnlineForRTDB = {
    id: uid,
    name: user.name,
    rating: user.rating,
    isOnline: true,
    last_changed: rtdbServerTimestamp(),
  };

  onValue(ref(rtdb, '.info/connected'), (snapshot) => {
    if (snapshot.val() === false) {
      return;
    }
    onDisconnect(userStatusRef).set(isOfflineForRTDB).then(() => {
      set(userStatusRef, isOnlineForRTDB);
    });
  });
};

export const onUsersChange = (callback: (users: OnlineUser[]) => void, onError?: (error: any) => void): (() => void) => {
  const statusRef = ref(rtdb, 'status');
  return onValue(statusRef, (snapshot) => {
    const users: OnlineUser[] = [];
    snapshot.forEach((childSnapshot) => {
      users.push(childSnapshot.val() as OnlineUser);
    });
    callback(users);
  }, (error) => {
      console.warn("RTDB: Error reading users (likely permissions):", error.message);
      if (onError) onError(error);
  });
};

// --- LOBBY & INVITES ---
export const sendInvite = async (fromUser: OnlineUser, toUser: OnlineUser, mode: 'VS_AI' | 'STANDARD' = 'STANDARD', proposalId?: string) => {
  await addDoc(collection(db, "invites"), {
    from: { id: fromUser.id, name: fromUser.name },
    to: { id: toUser.id, name: toUser.name },
    status: 'pending',
    mode: mode,
    proposalId: proposalId || null,
    timestamp: serverTimestamp()
  });
};

export const onInvitesChange = (userId: string, callback: (invites: Invite[]) => void, onError?: (error: any) => void): (() => void) => {
  const qTo = query(collection(db, "invites"), where('to.id', '==', userId));
  const qFrom = query(collection(db, "invites"), where('from.id', '==', userId));

  let receivedInvites: Invite[] = [];
  let sentInvites: Invite[] = [];
  
  const combineAndCallback = () => {
    const allInvitesMap = new Map<string, Invite>();
    [...receivedInvites, ...sentInvites].forEach(invite => {
      allInvitesMap.set(invite.id, invite);
    });
    
    const combined = Array.from(allInvitesMap.values());
    
    combined.sort((a, b) => {
      const tsA = (a.timestamp as any)?.toMillis() || 0;
      const tsB = (b.timestamp as any)?.toMillis() || 0;
      return tsB - tsA;
    });

    callback(combined);
  };

  const errorHandler = handleListenerError("Invites", onError);

  const unsubTo = onSnapshot(qTo, (snapshot) => {
    receivedInvites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite));
    combineAndCallback();
  }, errorHandler);

  const unsubFrom = onSnapshot(qFrom, (snapshot) => {
    sentInvites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite));
    combineAndCallback();
  }, errorHandler);

  return () => {
    unsubTo();
    unsubFrom();
  };
};

export const updateInvite = async (inviteId: string, data: Partial<Invite>) => {
  await updateDoc(doc(db, "invites", inviteId), data);
};
export const deleteInvite = async (inviteId: string) => {
    await deleteDoc(doc(db, "invites", inviteId));
};

// --- GAME PROPOSALS (3-Player Invite Logic) ---

export const createGameProposal = async (host: OnlineUser, invitedUserIds: string[]): Promise<string> => {
  const proposalRef = await addDoc(collection(db, "game_proposals"), {
    hostId: host.id,
    players: {
      [Player.White]: { id: host.id, name: host.name, rating: host.rating }
    },
    invitedUserIds: invitedUserIds,
    status: 'pending',
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(), // Add creation time for timeout logic
    aiVotes: {} // Initialize to allow updates
  });
  return proposalRef.id;
};

export const acceptGameProposal = async (proposalId: string, user: OnlineUser) => {
  const proposalRef = doc(db, "game_proposals", proposalId);
  
  await runTransaction(db, async (transaction) => {
    const proposalDoc = await transaction.get(proposalRef);
    if (!proposalDoc.exists()) {
      throw new Error("Game proposal no longer exists.");
    }
    
    const proposalData = proposalDoc.data() as GameProposal;
    if (proposalData.status !== 'pending' && proposalData.status !== 'negotiating_ai') {
       throw new Error("Game setup is already completed.");
    }

    // Assign role based on availability: Priority BLACK, then GRAY
    const players = proposalData.players;
    let assignedRole: Player | null = null;

    if (!players[Player.Black]) {
      assignedRole = Player.Black;
    } else if (!players[Player.Gray]) {
      assignedRole = Player.Gray;
    } else {
      throw new Error("Game proposal is full.");
    }

    const updatedPlayers = {
      ...players,
      [assignedRole]: { id: user.id, name: user.name, rating: user.rating }
    };

    transaction.update(proposalRef, { players: updatedPlayers });
  });
};

export const updateGameProposal = async (proposalId: string, data: Partial<GameProposal>) => {
    await updateDoc(doc(db, "game_proposals", proposalId), data);
};

export const deleteProposal = async (proposalId: string) => {
    await deleteDoc(doc(db, "game_proposals", proposalId));
};

export const submitProposalVote = async (proposalId: string, userId: string, vote: boolean) => {
    await updateDoc(doc(db, "game_proposals", proposalId), {
        [`aiVotes.${userId}`]: vote
    });
};

export const onProposalChange = (proposalId: string, callback: (proposal: GameProposal | null) => void) => {
   return onSnapshot(doc(db, "game_proposals", proposalId), (doc) => {
     if (doc.exists()) {
       callback({ id: doc.id, ...doc.data() } as GameProposal);
     } else {
       callback(null);
     }
   }, handleListenerError("ProposalChange"));
};

// --- MATCHMAKING ---
export const joinMatchmakingQueue = async (user: OnlineUser) => {
  await setDoc(doc(db, 'matchmakingQueue', user.id), { 
    id: user.id, 
    name: user.name, 
    rating: user.rating || 1000,
    timestamp: serverTimestamp() 
  });
};

export const leaveMatchmakingQueue = async (userId: string) => {
  await deleteDoc(doc(db, 'matchmakingQueue', userId));
};

export const onMatchmakingQueueChange = (callback: (users: (OnlineUser & {timestamp: any})[]) => void, onError?: (error: any) => void): (() => void) => {
  const q = query(collection(db, "matchmakingQueue"), orderBy("timestamp"));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map(doc => doc.data() as (OnlineUser & {timestamp: any}));
    callback(users);
  }, handleListenerError("MatchmakingQueue", onError));
};

export const createGameFromQueue = (players: { id: string; name: string; rating: number }[], gameData: Omit<OnlineGame, 'id'>): Promise<void> => {
  return runTransaction(db, async (transaction) => {
    const playerIds = players.map(p => p.id);
    const queueDocRefs = playerIds.map(id => doc(db, 'matchmakingQueue', id));

    const queueDocs = await Promise.all(queueDocRefs.map(ref => transaction.get(ref)));
    for (const doc of queueDocs) {
      if (!doc.exists()) {
        throw new Error("A player has left the matchmaking queue. Aborting game creation.");
      }
    }
    
    const newGameRef = doc(collection(db, "games"));
    const { boardState, ...rest } = gameData;
    const firestoreReadyGameData = {
      ...rest,
      timestamp: serverTimestamp(),
      leftPlayers: [],
      chatMessages: [], // Initialize chat
      boardState: boardToFirestore(boardState),
    };
    transaction.set(newGameRef, firestoreReadyGameData);

    gameData.playerIds.forEach(playerId => {
      if (playerId.startsWith("AI_")) return;
      const notificationRef = doc(collection(db, `users/${playerId}/game_invitations`));
      transaction.set(notificationRef, { gameId: newGameRef.id, timestamp: serverTimestamp() });
    });

    if (auth.currentUser) {
        const myRef = queueDocRefs.find(ref => ref.id === auth.currentUser?.uid);
        if (myRef) {
            transaction.delete(myRef);
        }
    }
  });
};

// --- GAME MANAGEMENT ---
export const createGame = async (gameData: Omit<OnlineGame, 'id'>): Promise<string> => {
  const { boardState, ...rest } = gameData;
  const firestoreReadyGameData = {
    ...rest,
    timestamp: serverTimestamp(),
    leftPlayers: [],
    chatMessages: [], // Initialize chat
    boardState: boardToFirestore(boardState),
  };
  const docRef = await addDoc(collection(db, "games"), firestoreReadyGameData);

  const batch = writeBatch(db);
  gameData.playerIds.forEach(playerId => {
    if (playerId.startsWith("AI_")) return;
    const notificationRef = doc(collection(db, `users/${playerId}/game_invitations`));
    batch.set(notificationRef, { gameId: docRef.id, timestamp: serverTimestamp() });
  });
  await batch.commit();

  return docRef.id;
};

// UPDATED: Now supports rating updates via finalRatings field in Game Document
export const updateGame = async (gameId: string, gameData: Partial<OnlineGame> | { [key: string]: any }, newRatings?: { [userId: string]: number }) => {
  const firestoreReadyGameData: { [key: string]: any } = { ...gameData };
  if (gameData.boardState) {
    firestoreReadyGameData.boardState = boardToFirestore(gameData.boardState as (BoardCell | null)[][]);
  }
  
  // If ratings are provided, we store them IN THE GAME DOCUMENT first.
  // Security rules allow game participants to update the game doc.
  // Security rules BLOCK participants from updating OTHER users' profiles directly.
  if (newRatings) {
      firestoreReadyGameData.finalRatings = newRatings;
  }

  await updateDoc(doc(db, "games", gameId), firestoreReadyGameData);
};

export const deleteGame = async (gameId: string) => {
  if (!gameId) return;
  await deleteDoc(doc(db, "games", gameId));
};

export const updateGameWithTransaction = async (gameId: string, updateFunction: (gameData: OnlineGame) => { [key: string]: any }) => {
  const gameRef = doc(db, "games", gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) {
        throw "Document does not exist!";
      }
      const currentGameData = {
        id: gameDoc.id,
        ...gameDoc.data(),
        boardState: boardFromFirestore(gameDoc.data().boardState)
      } as OnlineGame;
      
      const updates = updateFunction(currentGameData);
      
      const firestoreUpdates: { [key: string]: any } = { ...updates };
      if (updates.boardState) {
        firestoreUpdates.boardState = boardToFirestore(updates.boardState as (BoardCell | null)[][]);
      }

      transaction.update(gameRef, firestoreUpdates);
    });
  } catch (e) {
    console.error("Game update transaction failed: ", e);
  }
};

export const sendChatMessage = async (gameId: string, message: ChatMessage) => {
    const firestoreMessage = {
        ...message,
        timestamp: Date.now() // Use client timestamp for ArrayUnion safety
    };
    await updateDoc(doc(db, "games", gameId), {
        chatMessages: arrayUnion(firestoreMessage)
    });
};

export const onGameUpdate = (gameId: string, callback: (game: OnlineGame | null) => void): (() => void) => {
  return onSnapshot(doc(db, "games", gameId), (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const gameFromDb = {
        id: doc.id,
        ...data,
        boardState: boardFromFirestore(data.boardState),
        chatMessages: data.chatMessages || [] // Ensure chatMessages exists
      } as OnlineGame;
      callback(gameFromDb);
    } else {
      callback(null);
    }
  }, handleListenerError("GameUpdate"));
};

export const onGameInvitation = (userId: string, callback: (gameId: string) => void): (() => void) => {
  const q = query(
    collection(db, `users/${userId}/game_invitations`),
    orderBy('timestamp', 'desc'),
    limit(1)
  );

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const gameId = change.doc.data().gameId;
        if (gameId) {
            callback(gameId);
            deleteDoc(doc(db, `users/${userId}/game_invitations`, change.doc.id)).catch(console.error);
        }
      }
    });
  }, handleListenerError("GameInvitation"));
};

export const checkGameExists = async (gameId: string): Promise<boolean> => {
  if (!gameId) return false;
  const gameRef = doc(db, "games", gameId);
  const gameDoc = await getDoc(gameRef);
  return gameDoc.exists();
};
