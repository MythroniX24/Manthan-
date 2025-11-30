import React, { useState, useMemo } from 'react';
import { ChatHistory } from '../types';
import { PencilIcon, Trash2Icon, CheckIcon, XIcon, SearchIcon, ChevronLeftIcon, SparkleIcon, CopyIcon, CircleIcon, MessageCircleIcon } from './icons';

interface ChatManagerProps {
    history: ChatHistory;
    onSelectChat: (id: string) => void;
    onDeleteChat: (id: string) => void;
    onRenameChat: (id: string, newTitle: string) => void;
    onNewChat: () => void;
    onClose: () => void;
}

const formatDate = (timestamp: number, title: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };

    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${date.toLocaleTimeString('en-US', timeFormat)}`;
    }
    
    if (title.toLowerCase().includes('meeting')) {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + `, ${date.toLocaleTimeString('en-US', timeFormat)}`;
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};


export const ChatManager: React.FC<ChatManagerProps> = ({ history, onSelectChat, onDeleteChat, onRenameChat, onNewChat, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');

    const handleEditStart = (id: string, currentTitle: string) => {
        setEditingId(id);
        setEditingText(currentTitle);
    };

    const handleEditCancel = () => {
        setEditingId(null);
        setEditingText('');
    };

    const handleEditSave = () => {
        if (editingId && editingText.trim()) {
            onRenameChat(editingId, editingText.trim());
        }
        handleEditCancel();
    };

    const sortedChatIds = useMemo(() => {
        return Object.keys(history)
            .filter(id => history[id].title.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => history[b].timestamp - history[a].timestamp);
    }, [history, searchTerm]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)] relative rounded-2xl overflow-hidden border border-[var(--border-primary)]">
            <header className="p-3 flex items-center flex-shrink-0 border-b border-[var(--border-primary)]">
                <button onClick={onClose} className="p-2 -ml-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
                <h2 className="text-xl font-bold text-[var(--text-primary)] ml-4">Chat Manager</h2>
            </header>

            <div className="px-4 py-2">
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-full pl-11 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto px-4 pt-2 pb-24">
                 <ul className="space-y-3">
                    {sortedChatIds.map((id, index) => {
                        const chat = history[id];
                        const isEditing = editingId === id;
                        const iconSet = index % 5;
                        return (
                            <li key={id}>
                                {isEditing ? (
                                    <div className="flex items-center gap-2 p-4 bg-[var(--bg-hover)] rounded-xl">
                                        <input
                                            type="text"
                                            value={editingText}
                                            onChange={(e) => setEditingText(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                                            className="flex-grow bg-[var(--bg-tertiary)] rounded px-2 py-1 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            autoFocus
                                        />
                                        <button onClick={handleEditSave} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><CheckIcon className="w-5 h-5" /></button>
                                        <button onClick={handleEditCancel} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><XIcon className="w-5 h-5" /></button>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => onSelectChat(id)} 
                                        className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                                    >
                                        <div className="flex-grow overflow-hidden mr-4">
                                            <p className="font-semibold truncate text-[var(--text-primary)]">{chat.title}</p>
                                            <p className="text-sm text-[var(--text-secondary)]">{formatDate(chat.timestamp, chat.title)}</p>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-[var(--text-secondary)] flex-shrink-0">
                                            {iconSet === 0 && <>
                                                <button onClick={(e) => { e.stopPropagation(); handleEditStart(id, chat.title); }} className="hover:text-[var(--text-primary)]"><PencilIcon className="w-5 h-5" /></button>
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                            </>}
                                            {iconSet === 1 && <>
                                                <button onClick={(e) => { e.stopPropagation(); handleEditStart(id, chat.title); }} className="hover:text-[var(--text-primary)]"><PencilIcon className="w-5 h-5" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); onDeleteChat(id); }} className="hover:text-red-500"><Trash2Icon className="w-5 h-5" /></button>
                                                <CopyIcon className="w-5 h-5 opacity-70" />
                                            </>}
                                            {iconSet === 2 && <>
                                                <CircleIcon className="w-5 h-5 opacity-70" />
                                                <button onClick={(e) => { e.stopPropagation(); onDeleteChat(id); }} className="hover:text-red-500"><Trash2Icon className="w-5 h-5" /></button>
                                                <CopyIcon className="w-5 h-5 opacity-70" />
                                            </>}
                                            {iconSet === 3 && <>
                                                <CircleIcon className="w-5 h-5 opacity-70" />
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                            </>}
                                            {iconSet === 4 && <>
                                                <CircleIcon className="w-5 h-5 opacity-70" />
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                                <MessageCircleIcon className="w-5 h-5 opacity-70" />
                                            </>}
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
             <div className="absolute bottom-6 right-6">
                <button onClick={onNewChat} className="bg-transparent text-[var(--text-primary)] rounded-full p-2 shadow-lg transition-transform hover:scale-110">
                    <SparkleIcon className="w-7 h-7" />
                </button>
            </div>
        </div>
    );
};
