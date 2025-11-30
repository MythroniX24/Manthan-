import { GoogleGenAI, Part } from '@google/genai';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Message, ChatHistory, ChatHistoryItem, Attachment, GroundingSource } from '../types';
import { SendIcon, PlusIcon, AlertTriangleIcon, StopCircleIcon, XIcon, MenuIcon, PencilIcon, MoreVerticalIcon, MicIcon, FileTextIcon, DownloadIcon, SearchIcon, MapPinIcon, BrainIcon } from './icons';
import { ChatManager } from './ChatManager';

interface AttachmentState {
    file: File;
    previewUrl: string | null; // Data URL for images
    isImage: boolean;
}

const simpleSyntaxHighlight = (code: string) => {
    let highlightedCode = code;
    const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from', 'def', 'class', 'new', 'await', 'async', 'try', 'catch', 'finally', 'public', 'private', 'protected', 'static', 'void'];
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    
    highlightedCode = highlightedCode
        .replace(keywordRegex, '<span class="token keyword">$1</span>')
        .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="token string">$1</span>')
        .replace(/(\/\/.*|\#.*)/g, '<span class="token comment">$1</span>')
        .replace(/(\d+(\.\d+)?)/g, '<span class="token number">$1</span>')
        .replace(/(\(|\)|\[|\]|\{|\})/g, '<span class="token punctuation">$1</span>')
        .replace(/(=>|===|==|!=|!==|>|<|>=|<=|\+|\-|\*|\/|%)/g, '<span class="token operator">$1</span>');

    return highlightedCode;
};

const parseInline = (text: string): string => {
    let processedText = text;
    // Process strong, em, strike, and code in a way that avoids nesting issues
    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processedText = processedText.replace(/__(.*?)__/g, '<strong>$1</strong>');
    processedText = processedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processedText = processedText.replace(/_(.*?)_/g, '<em>$1</em>');
    processedText = processedText.replace(/~~(.*?)~~/g, '<s>$1</s>');
    processedText = processedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    return processedText.trim().replace(/\n/g, '<br />');
};

const parseList = (listBlock: string): string => {
    const lines = listBlock.split('\n');
    let html = '';
    const stack: Array<{ type: 'ul' | 'ol'; indent: number }> = [];

    const getIndent = (line: string) => line.match(/^(\s*)/)?.[0].length ?? 0;

    for (const line of lines) {
        if (!line.trim()) continue;

        const indent = getIndent(line);
        const liText = line.trim();
        const isOrdered = /^\d+\.\s/.test(liText);
        const type = isOrdered ? 'ol' : 'ul';
        const content = liText.replace(/^([-*+]|\d+\.)\s*/, '');
        
        while (stack.length > 0 && indent < stack[stack.length - 1].indent) {
            html += `</li></${stack.pop()!.type}>`;
        }

        const lastIndent = stack.length > 0 ? stack[stack.length - 1].indent : -1;
        
        if (stack.length === 0 || indent > lastIndent) {
            stack.push({ type, indent });
            html += `<${type} class="${type === 'ul' ? 'list-disc' : 'list-decimal'} list-inside space-y-1 my-2 ml-4">`;
        } else if (stack.length > 0 && type !== stack[stack.length - 1].type) {
            html += `</li></${stack.pop()!.type}>`;
            stack.push({ type, indent });
            html += `<${type} class="${type === 'ul' ? 'list-disc' : 'list-decimal'} list-inside space-y-1 my-2 ml-4">`;
        } else {
             html += '</li>';
        }

        const taskMatch = content.match(/^\[( |x)\] (.*)/i);
        if (taskMatch) {
            const isChecked = taskMatch[1].toLowerCase() === 'x';
            html += `<li style="list-style-type: none;" class="!ml-0 flex items-center"><input type="checkbox" class="mr-2 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-0 cursor-default" disabled ${isChecked ? 'checked' : ''}><span>${parseInline(taskMatch[2])}</span>`;
        } else {
             html += `<li>${parseInline(content)}`;
        }
    }

    while (stack.length > 0) {
        html += `</li></${stack.pop()!.type}>`;
    }

    return html;
};

const parseMarkdown = (text: string): string => {
    let content = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const codeBlocks: string[] = [];
    const copyIconSVG = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const downloadIconSVG = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    const fileIconSVG = `<svg class="w-8 h-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>`;


    content = content.replace(/```(\w*?)\n([\s\S]*?)\n?```/g, (match, lang, code) => {
        const rawCode = code;
        
        if (lang === 'json') {
            try {
                const parsed = JSON.parse(rawCode);
                if (parsed.fileName && parsed.mimeType && parsed.content_base64) {
                    const fileDownloadHtml = `
                    <div class="flex items-center gap-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] my-2">
                        ${fileIconSVG}
                        <div class="flex-grow overflow-hidden">
                            <p class="font-medium text-[var(--text-primary)] truncate">${parsed.fileName}</p>
                            <p class="text-sm text-[var(--text-secondary)]">${parsed.mimeType}</p>
                        </div>
                        <button
                            class="download-file-btn flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-accent)] text-[var(--text-on-accent)] rounded-md hover:bg-[var(--bg-accent-hover)] text-sm flex-shrink-0"
                            data-filename="${parsed.fileName}"
                            data-mimetype="${parsed.mimeType}"
                            data-base64="${parsed.content_base64}"
                        >
                            ${downloadIconSVG}
                            <span>Download</span>
                        </button>
                    </div>`;
                    codeBlocks.push(fileDownloadHtml);
                    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
                }
            } catch (e) { /* Not a valid JSON for file download, treat as normal code */ }
        }

        // Use encodeURIComponent for unicode character support
        const base64Code = btoa(unescape(encodeURIComponent(rawCode)));
        const escapedCode = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const highlightedCode = simpleSyntaxHighlight(escapedCode);
        
        const wrappedCodeBlock = `
        <div class="code-block-wrapper relative group">
            <button
                class="copy-code-btn absolute top-3 right-3 p-1.5 rounded-md bg-[var(--bg-hover)]/80 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                data-copy-content="${base64Code}"
                aria-label="Copy code to clipboard"
                title="Copy code"
            >
                ${copyIconSVG}
            </button>
            <pre><code class="language-${lang || ''}">${highlightedCode}</code></pre>
        </div>
        `;
        codeBlocks.push(wrappedCodeBlock);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    const blocks = content.split(/\n{2,}/);
    const htmlBlocks = blocks.map(block => {
        if (/^\s*([-*_]){3,}\s*$/.test(block)) {
            return '<hr class="border-[var(--border-primary)] my-4" />';
        }
        
        if (block.startsWith('&gt; ')) {
            const blockquoteContent = block.split('\n').map(line => line.replace(/^&gt; ?/, '')).join('\n');
            const innerHtml = parseMarkdown(blockquoteContent);
            return `<blockquote class="pl-4 border-l-4 border-[var(--border-primary)] text-[var(--text-secondary)] italic my-2">${innerHtml}</blockquote>`;
        }

        if (block.startsWith('|')) {
             const tableRegex = /^\|(.+)\|\r?\n\|((?:\s*:?--*:?\s*\|)+)\r?\n((?:\|.*\|\r?\n?)*)/m;
             if (tableRegex.test(block)) {
                 return block.replace(tableRegex, (match, header, separator, body) => {
                    const headerCells = header.split('|').slice(1, -1).map(h => `<th class="px-4 py-2 font-medium">${parseInline(h.trim())}</th>`).join('');
                    const bodyRows = body.trim().split('\n').map(row => {
                        if (!row.trim()) return '';
                        const rowCells = row.split('|').slice(1, -1).map(c => `<td class="px-4 py-2">${parseInline(c.trim())}</td>`).join('');
                        return `<tr class="border-b border-[var(--border-primary)] hover:bg-[var(--bg-secondary)]/50">${rowCells}</tr>`;
                    }).join('');
                    return `
                        <div class="overflow-x-auto my-4 border border-[var(--border-primary)] rounded-lg">
                            <table class="w-full text-sm text-left text-[var(--text-primary)]">
                                <thead class="text-xs uppercase bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]"><tr>${headerCells}</tr></thead>
                                <tbody>${bodyRows}</tbody>
                            </table>
                        </div>
                    `;
                 });
             }
        }

        if (/^\s*([-*+]|\d+\.)\s/.test(block)) {
            return parseList(block);
        }

        if (block.trim()) {
            return `<p>${parseInline(block)}</p>`;
        }
        return '';
    });
    
    let finalHtml = htmlBlocks.join('\n').trim();

    finalHtml = finalHtml.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        return codeBlocks[parseInt(index, 10)];
    });
    
    return finalHtml;
};


const MarkdownRenderer: React.FC<{ content: string, className?: string }> = React.memo(({ content, className = '' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const html = useMemo(() => {
        return { __html: parseMarkdown(content) };
    }, [content]);

    useEffect(() => {
        if (!containerRef.current) return;

        const copyIconSVG = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const checkIconSVG = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        // Handle code copy buttons
        const copyButtons = containerRef.current.querySelectorAll<HTMLButtonElement>('.copy-code-btn');
        const handleCopyClick = (e: MouseEvent) => {
            const button = e.currentTarget as HTMLButtonElement;
            const base64Content = button.dataset.copyContent;

            if (base64Content) {
                const decodedContent = decodeURIComponent(escape(atob(base64Content)));
                navigator.clipboard.writeText(decodedContent).then(() => {
                    button.innerHTML = checkIconSVG;
                    button.classList.add('text-green-400');
                    setTimeout(() => {
                        button.innerHTML = copyIconSVG;
                        button.classList.remove('text-green-400');
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy code: ', err);
                });
            }
        };
        copyButtons.forEach(button => button.addEventListener('click', handleCopyClick));
        
        // Handle file download buttons
        const downloadButtons = containerRef.current.querySelectorAll<HTMLButtonElement>('.download-file-btn');
        const handleDownloadClick = (e: MouseEvent) => {
            const button = e.currentTarget as HTMLButtonElement;
            const { filename, mimetype, base64 } = button.dataset;
            if (filename && mimetype && base64) {
                if (window.confirm(`Are you sure you want to download "${filename}"?`)) {
                    const byteCharacters = atob(base64);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: mimetype });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            }
        };
        downloadButtons.forEach(button => button.addEventListener('click', handleDownloadClick));


        return () => {
            copyButtons.forEach(button => button.removeEventListener('click', handleCopyClick));
            downloadButtons.forEach(button => button.removeEventListener('click', handleDownloadClick));
        };
    }, [content]);

    return <div ref={containerRef} className={`prose prose-invert max-w-none text-[var(--text-primary)] ${className}`} dangerouslySetInnerHTML={html} />;
});

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
};

const convertMessagesToHistory = (messages: Message[]): { role: string, parts: Part[] }[] => {
    return messages.map(msg => {
        const parts: Part[] = [];
        if (msg.text) {
            parts.push({ text: msg.text });
        }
        if (msg.attachments) {
            for (const att of msg.attachments) {
                const match = att.dataUrl.match(/^data:(.+);base64,(.+)$/);
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: match[2],
                        }
                    });
                }
            }
        }
        return { role: msg.role, parts };
    }).filter(msg => msg.parts.length > 0);
};


