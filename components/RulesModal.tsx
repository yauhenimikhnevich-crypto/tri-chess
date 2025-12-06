import React, { useState } from 'react';
import { rulesData } from '../rules';

interface RulesModalProps {
  onClose: () => void;
}

type Language = keyof typeof rulesData;

const languageOptions: { key: Language; name: string }[] = [
    { key: 'en', name: 'English' },
    { key: 'de', name: 'Deutsch' },
    { key: 'fr', name: 'Français' },
    { key: 'es', name: 'Español' },
    { key: 'it', name: 'Italiano' },
    { key: 'ru', name: 'Русский' },
];

const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  const [language, setLanguage] = useState<Language>('en');
  const rules = rulesData[language];

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center p-4 font-sans z-50">
      <div className="w-full max-w-4xl h-full flex flex-col bg-gray-800/50 p-6 rounded-lg shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold">{rules.title}</h1>
          <button onClick={onClose} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md">
            Back
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
            {languageOptions.map(lang => (
                 <button
                    key={lang.key}
                    onClick={() => setLanguage(lang.key)}
                    className={`px-3 py-1 text-sm font-semibold rounded transition-colors duration-200 ${
                        language === lang.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                    {lang.name}
                </button>
            ))}
        </div>

        <div className="flex-grow overflow-y-auto pr-4 text-gray-300 space-y-4">
          {rules.sections.map((section, index) => (
            <div key={index}>
              <h2 className="text-2xl font-semibold mb-2 text-indigo-300">{section.title}</h2>
              <div className="space-y-2" dangerouslySetInnerHTML={{ __html: section.content }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RulesModal;