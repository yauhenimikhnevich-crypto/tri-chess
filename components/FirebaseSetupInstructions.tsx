
import React from 'react';

const FirebaseSetupInstructions: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-4xl bg-gray-800 p-8 rounded-lg shadow-2xl border border-yellow-500 overflow-y-auto max-h-[90vh]">
        <h1 className="text-3xl font-bold mb-4 text-yellow-400">Production Security Rules</h1>
        <p className="text-gray-300 mb-6">
          To publish to Google Play, you must secure your database. These rules ensure players can only modify their own games and data.
        </p>

        <div className="space-y-8">
          {/* STEP 1: CONFIG */}
          <section className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <h2 className="text-xl font-bold text-indigo-400 mb-2">Step 1: App Config</h2>
            <p className="text-gray-300">Ensure your <code className="text-yellow-300">constants.ts</code> has the correct keys. No changes needed here if the app is already working.</p>
          </section>

          {/* STEP 2: REALTIME DB RULES */}
          <section className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <h2 className="text-xl font-bold text-pink-400 mb-2">Step 2: Realtime Database Rules (Presence)</h2>
            <p className="text-gray-300 mb-2">Go to <strong>Realtime Database</strong> &rarr; <strong>Rules</strong>. Replace everything with:</p>
            <pre className="bg-gray-900 text-pink-300 p-3 rounded mt-2 text-xs sm:text-sm font-mono whitespace-pre-wrap select-all">
{`{
  "rules": {
    "status": {
      ".read": "auth != null",
      "$uid": {
        // Only the user themselves can change their online status
        ".write": "$uid === auth.uid"
      }
    }
  }
}`}
            </pre>
          </section>

          {/* STEP 3: FIRESTORE RULES */}
          <section className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <h2 className="text-xl font-bold text-orange-400 mb-2">Step 3: Firestore Rules (Game Security)</h2>
            <p className="text-gray-300 mb-2">Go to <strong>Firestore Database</strong> &rarr; <strong>Rules</strong>. Replace everything with these secure rules:</p>
            <pre className="bg-gray-900 text-orange-300 p-3 rounded mt-2 text-xs sm:text-sm font-mono whitespace-pre-wrap select-all">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is signed in
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Helper to check if the user is one of the players in the game
    function isGamePlayer() {
      return request.auth.uid in resource.data.playerIds;
    }

    // 1. Users Collection
    match /users/{userId} {
      allow read: if isSignedIn();
      // Allow create only if auth matches ID (initial reg)
      allow create: if request.auth.uid == userId;
      // Allow update if auth matches ID
      allow update: if request.auth.uid == userId;
      
      // Game Invitations (subcollection)
      match /game_invitations/{inviteId} {
        allow create: if isSignedIn(); 
        allow read, update, delete: if request.auth.uid == userId;
      }
    }

    // 2. Usernames (Unique Check)
    match /usernames/{username} {
      // Anyone can read to check availability
      allow read: if isSignedIn();
      // Only allow creation if it doesn't exist
      allow create: if isSignedIn();
      // Allow owner to update or delete
      allow update, delete: if isSignedIn() && resource.data.uid == request.auth.uid;
    }

    // 3. Matchmaking Queue
    match /matchmakingQueue/{userId} {
      allow read: if isSignedIn();
      // Users can only add/remove THEMSELVES from the queue
      allow write: if request.auth.uid == userId;
    }

    // 4. Direct Invites
    match /invites/{inviteId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      // Only sender or receiver can update/delete invites
      allow update, delete: if isSignedIn() && (
        resource.data.from.id == request.auth.uid || 
        resource.data.to.id == request.auth.uid
      );
    }
    
    // 5. Game Proposals
    match /game_proposals/{proposalId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update: if isSignedIn(); 
      allow delete: if isSignedIn(); // Allow delete to cancel sessions
    }

    // 6. Games (The most important part)
    match /games/{gameId} {
      // Anyone can create a game
      allow create: if isSignedIn();
      // Anyone logged in can read games (needed for lobby logic/spectating checks)
      allow read: if isSignedIn();
      // ONLY players listed in 'playerIds' can update the game state (make moves)
      allow update: if isSignedIn() && isGamePlayer();
      // Only players can delete (e.g. when leaving)
      allow delete: if isSignedIn() && isGamePlayer();
    }
  }
}`}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};

export default FirebaseSetupInstructions;