export const ChatBot: React.FC = () => {
    const [chatHistory, setChatHistory] = useState<ChatHistory>({});
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [attachment, setAttachment] = useState<AttachmentState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isChatManagerOpen, setIsChatManagerOpen] = useState(false);
    const [useSearch, setUseSearch] = useState(false);
    const [useMaps, setUseMaps] = useState(false);
    const [useThinkingMode, setUseThinkingMode] = useState(false);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; } | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesRef = useRef<Message[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${scrollHeight}px`;
        }
    }, [input]);

    const handleNewChat = useCallback(() => {
        const newId = `chat_${Date.now()}`;
        const newChat: ChatHistoryItem = {
            title: 'New Conversation',
            messages: [],
            timestamp: Date.now(),
        };
        setChatHistory(prev => ({ ...prev, [newId]: newChat }));
        setActiveChatId(newId);
        setInput('');
        setAttachment(null);
    }, []);

    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem('gemini-chat-history');
            if (savedHistory) {
                const history = JSON.parse(savedHistory);
                setChatHistory(history);
                const sortedChats = Object.keys(history).sort((a, b) => history[b].timestamp - history[a].timestamp);
                if (sortedChats.length > 0) {
                    setActiveChatId(sortedChats[0]);
                } else {
                    handleNewChat();
                }
            } else {
                handleNewChat();
            }
        } catch (e) {
            console.error("Failed to load chat history:", e);
            handleNewChat();
        }
    }, [handleNewChat]);

    useEffect(() => {
        if (Object.keys(chatHistory).length > 0) {
            localStorage.setItem('gemini-chat-history', JSON.stringify(chatHistory));
        }
    }, [chatHistory]);

    useEffect(() => {
        if (activeChatId && chatHistory[activeChatId]) {
            setMessages(chatHistory[activeChatId].messages);
        } else {
            setMessages([]);
        }
    }, [activeChatId, chatHistory]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSelectChat = (id: string) => {
        if (isLoading) return;
        setActiveChatId(id);
        setIsChatManagerOpen(false);
    };

    const handleDeleteChat = (id: string) => {
        if (!window.confirm("Are you sure you want to delete this chat?")) return;
        
        const newHistory = { ...chatHistory };
        delete newHistory[id];
        setChatHistory(newHistory);

        if (id === activeChatId) {
            const sortedChats = Object.keys(newHistory).sort((a, b) => newHistory[b].timestamp - newHistory[a].timestamp);
            if (sortedChats.length > 0) {
                setActiveChatId(sortedChats[0]);
            } else {
                handleNewChat();
            }
        }
    };

    const handleRenameChat = (id: string, newTitle: string) => {
        setChatHistory(prev => ({
            ...prev,
            [id]: { ...prev[id], title: newTitle, timestamp: Date.now() }
        }));
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                fileToBase64(file).then(dataUrl => {
                    setAttachment({ file, previewUrl: dataUrl, isImage: true });
                });
            } else {
                setAttachment({ file, previewUrl: null, isImage: false });
            }
        }
    };

    const handleMapsToggle = () => {
        if (isLoading) return;
        if (useMaps) {
            setUseMaps(false);
            return;
        }
    
        if (userLocation) {
            setUseMaps(true);
        } else {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        });
                        setUseMaps(true);
                        setError(null);
                    },
                    (error) => {
                        console.error("Geolocation error:", error);
                        setError("Could not get your location. Please enable location services in your browser settings to use map features.");
                        setUseMaps(false);
                    }
                );
            } else {
                setError("Geolocation is not supported by your browser.");
            }
        }
    };

    const handleSendMessage = useCallback(async (prompt: string, attachedFileState: AttachmentState | null) => {
        if (!prompt.trim() && !attachedFileState) return;
        if (!activeChatId) return;

        setError(null);
        setIsLoading(true);
        const currentMessages = messagesRef.current;

        const userMessageForState: Message = { role: 'user', text: prompt };
        const requestParts: Part[] = [];
        if (prompt.trim()) {
            requestParts.push({ text: prompt });
        }

        if (attachedFileState) {
            const file = attachedFileState.file;
            const dataUrl = await fileToBase64(file);
            userMessageForState.attachments = [{
                dataUrl,
                isImage: attachedFileState.isImage,
                mimeType: file.type,
                name: file.name
            }];
            requestParts.push({
                inlineData: {
                    data: dataUrl.split(',')[1],
                    mimeType: file.type,
                }
            });
        }
        
        setMessages(prev => [...prev, userMessageForState]);
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            const model = useThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
            const historyForApi = convertMessagesToHistory(currentMessages);
            const contents = [...historyForApi, { role: 'user', parts: requestParts }];
            
            const config: any = {};
            if (useThinkingMode) {
                config.thinkingConfig = { thinkingBudget: 32768 };
            } else {
                const tools: any[] = [];
                if (useSearch) {
                    tools.push({ googleSearch: {} });
                }
                if (useMaps) {
                    tools.push({ googleMaps: {} });
                }
    
                if (tools.length > 0) {
                    config.tools = tools;
                }
    
                if (useMaps && userLocation) {
                    config.toolConfig = {
                        retrievalConfig: {
                            latLng: {
                                latitude: userLocation.latitude,
                                longitude: userLocation.longitude,
                            },
                        },
                    };
                }
            }


            const stream = await ai.models.generateContentStream({
                model,
                contents,
                config,
            });

            if (useSearch) setUseSearch(false);
            if (useMaps) setUseMaps(false);
            if (useThinkingMode) setUseThinkingMode(false);
            
            let modelResponse = '';
            let lastChunk: any = null;
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            for await (const chunk of stream) {
                if (signal.aborted) break;
                modelResponse += chunk.text;
                lastChunk = chunk;
                setMessages(prev => {
                    const latestMessages = [...prev];
                    latestMessages[latestMessages.length - 1].text = modelResponse;
                    return latestMessages;
                });
            }

            if (lastChunk) {
                const groundingChunks = lastChunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (groundingChunks && groundingChunks.length > 0) {
                    const sources = groundingChunks
                        .map((chunk: any) => {
                            if (chunk.web) {
                                return {
                                    uri: chunk.web.uri,
                                    title: chunk.web.title,
                                    type: 'web'
                                };
                            }
                            if (chunk.maps) {
                                return {
                                    uri: chunk.maps.uri,
                                    title: chunk.maps.title,
                                    type: 'maps'
                                };
                            }
                            return null;
                        })
                        .filter((source: any): source is GroundingSource => source && source.uri && source.title);
                    
                    if (sources.length > 0) {
                        setMessages(prev => {
                            const latestMessages = [...prev];
                            const lastMessage = latestMessages[latestMessages.length - 1];
                            if (lastMessage) {
                               const existingSources = lastMessage.sources || [];
                               const newSources = sources.filter(s => !existingSources.some(es => es.uri === s.uri));
                               lastMessage.sources = [...existingSources, ...newSources];
                            }
                            return latestMessages;
                        });
                    }
                }
            }

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error("Chat API error:", e);
                const errorMessage = "Sorry, an error occurred while getting a response. Please check your connection and try again.";
                setError(errorMessage);
                setMessages(prev => {
                    const latest = [...prev];
                    const lastMessageIndex = latest.length - 1;

                    if (lastMessageIndex >= 0 && latest[lastMessageIndex].role === 'model') {
                       latest[lastMessageIndex] = { ...latest[lastMessageIndex], text: errorMessage, isError: true };
                       return latest;
                    }
                    return [...latest, { role: 'model', text: errorMessage, isError: true }];
                });
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
            if(activeChatId){
                setChatHistory(prev => {
                    const finalMessages = messagesRef.current;
                    if (!finalMessages || finalMessages.length === 0) return prev;
                    
                    const isNewChat = finalMessages.length <= 2 && prev[activeChatId]?.messages.length === 0;
                    
                    let newTitle = prev[activeChatId]?.title || 'New Conversation';
                    if (isNewChat && finalMessages[0]?.text) {
                        newTitle = finalMessages[0].text.substring(0, 40) + (finalMessages[0].text.length > 40 ? '...' : '');
                    }
                    
                    return {
                        ...prev,
                        [activeChatId]: { 
                            ...prev[activeChatId], 
                            messages: finalMessages, 
                            title: newTitle,
                            timestamp: Date.now() 
                        }
                    }
                });
            }
        }
    }, [activeChatId, useSearch, useMaps, userLocation, useThinkingMode]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendMessage(input, attachment);
        setInput('');
        setAttachment(null);
    };

    return (
        <div className="flex h-full bg-[var(--bg-primary)] text-[var(--text-primary)] relative overflow-hidden">
            <main className="flex flex-col flex-1">
                <header className="p-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-primary)]/70 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsChatManagerOpen(true)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-hover)]">
                            <MenuIcon className="w-6 h-6" />
                        </button>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-grow truncate">
                            {activeChatId ? chatHistory[activeChatId]?.title : 'Chat'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-1">
                         <button onClick={() => { handleNewChat(); }} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-hover)]">
                            <PencilIcon className="w-5 h-5" />
                        </button>
                         <button className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-hover)]">
                            <MoreVerticalIcon className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-enter`}>
                            {msg.role === 'user' ? (
                               <div className="chat-bubble chat-bubble-user">
                                    {msg.attachments && msg.attachments.map((att, i) => (
                                        <div key={i} className="mb-2">
                                            {att.isImage ? (
                                                <img src={att.dataUrl} alt={att.name} className="max-w-xs rounded-lg" />
                                            ) : (
                                                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-primary)]">
                                                    <FileTextIcon className="w-6 h-6 text-[var(--text-secondary)] flex-shrink-0" />
                                                    <span className="text-sm text-[var(--text-primary)] font-medium truncate">{att.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {msg.text && <MarkdownRenderer content={msg.text} />}
                               </div>
                            ) : (
                               <div className="chat-bubble chat-bubble-model max-w-[80%]">
                                {msg.isError ? (
                                    <span className="text-red-500">{msg.text}</span>
                                ) : (
                                    (isLoading && index === messages.length - 1 && !msg.text)
                                    ? <div className="typing-indicator">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                      </div>
                                    : <MarkdownRenderer content={msg.text} />
                                )}
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-[var(--border-primary)]/50">
                                        <h4 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-2">
                                            Sources
                                        </h4>
                                        <div className="space-y-2">
                                            {msg.sources.map((source, i) => (
                                                <a 
                                                    key={i} 
                                                    href={source.uri} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className={`text-sm ${source.type === 'maps' ? 'text-green-400' : 'text-blue-400'} bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] p-2 rounded-md block border border-[var(--border-primary)] flex items-center gap-2`}
                                                    title={source.title}
                                                >
                                                    {source.type === 'maps' ? <MapPinIcon className="w-4 h-4 flex-shrink-0" /> : <SearchIcon className="w-4 h-4 flex-shrink-0" />}
                                                    <span className="font-medium mr-1 bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded px-1.5 py-0.5 text-xs">{i + 1}</span> 
                                                    <span className="truncate">{source.title}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                               </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                
                {error && (
                    <div className="m-4 p-3 bg-red-900/50 text-red-200 rounded-lg flex items-center justify-center gap-3 border border-red-700">
                        <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-grow text-sm text-left">{error}</span>
                        <button onClick={() => setError(null)} className="p-1 rounded-full hover:bg-red-800/50" aria-label="Dismiss error">
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="p-2 md:p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)]">
                    <form onSubmit={handleFormSubmit} className="flex flex-col gap-2">
                       {isLoading && (
                            <div className="flex justify-center animate-fade-in">
                                <button 
                                    onClick={handleStop}
                                    type="button"
                                    className="flex items-center gap-2 px-4 py-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-full text-sm hover:bg-[var(--bg-hover)] shadow-lg"
                                >
                                    <StopCircleIcon className="w-4 h-4" />
                                    Stop
                                </button>
                            </div>
                        )}
                        {attachment && (
                            <div className="relative w-fit self-start ml-14 p-2 bg-[var(--bg-tertiary)] rounded-xl animate-fade-in">
                                {attachment.isImage && attachment.previewUrl ? (
                                    <img src={attachment.previewUrl} alt="Attachment preview" className="max-h-24 rounded-lg" />
                                ) : (
                                    <div className="flex items-center gap-3 p-2 pr-4 rounded-lg bg-[var(--bg-secondary)]/80">
                                        <FileTextIcon className="w-8 h-8 text-[var(--text-secondary)] flex-shrink-0" />
                                        <span className="text-sm text-[var(--text-secondary)] truncate max-w-xs">{attachment.file.name}</span>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                                    className="absolute -top-2 -right-2 p-1 bg-[var(--bg-hover)] rounded-full text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                    aria-label="Remove attachment"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <div className="flex items-end gap-2 p-1.5 bg-[var(--bg-tertiary)] rounded-2xl focus-within:ring-2 focus-within:ring-blue-500">
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex-shrink-0 rounded-full hover:bg-[var(--bg-hover)]">
                                <PlusIcon className="w-6 h-6" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setUseSearch(s => !s)}
                                className={`p-2 flex-shrink-0 rounded-full ${useSearch ? 'text-blue-400 bg-blue-900/50' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                aria-label="Toggle web search"
                                title="Toggle web search for this message"
                                disabled={useThinkingMode}
                            >
                                <SearchIcon className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={handleMapsToggle}
                                className={`p-2 flex-shrink-0 rounded-full ${useMaps ? 'text-green-400 bg-green-900/50' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                aria-label="Toggle map search"
                                title="Toggle map search for this message"
                                disabled={useThinkingMode}
                            >
                                <MapPinIcon className="w-5 h-5" />
                            </button>
                             <button
                                type="button"
                                onClick={() => setUseThinkingMode(t => !t)}
                                className={`p-2 flex-shrink-0 rounded-full ${useThinkingMode ? 'text-purple-400 bg-purple-900/50' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                aria-label="Toggle Thinking Mode"
                                title="Toggle Thinking Mode for complex queries (uses gemini-2.5-pro)"
                                disabled={useSearch || useMaps}
                            >
                                <BrainIcon className="w-5 h-5" />
                            </button>
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleFormSubmit(e);
                                    }
                                }}
                                placeholder="Ask anything you want"
                                className="w-full bg-transparent border-none text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none max-h-48 overflow-y-auto pt-2 pb-1.5"
                                rows={1}
                                disabled={isLoading}
                            />
                            <div className="flex items-center flex-shrink-0">
                                <button type="button" className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-hover)]">
                                     <MicIcon className="w-6 h-6" />
                                </button>
                                 <button type="submit" disabled={(!input.trim() && !attachment) || isLoading} className="p-2 text-[var(--text-secondary)] rounded-full bg-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:text-gray-600 disabled:bg-transparent disabled:cursor-not-allowed">
                                    <SendIcon className="w-6 h-6" />
                                 </button>
                            </div>
                        </div>
                    </form>
                </div>
            </main>

            {isChatManagerOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center p-4"
                    onClick={() => setIsChatManagerOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div 
                        className="w-full max-w-md h-full max-h-[85vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <ChatManager
                            history={chatHistory}
                            onSelectChat={handleSelectChat}
                            onDeleteChat={handleDeleteChat}
                            onRenameChat={handleRenameChat}
                            onNewChat={() => { handleNewChat(); setIsChatManagerOpen(false); }}
                            onClose={() => setIsChatManagerOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};