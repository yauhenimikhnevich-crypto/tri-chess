import React from 'react';

interface AuthErrorScreenProps {
  message: string;
  onRetry: () => void;
}

const AuthErrorScreen: React.FC<AuthErrorScreenProps> = ({ message, onRetry }) => {
  const isSecurityRuleError = message.toLowerCase().includes('security rules');

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-3xl bg-red-900/50 p-8 rounded-lg shadow-2xl border border-red-500 text-center">
        <h1 className="text-3xl font-bold mb-4 text-red-400">Connection Error</h1>
        <p className="text-gray-300 mb-6">
          Could not connect to the game server. Please check the error message below.
        </p>
        <code className="block bg-gray-800 p-4 rounded text-left text-sm text-red-300 overflow-x-auto mb-6">
          {message}
        </code>
        
        {isSecurityRuleError && (
          <div className="text-left bg-gray-800 p-4 rounded border border-yellow-500">
            <h2 className="font-bold text-yellow-400 mb-2">How to fix "Security Rules" error:</h2>
            <p className="text-sm text-gray-300">
              In your Firebase project, go to <strong>Firestore Database</strong> -&gt; <strong>Rules</strong> tab and replace the text with:
            </p>
            <pre className="bg-gray-900 text-green-300 p-2 rounded mt-1 mb-2 text-xs whitespace-pre-wrap">
              {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}
            </pre>
            <p className="text-sm text-gray-300 mt-2">
              Then, go to <strong>Realtime Database</strong> -&gt; <strong>Rules</strong> tab and replace the text with:
            </p>
            <pre className="bg-gray-900 text-green-300 p-2 rounded mt-1 text-xs whitespace-pre-wrap">
              {`{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}`}
            </pre>
             <p className="text-xs text-gray-400 mt-2">After saving the rules, click "Retry Connection".</p>
          </div>
        )}

        <button
          onClick={onRetry}
          className="mt-8 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg"
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
};

export default AuthErrorScreen;