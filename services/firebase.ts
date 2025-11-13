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
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
import { OnlineUser, Invite, OnlineGame, BoardCell, GameProposal } from "../types";

let firebaseApp: FirebaseApp;
let auth: Auth;
let db: Firestore;
let rtdb: Database;

let initialized = false;

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
export const updateUserProfile = async (user: OnlineUser) => {
  if (auth.currentUser) {
    await setDoc(doc(db, "users", auth.currentUser.uid), { name: user.name });
  }
};

export const getUserProfile = async (uid: string): Promise<{name: string} | null> => {
  const userDoc = await getDoc(doc(db, "users", uid));
  return userDoc.exists() ? userDoc.data() as {name: string} : null;
};

export const setupPresence = (user: OnlineUser) => {
  const uid = user.id;
  const userStatusRef = ref(rtdb, `/status/${uid}`);

  const isOfflineForRTDB = {
    id: uid,
    name: user.name,
    isOnline: false,
    last_changed: rtdbServerTimestamp(),
  };

  const isOnlineForRTDB = {
    id: uid,
    name: user.name,
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

export const onUsersChange = (callback: (users: OnlineUser[]) => void): (() => void) => {
  const statusRef = ref(rtdb, 'status');
  return onValue(statusRef, (snapshot) => {
    const users: OnlineUser[] = [];
    snapshot.forEach((childSnapshot) => {
      users.push(childSnapshot.val() as OnlineUser);
    });
    callback(users);
  });
};

// --- LOBBY & INVITES ---
export const sendInvite = async (fromUser: OnlineUser, toUser: OnlineUser) => {
  await addDoc(collection(db, "invites"), {
    from: { id: fromUser.id, name: fromUser.name },
    to: { id: toUser.id, name: toUser.name },
    status: 'pending',
    timestamp: serverTimestamp()
  });
};

export const onInvitesChange = (userId: string, callback: (invites: Invite[]) => void): (() => void) => {
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

  const unsubTo = onSnapshot(qTo, (snapshot) => {
    receivedInvites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite));
    combineAndCallback();
  });

  const unsubFrom = onSnapshot(qFrom, (snapshot) => {
    sentInvites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite));
    combineAndCallback();
  });

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

// --- MATCHMAKING ---
export const joinMatchmakingQueue = async (user: OnlineUser) => {
  await setDoc(doc(db, 'matchmakingQueue', user.id), { 
    id: user.id, 
    name: user.name, 
    timestamp: serverTimestamp() 
  });
};

export const leaveMatchmakingQueue = async (userId: string) => {
  await deleteDoc(doc(db, 'matchmakingQueue', userId));
};

export const onMatchmakingQueueChange = (callback: (users: (OnlineUser & {timestamp: any})[]) => void): (() => void) => {
  const q = query(collection(db, "matchmakingQueue"), orderBy("timestamp"));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map(doc => doc.data() as (OnlineUser & {timestamp: any}));
    callback(users);
  });
};

export const createGameFromQueue = async (players: { id: string; name: string; }[], gameData: Omit<OnlineGame, 'id'>): Promise<string> => {
  const gameId = await createGame(gameData);
  const batch = writeBatch(db);
  players.forEach(p => {
    batch.delete(doc(db, 'matchmakingQueue', p.id));
  });
  await batch.commit();
  return gameId;
}

// --- GAME PROPOSALS (2 players + AI) ---
export const createGameProposal = async (players: {id: string, name: string}[]): Promise<string> => {
    const batch = writeBatch(db);
    const proposalRef = doc(collection(db, "proposals"));
    
    const proposalData = {
        players: {
            [players[0].id]: { id: players[0].id, name: players[0].name },
            [players[1].id]: { id: players[1].id, name: players[1].name },
        },
        status: {
            [players[0].id]: 'pending',
            [players[1].id]: 'pending',
        },
        timestamp: serverTimestamp()
    };
    batch.set(proposalRef, proposalData);

    // Atomically remove players from queue so they don't get matched into another game.
    players.forEach(p => {
        const queueDocRef = doc(db, 'matchmakingQueue', p.id);
        batch.delete(queueDocRef);
    });
    
    await batch.commit();
    return proposalRef.id;
};

export const onProposalsChange = (userId: string, callback: (proposals: GameProposal[]) => void) => {
    const q = query(collection(db, "proposals"), where(`players.${userId}.id`, '==', userId));
    return onSnapshot(q, (snapshot) => {
        const proposals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameProposal));
        callback(proposals);
    });
};

export const acceptGameProposal = async (proposalId: string, userId: string) => {
    await updateDoc(doc(db, "proposals", proposalId), {
        [`status.${userId}`]: 'accepted'
    });
};

export const updateProposal = async (proposalId: string, data: Partial<GameProposal>) => {
    await updateDoc(doc(db, "proposals", proposalId), data);
};

export const deleteProposal = async (proposalId: string) => {
    await deleteDoc(doc(db, "proposals", proposalId));
};


// --- GAME MANAGEMENT ---
const boardToFirestore = (board: (BoardCell | null)[][]): { [key: string]: (BoardCell | null)[] } => {
    const boardMap: { [key: string]: (BoardCell | null)[] } = {};
    board.forEach((row, index) => {
        boardMap[index.toString()] = row;
    });
    return boardMap;
};

const boardFromFirestore = (boardMap: { [key: string]: (BoardCell | null)[] }): (BoardCell | null)[][] => {
    const board: (BoardCell | null)[][] = [];
    const keys = Object.keys(boardMap).map(k => parseInt(k, 10)).sort((a, b) => a - b);
    keys.forEach(key => {
        board[key] = boardMap[key.toString()];
    });
    return board;
};

export const createGame = async (gameData: Omit<OnlineGame, 'id'>): Promise<string> => {
  const { boardState, ...rest } = gameData;
  const firestoreReadyGameData = {
    ...rest,
    timestamp: serverTimestamp(),
    leftPlayers: [],
    boardState: boardToFirestore(boardState),
  };
  const docRef = await addDoc(collection(db, "games"), firestoreReadyGameData);

  // Create a notification for each player
  const batch = writeBatch(db);
  gameData.playerIds.forEach(playerId => {
    if (playerId.startsWith("AI_")) return;
    const notificationRef = doc(collection(db, `users/${playerId}/game_invitations`));
    batch.set(notificationRef, { gameId: docRef.id, timestamp: serverTimestamp() });
  });
  await batch.commit();

  return docRef.id;
};

export const updateGame = async (gameId: string, gameData: Partial<OnlineGame> | { [key: string]: any }) => {
  const firestoreReadyGameData: { [key: string]: any } = { ...gameData };
  if (gameData.boardState) {
    firestoreReadyGameData.boardState = boardToFirestore(gameData.boardState as (BoardCell | null)[][]);
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

export const onGameUpdate = (gameId: string, callback: (game: OnlineGame | null) => void): (() => void) => {
  return onSnapshot(doc(db, "games", gameId), (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const gameFromDb = {
        id: doc.id,
        ...data,
        boardState: boardFromFirestore(data.boardState)
      } as OnlineGame;
      callback(gameFromDb);
    } else {
      callback(null);
    }
  });
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
            // Clean up the notification
            deleteDoc(doc(db, `users/${userId}/game_invitations`, change.doc.id));
        }
      }
    });
  });
};

export const checkGameExists = async (gameId: string): Promise<boolean> => {
  if (!gameId) return false;
  const gameRef = doc(db, "games", gameId);
  const gameDoc = await getDoc(gameRef);
  return gameDoc.exists();
};
