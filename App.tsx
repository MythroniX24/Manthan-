import React, { useState, useEffect } from 'react';
import { LiveAssistant } from './components/LiveAssistant';
import { ChatBot } from './components/ChatBot';
import { PhotoStudio } from './components/PhotoStudio';
import { MessageCircleIcon, EarIcon, ImageIcon, SunIcon, MoonIcon } from './components/icons';

type Mode = 'live' | 'chat' | 'photostudio';
type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('chat');
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const renderContent = () => {
    switch (mode) {
      case 'live':
        return <LiveAssistant />;
      case 'chat':
        return <ChatBot />;
      case 'photostudio':
        return <PhotoStudio />;
      default:
        return null;
    }
  };
  
  const tabs: { id: Mode, name: string, icon: React.ReactNode }[] = [
    { id: 'live', name: 'Live Assistant', icon: <EarIcon /> },
    { id: 'chat', name: 'Chat', icon: <MessageCircleIcon /> },
    { id: 'photostudio', name: 'Photo Studio', icon: <ImageIcon /> },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="bg-[var(--bg-primary)]/80 backdrop-blur-sm border-b border-[var(--border-primary)] shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-wider text-[var(--text-primary)]">Gemini AI Suite</h1>
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]" 
            aria-label="Toggle theme">
            {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 flex-grow flex flex-col md:flex-row gap-6">
        <nav className="flex flex-row md:flex-col gap-2 md:w-64 flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm md:text-base w-full text-left font-medium ${
                mode === tab.id
                  ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-md'
                  : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
              }`}
            >
              {tab.icon}
              <span className="hidden md:inline">{tab.name}</span>
            </button>
          ))}
        </nav>

        <main className="flex-grow bg-[var(--bg-primary)] rounded-xl shadow-lg flex flex-col overflow-hidden border border-[var(--border-primary)]">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
