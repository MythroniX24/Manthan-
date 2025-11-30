import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { decode, decodeAudioData, createBlob } from '../utils/audio';
import { Visualizer } from './Visualizer';
import { ThreeDVisualizer } from './ThreeDVisualizer';
import { MicIcon, StopCircleIcon, AlertTriangleIcon, XIcon } from './icons';

interface TranscriptionEntry {
    speaker: 'user' | 'model';
    text: string;
}

const display3DModelFunctionDeclaration: FunctionDeclaration = {
    name: 'display3DModel',
    parameters: {
      type: Type.OBJECT,
      description: 'Displays a 3D model of a specified object. Use this to visualize concepts for the user.',
      properties: {
        modelName: {
          type: Type.STRING,
          description: 'The name of the model to display. Supported models are: "atom", "dna", "molecule", "planet".',
          enum: ['atom', 'dna', 'molecule', 'planet'],
        },
      },
      required: ['modelName'],
    },
  };

export const LiveAssistant: React.FC = () => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
    const [active3DModel, setActive3DModel] = useState<string | null>(null);

    const sessionPromise = useRef<any | null>(null);
    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const inputAnalyser = useRef<AnalyserNode | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);
    const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSource = useRef<MediaStreamAudioSourceNode | null>(null);
    const isSpeakingRef = useRef(false);
    const speechTimeoutRef = useRef<number | null>(null);

    let nextStartTime = 0;
    const sources = new Set<AudioBufferSourceNode>();
    let currentInputTranscription = '';
    let currentOutputTranscription = '';

    const handleMessage = async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) {
            currentOutputTranscription += message.serverContent.outputTranscription.text;
            updateLastTranscription('model', currentOutputTranscription);
        }
        if (message.serverContent?.inputTranscription) {
            currentInputTranscription += message.serverContent.inputTranscription.text;
            updateLastTranscription('user', currentInputTranscription);
        }

        if (message.serverContent?.turnComplete) {
            currentInputTranscription = '';
            currentOutputTranscription = '';
        }

        if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'display3DModel') {
                    const modelName = fc.args.modelName as string;
                    if (modelName) {
                        setActive3DModel(modelName);
                        updateLastTranscription('model', `[Displaying 3D model: ${modelName}]`);
                    }
                    
                    sessionPromise.current.then((session: any) => {
                        session.sendToolResponse({
                            functionResponses: {
                                id : fc.id,
                                name: fc.name,
                                response: { result: `OK, displaying the ${modelName} model.` },
                            }
                        });
                    });
                }
            }
        }

        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio && outputAudioContext.current) {
            nextStartTime = Math.max(nextStartTime, outputAudioContext.current.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext.current, 24000, 1);
            const source = outputAudioContext.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.current.destination);
            source.addEventListener('ended', () => sources.delete(source));
            source.start(nextStartTime);
            nextStartTime += audioBuffer.duration;
            sources.add(source);
        }

        if (message.serverContent?.interrupted) {
            for (const source of sources.values()) {
                source.stop();
                sources.delete(source);
            }
            nextStartTime = 0;
        }
    };

    const updateLastTranscription = (speaker: 'user' | 'model', text: string) => {
        setTranscriptions(prev => {
            const newTranscriptions = [...prev];
            if (newTranscriptions.length > 0 && newTranscriptions[newTranscriptions.length - 1].speaker === speaker) {
                newTranscriptions[newTranscriptions.length - 1].text = text;
            } else {
                newTranscriptions.push({ speaker, text });
            }
            return newTranscriptions;
        });
    };

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);
        setTranscriptions([]);
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            inputAudioContext.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContext.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            inputAnalyser.current = inputAudioContext.current.createAnalyser();
            inputAnalyser.current.fftSize = 256;


            mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            sessionPromise.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setIsConnecting(false);
                        setIsConnected(true);
                        
                        if (!inputAudioContext.current || !mediaStream.current || !inputAnalyser.current) return;
                        
                        mediaStreamSource.current = inputAudioContext.current.createMediaStreamSource(mediaStream.current);
                        scriptProcessor.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
                            if (!inputAnalyser.current) return;

                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            
                            // Simple VAD implementation
                            const VAD_THRESHOLD = 0.01; // Sensitivity for speech detection
                            const SPEECH_END_DELAY = 400; // ms of silence before stopping sending audio

                            const dataArray = new Uint8Array(inputAnalyser.current.fftSize);
                            inputAnalyser.current.getByteTimeDomainData(dataArray);
                            
                            let sumSquares = 0.0;
                            for (const amplitude of dataArray) {
                                const val = (amplitude / 128.0) - 1.0;
                                sumSquares += val * val;
                            }
                            const rms = Math.sqrt(sumSquares / dataArray.length);

                            if (rms > VAD_THRESHOLD) {
                                // Speech detected, clear any existing timeout
                                if (speechTimeoutRef.current) {
                                    clearTimeout(speechTimeoutRef.current);
                                    speechTimeoutRef.current = null;
                                }
                                isSpeakingRef.current = true;
                            } else if (isSpeakingRef.current) {
                                // Silence detected after speech, set a timeout to stop
                                if (!speechTimeoutRef.current) {
                                    speechTimeoutRef.current = window.setTimeout(() => {
                                        isSpeakingRef.current = false;
                                        speechTimeoutRef.current = null;
                                    }, SPEECH_END_DELAY);
                                }
                            }
                            
                            // Only send audio to the API if speech is detected
                            if (isSpeakingRef.current) {
                                const pcmBlob = createBlob(inputData);
                                sessionPromise.current.then((session: any) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        
                        mediaStreamSource.current.connect(inputAnalyser.current);
                        inputAnalyser.current.connect(scriptProcessor.current);
                        scriptProcessor.current.connect(inputAudioContext.current.destination);
                    },
                    onmessage: handleMessage,
                    onerror: (e: ErrorEvent) => {
                        console.error('Live Assistant API Error:', e);
                        setError(`A connection error occurred. Please check your internet connection and try reconnecting.`);
                        disconnect();
                    },
                    onclose: (e: CloseEvent) => {
                        disconnect();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    tools: [{ functionDeclarations: [display3DModelFunctionDeclaration] }],
                },
            });

        } catch (err: any) {
            console.error('Connection failed:', err);
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setError("Microphone not found. Please ensure it's connected and enabled in your browser settings.");
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError("Microphone access denied. Please enable it in your browser settings to use the live assistant.");
            } else {
                setError(`Failed to start session. Please check your internet connection and try again.`);
            }
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            speechTimeoutRef.current = null;
        }

        if(sessionPromise.current) {
            sessionPromise.current.then((session: any) => session.close());
            sessionPromise.current = null;
        }
        
        mediaStream.current?.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
        
        scriptProcessor.current?.disconnect();
        mediaStreamSource.current?.disconnect();
        
        inputAudioContext.current?.close().catch(console.error);
        outputAudioContext.current?.close().catch(console.error);

        inputAudioContext.current = null;
        outputAudioContext.current = null;
        
        setActive3DModel(null);
        setIsConnected(false);
        setIsConnecting(false);
    }, []);
    
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <div className="flex-grow relative flex flex-col items-center justify-center p-4">
                <div className="absolute inset-0">
                    {active3DModel ? (
                        <ThreeDVisualizer 
                            modelName={active3DModel} 
                            onClose={() => setActive3DModel(null)} 
                        />
                    ) : (
                        <Visualizer analyser={inputAnalyser.current} isListening={isConnected} />
                    )}
                </div>
                <div className="relative z-10 text-center">
                    {!isConnected && !isConnecting && (
                        <button onClick={connect} className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-full p-6 shadow-lg transition-transform transform hover:scale-105">
                            <MicIcon className="w-12 h-12" />
                        </button>
                    )}
                    {isConnecting && (
                        <div className="text-[var(--text-secondary)]">Connecting...</div>
                    )}
                    {isConnected && (
                        <button onClick={disconnect} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-6 shadow-lg transition-transform transform hover:scale-105">
                            <StopCircleIcon className="w-12 h-12" />
                        </button>
                    )}
                    <p className="mt-4 text-lg font-medium">
                        {isConnected ? "Listening..." : "Tap to start conversation"}
                    </p>
                </div>
            </div>
             {error && (
                <div className="p-4 text-center bg-red-900/60 text-red-200 flex items-center justify-center gap-3 border-t border-red-700">
                    <AlertTriangleIcon className="w-6 h-6 flex-shrink-0" />
                    <span className="flex-grow text-left">{error}</span>
                    <button onClick={() => setError(null)} className="p-1 rounded-full hover:bg-red-800/50" aria-label="Dismiss error">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
            <div className="flex-shrink-0 h-1/3 bg-[var(--bg-secondary)]/50 p-4 overflow-y-auto border-t border-[var(--border-primary)]">
                <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">Transcript</h3>
                    {transcriptions.map((t, i) => (
                        <p key={i} className={t.speaker === 'user' ? 'text-cyan-400' : 'text-[var(--text-primary)]'}>
                            <strong className="capitalize">{t.speaker}:</strong> {t.text}
                        </p>
                    ))}
                    {transcriptions.length === 0 && <p className="text-[var(--text-secondary)]">Transcript will appear here...</p>}
                </div>
            </div>
        </div>
    );
};
