import React from 'react';

const FirebaseSetupInstructions: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-3xl bg-gray-800 p-8 rounded-lg shadow-2xl border border-yellow-500">
        <h1 className="text-3xl font-bold mb-4 text-yellow-400">Firebase Configuration Required</h1>
        <p className="text-gray-300 mb-6">
          To enable online features, you need to connect this app to a free Firebase project. Please follow these steps:
        </p>
        <ol className="list-decimal list-inside text-left space-y-4 text-gray-200">
          <li>
            Go to the{' '}
            <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline font-semibold">
              Firebase Console
            </a>{' '}
            and create a new project.
          </li>
          <li>
            In your new project, enable the following services under the "Build" section:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>
                <strong>Authentication:</strong> Go to the "Sign-in method" tab and enable the{' '}
                <strong className="text-yellow-400">Anonymous</strong> provider.
              </li>
              <li>
                <strong>Firestore Database:</strong> Create a new database.
              </li>
              <li>
                <strong>Realtime Database:</strong> Create a new database.
              </li>
            </ul>
          </li>
          <li className="font-bold text-yellow-400">
            Configure Security Rules: By default, your databases are locked. You must allow access.
             <ul className="list-disc list-inside ml-6 mt-2 space-y-2 font-normal">
              <li>
                For <strong>Firestore Database</strong>, go to its "Rules" tab and replace the contents with:
                <pre className="bg-gray-900 text-green-300 p-2 rounded mt-1 text-xs whitespace-pre-wrap">
                  {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}
                </pre>
              </li>
              <li>
                For <strong>Realtime Database</strong>, go to its "Rules" tab and replace the contents with:
                <pre className="bg-gray-900 text-green-300 p-2 rounded mt-1 text-xs whitespace-pre-wrap">
                  {`{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}`}
                </pre>
              </li>
            </ul>
          </li>
          <li className="font-bold text-yellow-400">
            Create Firestore Indexes: For the invite system to work, you need to create two indexes.
             <ul className="list-disc list-inside ml-6 mt-2 space-y-2 font-normal">
              <li>
                In the <strong>Firestore Database</strong> section, go to the "Indexes" tab and click "Create Composite Index".
              </li>
              <li>
                <strong>Index 1 (for received invites):</strong>
                 <ul className="list-['>'] list-inside ml-4 mt-1">
                    <li>Collection ID: <code className="bg-gray-700 p-1 rounded text-sm">invites</code></li>
                    <li>Field 1: <code className="bg-gray-700 p-1 rounded text-sm">to.id</code> (Ascending)</li>
                    <li>Field 2: <code className="bg-gray-700 p-1 rounded text-sm">timestamp</code> (Descending)</li>
                 </ul>
              </li>
               <li>
                <strong>Index 2 (for sent invites):</strong>
                 <ul className="list-['>'] list-inside ml-4 mt-1">
                    <li>Collection ID: <code className="bg-gray-700 p-1 rounded text-sm">invites</code></li>
                    <li>Field 1: <code className="bg-gray-700 p-1 rounded text-sm">from.id</code> (Ascending)</li>
                    <li>Field 2: <code className="bg-gray-700 p-1 rounded text-sm">timestamp</code> (Descending)</li>
                 </ul>
              </li>
              <li className="text-xs text-gray-400">It may take a few minutes for the indexes to build after you create them.</li>
            </ul>
          </li>
          <li>
            Go to your Project Settings (click the gear icon <span className="font-mono text-lg">⚙️</span> next to "Project Overview") and scroll down to "Your apps".
          </li>
          <li>
            Click the web icon <strong className="font-mono text-2xl">(&lt;/&gt;)</strong> to register a new web app.
          </li>
          <li>
            Firebase will provide you with a <code className="bg-gray-700 p-1 rounded text-sm">firebaseConfig</code> object. Copy this object.
          </li>
          <li>
            In the code editor, open the file <code className="bg-gray-700 p-1 rounded text-sm">constants.ts</code> and paste your configuration, replacing the placeholder values.
          </li>
        </ol>
        <p className="mt-8 text-center text-gray-400">
          Once you've added your configuration and set the rules, this page will reload automatically.
        </p>
      </div>
    </div>
  );
};

export default FirebaseSetupInstructions;