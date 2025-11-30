import { GoogleGenAI, Modality, Type } from '@google/genai';
import React from 'react';
import { AlertTriangleIcon, CropIcon, CubeIcon, DownloadIcon, RefreshCwIcon, RotateCcwIcon, RotateCwIcon, SparkleIcon, Trash2Icon, UploadCloudIcon, XIcon, ZapIcon, PencilIcon, BookmarkIcon, MagicWandIcon, FilmIcon } from './icons';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
};

type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

const parseAspectRatioFromPrompt = (prompt: string): AspectRatio | null => {
    const p = prompt.toLowerCase();
    if (/\b(landscape|wide|horizontal|16:9|16\s?x\s?9|16\s?by\s?9)\b/.test(p)) return '16:9';
    if (/\b(portrait|tall|vertical|9:16|9\s?x\s?16|9\s?by\s?16)\b/.test(p)) return '9:16';
    if (/\b(4:3|4\s?x\s?3|4\s?by\s?3)\b/.test(p)) return '4:3';
    if (/\b(3:4|3\s?x\s?4|3\s?by\s?4)\b/.test(p)) return '3:4';
    if (/\b(square|1:1|1\s?x\s?1|1\s?by\s?1)\b/.test(p)) return '1:1';
    return null;
};

const getApiErrorMessage = (error: any): string => {
    let message = 'An unexpected error occurred. Please check your connection and try again.';
    let rawMessage = '';

    if (error && typeof error.message === 'string') {
        rawMessage = error.message;
    } else if (typeof error === 'string') {
        rawMessage = error;
    }

    try {
        const errorJson = JSON.parse(rawMessage);
        rawMessage = errorJson.error?.message || rawMessage;
    } catch (e) {
        // Not a JSON string, continue with the raw message
    }
    
    const lowerCaseMessage = rawMessage.toLowerCase();

    if (lowerCaseMessage.includes('imagen api is only accessible to billed users')) {
        return 'The Imagen API requires a billed account. Please select an API key with billing enabled. For billing info, visit ai.google.dev/gemini-api/docs/billing.';
    }
    if (lowerCaseMessage.includes('quota')) {
        return 'You have exceeded your API quota. Please check your plan and billing details, or try again later. For more info, visit ai.google.dev/gemini-api/docs/rate-limits.';
    }
    if (lowerCaseMessage.includes('requested entity was not found')) {
        return 'Your API Key seems to be invalid for video generation. Please select a valid key and try again. For billing info, visit ai.google.dev/gemini-api/docs/billing.';
    }
    if (lowerCaseMessage.includes('refused')) {
        return 'The model refused to process the prompt, likely due to safety policies. Please try a different prompt.';
    }

    return message;
};


export const PhotoStudio: React.FC = () => {
    const [originalImage, setOriginalImage] = React.useState<{ base64: string, mimeType: string } | null>(null);
    const [editedImage, setEditedImage] = React.useState<{ base64: string, mimeType: string } | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [loadingMessage, setLoadingMessage] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);

    const [generationPrompt, setGenerationPrompt] = React.useState('');
    const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>('1:1');
    
    const [showBgSamples, setShowBgSamples] = React.useState(false);
    const [bgSamples, setBgSamples] = React.useState<string[]>([]);
    const [isGeneratingSamples, setIsGeneratingSamples] = React.useState(false);
    const [bgLoadingMessage, setBgLoadingMessage] = React.useState('');
    
    const [showVariants, setShowVariants] = React.useState(false);
    const [variants, setVariants] = React.useState<string[]>([]);
    const [isGeneratingVariants, setIsGeneratingVariants] = React.useState(false);
    const [variantsLoadingMessage, setVariantsLoadingMessage] = React.useState('');

    const [customPrompt, setCustomPrompt] = React.useState('');
    const [savedPrompts, setSavedPrompts] = React.useState<{ id: string; name: string; prompt: string }[]>([]);
    const [brightness, setBrightness] = React.useState(100);
    const [contrast, setContrast] = React.useState(100);
    const [rotation, setRotation] = React.useState(0);

    const [isCropping, setIsCropping] = React.useState(false);
    const [cropBox, setCropBox] = React.useState<{ x: number, y: number, width: number, height: number } | null>(null);
    const [isDraggingCrop, setIsDraggingCrop] = React.useState(false);
    const [dragStart, setDragStart] = React.useState<{ x: number, y: number } | null>(null);
    
    const [isMasking, setIsMasking] = React.useState(false);
    const [brushSize, setBrushSize] = React.useState(30);
    const [brushCursorPosition, setBrushCursorPosition] = React.useState<{ x: number, y: number } | null>(null);

    const [isAnimating, setIsAnimating] = React.useState(false);
    const [animationPrompt, setAnimationPrompt] = React.useState('');
    const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
    const [showVideoPlayer, setShowVideoPlayer] = React.useState(false);

    const imagePreviewRef = React.useRef<HTMLImageElement>(null);
    const imageContainerRef = React.useRef<HTMLDivElement>(null);
    const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
    const isDrawingMaskRef = React.useRef(false);
    const lastMaskPointRef = React.useRef<{ x: number, y: number } | null>(null);


    React.useEffect(() => {
        try {
            const storedPrompts = localStorage.getItem('photo-studio-prompts');
            if (storedPrompts) {
                setSavedPrompts(JSON.parse(storedPrompts));
            }
        } catch (e) {
            console.error("Failed to load saved prompts:", e);
        }
    }, []);

    React.useEffect(() => {
        const detectedRatio = parseAspectRatioFromPrompt(generationPrompt);
        if (detectedRatio) {
            setAspectRatio(detectedRatio);
        }
    }, [generationPrompt]);

    React.useEffect(() => {
        try {
            localStorage.setItem('photo-studio-prompts', JSON.stringify(savedPrompts));
        } catch (e) {
            console.error("Failed to save prompts:", e);
        }
    }, [savedPrompts]);
    
    React.useEffect(() => {
        if (isMasking && maskCanvasRef.current && imagePreviewRef.current) {
            const canvas = maskCanvasRef.current;
            const image = imagePreviewRef.current;
            canvas.width = image.clientWidth;
            canvas.height = image.clientHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }, [isMasking]);


    const resetAdjustments = () => {
        setBrightness(100);
        setContrast(100);
        setRotation(0);
        setIsCropping(false);
        setCropBox(null);
        setIsMasking(false);
        setIsAnimating(false);
        setAnimationPrompt('');
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            try {
                const base64 = await fileToBase64(file);
                const imageObject = { base64, mimeType: file.type };
                setOriginalImage(imageObject);
                setEditedImage(imageObject);
                setError(null);
                setShowBgSamples(false);
                setBgSamples([]);
                setShowVariants(false);
                setVariants([]);
                resetAdjustments();
            } catch (err) {
                setError('Failed to read the image file.');
            }
        } else {
            setError('Please select a valid image file.');
        }
    };

    const handleGenerateImage = async () => {
        if (!generationPrompt.trim()) {
            setError("Please enter a prompt to generate an image.");
            return;
        }
        
        try {
            if (!(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
            setError("Could not verify API key. Please select a key to generate images. For billing info, visit ai.google.dev/gemini-api/docs/billing");
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Generating your masterpiece...');
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            const outputMimeType = 'image/png';

            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: generationPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType,
                    aspectRatio: aspectRatio,
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image.imageBytes) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:${outputMimeType};base64,${base64ImageBytes}`;
                const imageObject = { base64: imageUrl, mimeType: outputMimeType };
                setOriginalImage(imageObject);
                setEditedImage(imageObject);
                setShowBgSamples(false);
                setBgSamples([]);
                setShowVariants(false);
                setVariants([]);
                resetAdjustments();
            } else {
                throw new Error("The model did not return an image. This could be due to safety policies or an API issue.");
            }
        } catch (err: any) {
            console.error("Image generation error:", err);
            const errorMessage = getApiErrorMessage(err);
            setError(errorMessage);

            if (errorMessage.toLowerCase().includes('billed account')) {
                try {
                    await (window as any).aistudio.openSelectKey();
                } catch (e) {
                    console.error("Could not open API key selector", e);
                }
            }
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const runImageGeneration = async (prompt: string, images: { base64: string, mimeType: string }[] = []): Promise<{ base64: string, mimeType: string } | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            const imageParts = images.map(img => ({
                inlineData: {
                    data: img.base64.split(',')[1],
                    mimeType: img.mimeType,
                },
            }));

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [...imageParts, { text: prompt }] },
                config: { responseModalities: [Modality.IMAGE] },
            });
            
            const resultPart = response.candidates?.[0]?.content?.parts[0];
            if (resultPart?.inlineData) {
                const newBase64 = `data:${resultPart.inlineData.mimeType};base64,${resultPart.inlineData.data}`;
                resetAdjustments();
                return { base64: newBase64, mimeType: resultPart.inlineData.mimeType };
            } else {
                throw new Error('No image was generated. The model may have refused the prompt.');
            }
        } catch (err: any) {
            console.error("Image generation error:", err);
            setError(getApiErrorMessage(err));
            return null;
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const handleGenerateVideo = async () => {
        if (!editedImage) return;

        try {
            if (!(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
            setError("Could not verify API key. Please select a key to generate videos. For billing info, visit ai.google.dev/gemini-api/docs/billing");
            return;
        }

        setIsLoading(true);
        setVideoUrl(null);
        setError(null);
        setLoadingMessage('Preparing animation...');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const imagePart = {
                imageBytes: editedImage.base64.split(',')[1],
                mimeType: editedImage.mimeType,
            };

            const imageForSizing = new Image();
            imageForSizing.src = editedImage.base64;
            await new Promise(resolve => imageForSizing.onload = resolve);
            
            const w = imageForSizing.naturalWidth;
            const h = imageForSizing.naturalHeight;
            let videoAspectRatio: '16:9' | '9:16' = '16:9';
            if (h > w) {
                videoAspectRatio = '9:16';
            }
            
            setLoadingMessage('Generating video... This can take a few minutes.');
            
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: animationPrompt.trim() || 'Animate this image subtly.',
                image: imagePart,
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: videoAspectRatio,
                }
            });

            while (!operation.done) {
                setLoadingMessage(`Processing video... Hang tight!`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            if (operation.error) {
                throw new Error(JSON.stringify(operation.error));
            }

            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink) {
                const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText);
                }
                const videoBlob = await response.blob();
                const videoObjectURL = URL.createObjectURL(videoBlob);
                setVideoUrl(videoObjectURL);
                setShowVideoPlayer(true);
            } else {
                throw new Error("Video generation completed, but no video URI was returned.");
            }

        } catch (err: any) {
            console.error("Video generation error:", err);
            const errorMessage = getApiErrorMessage(err);
            setError(errorMessage);

            if (errorMessage.toLowerCase().includes('invalid for video generation')) {
                try {
                    await (window as any).aistudio.openSelectKey();
                } catch (e) {
                    console.error("Could not open API key selector", e);
                }
            }
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setIsAnimating(false);
            setAnimationPrompt('');
        }
    };

    const handleEnhance = async () => {
        if (!editedImage) return;
        setLoadingMessage('Enhancing quality...');
        const result = await runImageGeneration('Subtly enhance the quality of this image. Improve sharpness, clarity, and lighting without altering the content. Make it look more professional.', [editedImage]);
        if (result) setEditedImage(result);
    };

    const handleRemoveBg = async () => {
        if (!editedImage) return;
        setLoadingMessage('Removing background...');
        const result = await runImageGeneration('Remove the background from this image, leaving only the main subject with a transparent background.', [editedImage]);
        if (result) setEditedImage(result);
    };
    
    const handleGenerateBgs = async () => {
        if (!originalImage) {
            setError("Please upload an image first to generate suitable backgrounds.");
            return;
        }

        setIsGeneratingSamples(true);
        setError(null);
        setBgLoadingMessage('Analyzing your image...');
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

            const promptResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                data: originalImage.base64.split(',')[1],
                                mimeType: originalImage.mimeType,
                            },
                        },
                        {
                            text: 'Analyze the main subject, lighting, and style of this image. Based on this, suggest 4 diverse, photorealistic background prompts. Each prompt should describe a background that would seamlessly and naturally fit the subject, as if it were the original setting. The prompts must be creative, detailed, and consider matching the lighting and perspective of the subject. Return a JSON array of 4 strings.',
                        },
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
            });
            
            const suggestedPrompts: string[] = JSON.parse(promptResponse.text);

            if (!suggestedPrompts || suggestedPrompts.length === 0) {
                throw new Error("Could not generate background ideas from the image.");
            }

            setBgLoadingMessage('Creating new backgrounds...');

            const imagePromises = suggestedPrompts.map(prompt =>
                ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [{ text: `Generate a high-quality, photorealistic background image: ${prompt}` }] },
                    config: { responseModalities: [Modality.IMAGE] },
                })
            );

            const imageResponses = await Promise.all(imagePromises);
            const samples = imageResponses.map(res => {
                const part = res.candidates?.[0]?.content?.parts[0];
                return part?.inlineData ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` : '';
            }).filter(Boolean);

            if (samples.length === 0) {
                throw new Error("Failed to generate any background images from the suggestions.");
            }

            setBgSamples(samples);
        } catch (err: any) {
            console.error("Background generation error:", err);
            setError(getApiErrorMessage(err));
            setBgSamples([]);
        } finally {
            setIsGeneratingSamples(false);
            setBgLoadingMessage('');
        }
    };
    
    const handleApplyBg = async (bgBase64: string) => {
        if (!editedImage) return;
        setLoadingMessage('Applying new background...');
        const mimeTypeMatch = bgBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        const bgImage = { base64: bgBase64, mimeType: mimeTypeMatch ? mimeTypeMatch[1] : 'image/png' };
        const result = await runImageGeneration(
            'Use the first image as the background. Take the main subject from the second image and place it onto the first image. Blend lighting and shadows for a natural, seamless look.',
            [bgImage, editedImage]
        );
        if (result) {
            setEditedImage(result);
            setShowBgSamples(false);
        }
    };

    const generateSingleVariant = async (prompt: string, image: { base64: string, mimeType: string }): Promise<{ base64: string, mimeType: string } | null> => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const imagePart = {
                inlineData: {
                    data: image.base64.split(',')[1],
                    mimeType: image.mimeType,
                },
            };
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: prompt }] },
                config: { responseModalities: [Modality.IMAGE] },
            });
            const resultPart = response.candidates?.[0]?.content?.parts[0];
            if (resultPart?.inlineData) {
                const newBase64 = `data:${resultPart.inlineData.mimeType};base64,${resultPart.inlineData.data}`;
                return { base64: newBase64, mimeType: resultPart.inlineData.mimeType };
            }
            return null;
        } catch (err) {
            console.error(`Variant generation failed for prompt "${prompt}":`, err);
            // Don't set global error here, let the caller handle aggregate failures
            return null;
        }
    };
    
    const handleGenerateVariants = async () => {
        if (!editedImage) {
            setError("Please upload an image first to generate variants.");
            return;
        }
    
        setIsGeneratingVariants(true);
        setShowVariants(true);
        setVariants([]);
        setError(null);
        setVariantsLoadingMessage('Generating creative variants...');
        
        try {
            const prompts = [
                'Generate a creative visual variant of this image with a dramatic, cinematic lighting style.',
                'Reimagine this image in a vibrant, painterly artistic style.',
                'Create a futuristic or sci-fi themed variant of this image.'
            ];
    
            const results = await Promise.all(prompts.map(p => generateSingleVariant(p, editedImage)));
            const successfulVariants = results.filter(Boolean) as { base64: string, mimeType: string }[];
            
            if (successfulVariants.length === 0) {
                throw new Error("Failed to generate any variants. The model may have refused the prompts or a quota may have been exceeded.");
            }
    
            setVariants(successfulVariants.map(v => v.base64));
    
        } catch (err: any) {
            console.error("Variant generation error:", err);
            setError(getApiErrorMessage(err));
            setVariants([]);
        } finally {
            setIsGeneratingVariants(false);
            setVariantsLoadingMessage('');
        }
    };

    const handleApplyVariant = (variantBase64: string) => {
        if (!editedImage) return;
        const mimeTypeMatch = variantBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        setEditedImage({ base64: variantBase64, mimeType });
        setShowVariants(false);
        resetAdjustments();
    };

    const handleCustomPrompt = async () => {
        if (!editedImage || !customPrompt.trim()) return;
        setLoadingMessage('Applying custom edit...');
        const result = await runImageGeneration(customPrompt, [editedImage]);
        if (result) {
            setEditedImage(result);
        }
    };

    const handleSavePrompt = () => {
        if (!customPrompt.trim()) return;
        const name = window.prompt("Enter a name for this prompt:", customPrompt.trim().substring(0, 30));
        if (name && name.trim()) {
            const trimmedName = name.trim();
            if (savedPrompts.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
                alert("A prompt with this name already exists. Please choose a different name.");
                return;
            }
            const newPrompt = {
                id: `prompt_${Date.now()}`,
                name: trimmedName,
                prompt: customPrompt.trim(),
            };
            setSavedPrompts(prev => [...prev, newPrompt]);
        }
    };

    const handleDeletePrompt = (id: string) => {
        if (window.confirm("Are you sure you want to delete this saved prompt?")) {
            setSavedPrompts(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleReset = () => {
        setEditedImage(originalImage);
        setShowBgSamples(false);
        setShowVariants(false);
        setError(null);
        resetAdjustments();
    };
    
    const handleDownload = () => {
        if (!editedImage) return;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
    
            const rads = rotation * Math.PI / 180;
            const absCos = Math.abs(Math.cos(rads));
            const absSin = Math.abs(Math.sin(rads));
            const newWidth = img.width * absCos + img.height * absSin;
            const newHeight = img.width * absSin + img.height * absCos;
            
            canvas.width = newWidth;
            canvas.height = newHeight;
    
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rads);
            
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            const mimeType = editedImage.mimeType.startsWith('image/') ? editedImage.mimeType : 'image/png';
            const fileExtension = mimeType.split('/')[1] || 'png';
            
            const dataUrl = canvas.toDataURL(mimeType);
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `edited-image-${Date.now()}.${fileExtension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        img.src = editedImage.base64;
    };
    
    const handleRotate = (direction: 'cw' | 'ccw') => {
        setRotation(prev => (prev + (direction === 'cw' ? 90 : -90) + 360) % 360);
    };

    const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isCropping) return;
        setIsDraggingCrop(true);
        const rect = imageContainerRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setDragStart({ x, y });
        setCropBox({ x, y, width: 0, height: 0 });
    };

    const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingCrop || !dragStart) return;
        const rect = imageContainerRef.current!.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        const x = Math.min(dragStart.x, currentX);
        const y = Math.min(dragStart.y, currentY);
        const width = Math.abs(currentX - dragStart.x);
        const height = Math.abs(currentY - dragStart.y);

        setCropBox({ x, y, width, height });
    };

    const handleCropMouseUp = () => {
        setIsDraggingCrop(false);
    };

    const handleApplyCrop = () => {
        if (!editedImage || !cropBox || !imagePreviewRef.current) return;
        if (cropBox.width < 10 || cropBox.height < 10) {
            setIsCropping(false);
            setCropBox(null);
            return;
        };

        const img = imagePreviewRef.current;
        const canvas = document.createElement('canvas');

        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;

        const cropX = cropBox.x * scaleX;
        const cropY = cropBox.y * scaleY;
        const cropWidth = cropBox.width * scaleX;
        const cropHeight = cropBox.height * scaleY;

        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const newBase64 = canvas.toDataURL(editedImage.mimeType);
        setEditedImage({ base64: newBase64, mimeType: editedImage.mimeType });

        resetAdjustments();
    };

    const handleCancelCrop = () => {
        setIsCropping(false);
        setCropBox(null);
    };
    
    const getMaskMousePos = (e: React.MouseEvent) => {
        const rect = maskCanvasRef.current!.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const handleMaskMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        isDrawingMaskRef.current = true;
        const pos = getMaskMousePos(e);
        lastMaskPointRef.current = pos;
        
        // Draw a dot on click
        const canvas = maskCanvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
    };

    const handleMaskMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getMaskMousePos(e);
        setBrushCursorPosition(pos);

        if (!isDrawingMaskRef.current) return;
        const canvas = maskCanvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        const currentPos = pos;
        
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.7)';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(lastMaskPointRef.current!.x, lastMaskPointRef.current!.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();

        lastMaskPointRef.current = currentPos;
    };

    const handleMaskMouseUp = () => {
        isDrawingMaskRef.current = false;
        lastMaskPointRef.current = null;
    };
    
    const handleApplyMask = async () => {
        if (!editedImage || !maskCanvasRef.current || !imagePreviewRef.current) return;
    
        const maskCanvas = maskCanvasRef.current;
        const image = imagePreviewRef.current;
    
        const finalMaskCanvas = document.createElement('canvas');
        finalMaskCanvas.width = image.naturalWidth;
        finalMaskCanvas.height = image.naturalHeight;
        const finalCtx = finalMaskCanvas.getContext('2d');
        if (!finalCtx) return;
        
        // Correctly scale the drawn mask to the full resolution canvas
        finalCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, finalMaskCanvas.width, finalMaskCanvas.height);
    
        const imageData = finalCtx.getImageData(0, 0, finalMaskCanvas.width, finalMaskCanvas.height);
        const data = imageData.data;
        let hasMask = false;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) { // Check if pixel has been painted (alpha > 0)
                data[i] = 0;   // R
                data[i + 1] = 0; // G
                data[i + 2] = 0; // B
                data[i + 3] = 255; // Alpha
                hasMask = true;
            } else {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = 255;
            }
        }
        finalCtx.putImageData(imageData, 0, 0);

        if (!hasMask) {
            setError("Please select an area to remove before applying.");
            return;
        }
    
        const maskBase64 = finalMaskCanvas.toDataURL('image/png');
        const maskImage = { base64: maskBase64, mimeType: 'image/png' };
    
        setIsMasking(false);
        setBrushCursorPosition(null);
        setLoadingMessage('Removing selected object...');
    
        const result = await runImageGeneration(
            'Use the second image as a black and white mask. The black area in the mask indicates the part of the first image to be removed and inpainted. Realistically fill in the removed area based on the surrounding context of the first image.',
            [editedImage, maskImage]
        );
    
        if (result) {
            setEditedImage(result);
        }
    };
    
    const handleCancelMask = () => {
        setIsMasking(false);
        setBrushCursorPosition(null);
    };


    const renderEditor = () => (
        <div className="flex flex-col md:flex-row h-full gap-4 p-4">
            <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
                {/* AI Tools */}
                <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)] flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">AI Tools</h3>
                    <button onClick={handleEnhance} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><SparkleIcon className="w-5 h-5"/> Enhance Quality</button>
                    <button onClick={handleRemoveBg} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><Trash2Icon className="w-5 h-5 text-red-400"/> Remove BG</button>
                    <button onClick={() => setIsMasking(true)} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><MagicWandIcon className="w-5 h-5 text-cyan-400"/> Remove Anything</button>
                    <button onClick={() => { if (!showBgSamples && bgSamples.length === 0) { handleGenerateBgs(); } setShowBgSamples(s => !s); }} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><ZapIcon className="w-5 h-5 text-yellow-400"/> Change BG</button>
                    <button onClick={() => { if (!showVariants && variants.length === 0) { handleGenerateVariants(); } setShowVariants(s => !s); }} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><CubeIcon className="w-5 h-5 text-purple-400"/> Generate Variants</button>
                    <button onClick={() => setIsAnimating(s => !s)} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><FilmIcon className="w-5 h-5 text-green-400"/> Animate Image</button>

                    {isAnimating && (
                        <div className="pt-3 mt-1 border-t border-[var(--border-primary)]/50">
                            <label htmlFor="animation-prompt" className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2 mb-2">
                                <FilmIcon className="w-4 h-4" />
                                Animation Prompt (optional)
                            </label>
                            <textarea
                                id="animation-prompt"
                                rows={2}
                                value={animationPrompt}
                                onChange={e => setAnimationPrompt(e.target.value)}
                                placeholder="e.g., 'subtle motion of clouds'"
                                disabled={isLoading}
                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md p-2 text-sm placeholder-[var(--text-secondary)] focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                            />
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    onClick={handleGenerateVideo}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Generate Video
                                </button>
                                <button
                                    onClick={() => setIsAnimating(false)}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md text-sm font-semibold"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <div className="pt-3 mt-1 border-t border-[var(--border-primary)]/50">
                        <label htmlFor="custom-prompt" className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2 mb-2">
                            <PencilIcon className="w-4 h-4" />
                            Custom Edit Prompt
                        </label>
                        <textarea
                            id="custom-prompt"
                            rows={3}
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value)}
                            placeholder="e.g., 'make the sky purple'"
                            disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md p-2 text-sm placeholder-[var(--text-secondary)] focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                        />
                         <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={handleCustomPrompt}
                                disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating || !customPrompt.trim()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Apply
                            </button>
                            <button
                                onClick={handleSavePrompt}
                                disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating || !customPrompt.trim()}
                                className="flex-shrink-0 px-3 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Save Prompt"
                            >
                                <BookmarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        {savedPrompts.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-[var(--border-primary)]/50">
                                <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Saved Prompts</h4>
                                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                                    {savedPrompts.map(p => (
                                        <div key={p.id} className="group flex items-center justify-between gap-2 p-2 bg-[var(--bg-secondary)]/70 hover:bg-[var(--bg-secondary)] rounded-md">
                                            <button
                                                onClick={() => setCustomPrompt(p.prompt)}
                                                className="text-left flex-grow truncate"
                                                title={p.prompt}>
                                                <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-blue-400">{p.name}</p>
                                            </button>
                                            <button
                                                onClick={() => handleDeletePrompt(p.id)}
                                                className="flex-shrink-0 p-1 text-[var(--text-secondary)] hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                title="Delete prompt">
                                                <Trash2Icon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Adjustments */}
                <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)] flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Adjustments</h3>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="brightness" className="text-sm font-medium text-[var(--text-secondary)]">Brightness</label>
                        <input id="brightness" type="range" min="0" max="200" value={brightness} onChange={e => setBrightness(parseInt(e.target.value))} className="w-full" disabled={isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="contrast" className="text-sm font-medium text-[var(--text-secondary)]">Contrast</label>
                        <input id="contrast" type="range" min="0" max="200" value={contrast} onChange={e => setContrast(parseInt(e.target.value))} className="w-full" disabled={isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} />
                    </div>
                </div>

                {/* Transform */}
                <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)] flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Transform</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => handleRotate('ccw')} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="flex items-center justify-center gap-2 px-2 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50"><RotateCcwIcon className="w-5 h-5"/></button>
                        <button onClick={() => handleRotate('cw')} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="flex items-center justify-center gap-2 px-2 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50"><RotateCwIcon className="w-5 h-5"/></button>
                        <button onClick={() => setIsCropping(true)} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="flex items-center justify-center gap-2 px-2 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50"><CropIcon className="w-5 h-5"/></button>
                    </div>
                    {isCropping && (
                        <div className="flex gap-2">
                            <button onClick={handleApplyCrop} className="w-full px-4 py-2 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md">Apply</button>
                            <button onClick={handleCancelCrop} className="w-full px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] rounded-md">Cancel</button>
                        </div>
                    )}
                </div>

                {/* Finalize */}
                <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)]">
                    <div className="flex gap-2">
                        <button onClick={handleReset} disabled={isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] rounded-md disabled:opacity-50">Reset All</button>
                        <button onClick={handleDownload} disabled={!editedImage || isLoading || isCropping || isGeneratingSamples || isGeneratingVariants || isMasking || isAnimating} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md disabled:opacity-50"><DownloadIcon className="w-5 h-5"/> Download</button>
                    </div>
                </div>
                
                {showVariants && (
                    <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)] flex-grow flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold">Image Variants</h4>
                            <button onClick={handleGenerateVariants} disabled={isGeneratingVariants} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
                                <RefreshCwIcon className={`w-5 h-5 ${isGeneratingVariants ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        {isGeneratingVariants ? (
                            <div className="text-center py-4 text-[var(--text-secondary)]">{variantsLoadingMessage || 'Generating...'}</div>
                        ) : variants.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 overflow-y-auto">
                                {variants.map((variant, i) => (
                                    <img key={i} src={variant} onClick={() => handleApplyVariant(variant)} alt={`Image variant ${i+1}`} className="w-full h-20 object-cover rounded-md cursor-pointer hover:ring-2 ring-blue-500 transition-all"/>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-4 text-[var(--text-secondary)]">Click refresh to generate variants.</div>
                        )}
                    </div>
                )}

                {showBgSamples && (
                    <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-lg border border-[var(--border-primary)] flex-grow flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold">Suggested Backgrounds</h4>
                            <button onClick={handleGenerateBgs} disabled={isGeneratingSamples} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"><RefreshCwIcon className={`w-5 h-5 ${isGeneratingSamples ? 'animate-spin' : ''}`} /></button>
                        </div>
                        {isGeneratingSamples && bgSamples.length === 0 ? <div className="text-center py-4 text-[var(--text-secondary)]">{bgLoadingMessage || 'Generating samples...'}</div> :
                         bgSamples.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 overflow-y-auto">
                                {bgSamples.map((sample, i) => (
                                    <img key={i} src={sample} onClick={() => handleApplyBg(sample)} alt="Background sample" className="w-full h-20 object-cover rounded-md cursor-pointer hover:ring-2 ring-blue-500 transition-all"/>
                                ))}
                            </div>
                        ) : <div className="text-center py-4 text-[var(--text-secondary)]">Click refresh to generate ideas.</div>
                        }
                    </div>
                )}
            </div>
            <div 
                ref={imageContainerRef}
                className="flex-grow bg-[var(--bg-secondary)]/50 rounded-lg border border-[var(--border-primary)] flex items-center justify-center p-2 relative overflow-hidden"
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
            >
                {isLoading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-30 rounded-lg">
                        <RefreshCwIcon className="w-10 h-10 animate-spin text-blue-400" />
                        <p className="mt-4 text-lg">{loadingMessage}</p>
                    </div>
                )}
                {editedImage ? 
                    <>
                        <img 
                            ref={imagePreviewRef}
                            src={editedImage.base64} 
                            alt="Edited preview" 
                            className="max-w-full max-h-full object-contain select-none pointer-events-none"
                            style={{
                                transform: `rotate(${rotation}deg)`,
                                filter: `brightness(${brightness}%) contrast(${contrast}%)`
                            }}
                        /> 
                        {isCropping && (
                            <div className="absolute inset-0 cursor-crosshair z-10">
                                {cropBox && (
                                    <div className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none" style={{ left: cropBox.x, top: cropBox.y, width: cropBox.width, height: cropBox.height }}></div>
                                )}
                            </div>
                        )}
                         {isMasking && (
                            <>
                                <canvas
                                    ref={maskCanvasRef}
                                    className="absolute top-0 left-0 w-full h-full z-20"
                                    style={{ cursor: 'none' }}
                                    onMouseDown={handleMaskMouseDown}
                                    onMouseMove={handleMaskMouseMove}
                                    onMouseUp={handleMaskMouseUp}
                                    onMouseLeave={() => {
                                        handleMaskMouseUp();
                                        setBrushCursorPosition(null);
                                    }}
                                />
                                {brushCursorPosition && (
                                    <div
                                        className="absolute rounded-full border-2 border-white bg-fuchsia-500/30 pointer-events-none z-20"
                                        style={{
                                            left: brushCursorPosition.x - brushSize / 2,
                                            top: brushCursorPosition.y - brushSize / 2,
                                            width: brushSize,
                                            height: brushSize,
                                        }}
                                    />
                                )}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--bg-secondary)]/80 p-3 rounded-lg flex items-center gap-4 z-20 border border-[var(--border-primary)] shadow-lg">
                                    <label htmlFor="brush-size" className="text-sm font-medium text-[var(--text-secondary)] whitespace-nowrap">Brush Size</label>
                                    <input type="range" id="brush-size" min="5" max="100" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-24" />
                                    <div className="w-px h-6 bg-[var(--border-primary)]"></div>
                                    <button onClick={handleApplyMask} className="px-4 py-2 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md text-sm font-semibold">Apply</button>
                                    <button onClick={handleCancelMask} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md text-sm font-semibold">Cancel</button>
                                </div>
                            </>
                        )}
                    </>
                    :
                    <p className="text-[var(--text-secondary)]">Image preview will appear here.</p>
                }
            </div>
        </div>
    );
    
    const renderUpload = () => (
         <div className="h-full flex flex-col items-center justify-center p-4 md:p-8">
            <div className="w-full flex flex-col lg:flex-row items-stretch justify-center gap-8 max-w-5xl">
                {/* Upload Section */}
                <div className="w-full lg:w-1/2 flex flex-col">
                    <label htmlFor="file-upload" className="flex-grow cursor-pointer p-8 border-2 border-dashed border-[var(--border-primary)] rounded-xl hover:border-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] flex flex-col items-center justify-center transition-colors">
                        <UploadCloudIcon className="w-16 h-16 text-[var(--text-secondary)] mb-4" />
                        <h2 className="text-xl font-semibold mb-2 text-center">Upload a Photo</h2>
                        <p className="text-[var(--text-secondary)] text-center">Drag and drop or click to select a file</p>
                        <p className="text-xs text-gray-600 mt-2">PNG, JPG, WEBP supported</p>
                    </label>
                    <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
                </div>
    
                {/* Separator */}
                <div className="flex items-center justify-center lg:flex-col my-4 lg:my-0 lg:mx-4">
                    <div className="h-px w-full lg:h-full lg:w-px bg-[var(--border-primary)]"></div>
                    <span className="px-4 text-[var(--text-secondary)] font-medium bg-[var(--bg-primary)]">OR</span>
                    <div className="h-px w-full lg:h-full lg:w-px bg-[var(--border-primary)]"></div>
                </div>

                {/* Generate Section */}
                <div className="w-full lg:w-1/2 flex flex-col">
                    <div className="flex-grow p-8 border-2 border-dashed border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center">
                        <SparkleIcon className="w-16 h-16 text-[var(--text-secondary)] mb-4" />
                        <h2 className="text-xl font-semibold mb-4 text-center">Generate with AI</h2>
                        
                        <div className="w-full flex flex-col gap-4">
                            <textarea
                                value={generationPrompt}
                                onChange={e => setGenerationPrompt(e.target.value)}
                                placeholder="A photorealistic image of a cat astronaut on the moon"
                                disabled={isLoading}
                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md p-2 text-sm placeholder-[var(--text-secondary)] focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                                rows={3}
                            />
                             <div>
                                <p className="text-sm font-medium text-[var(--text-secondary)] mb-2 text-center">Aspect Ratio</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map(ratio => (
                                        <button 
                                            key={ratio}
                                            onClick={() => setAspectRatio(ratio)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
                                                aspectRatio === ratio 
                                                ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' 
                                                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]'
                                            }`}
                                        >
                                            {ratio}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleGenerateImage}
                                disabled={isLoading || !generationPrompt.trim()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--bg-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                            >
                                <SparkleIcon className="w-5 h-5" />
                                Generate
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-full bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col relative">
             {error && (
                <div className="p-3 bg-red-900/60 text-red-200 flex items-center justify-center gap-3 border-b border-red-700">
                    <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-grow text-sm text-left">{error}</span>
                    <button onClick={() => setError(null)} className="p-1 rounded-full hover:bg-red-800/50" aria-label="Dismiss error">
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
            <div className="flex-grow">
              {originalImage ? renderEditor() : renderUpload()}
            </div>
            {showVideoPlayer && videoUrl && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 p-4">
                    <video src={videoUrl} controls autoPlay loop className="max-w-full max-h-[80%] rounded-lg shadow-2xl" />
                    <div className="mt-6 flex gap-4">
                        <a 
                            href={videoUrl} 
                            download={`animated-video-${Date.now()}.mp4`}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-accent)] text-[var(--text-on-accent)] hover:bg-[var(--bg-accent-hover)] rounded-md font-semibold"
                        >
                            <DownloadIcon className="w-5 h-5"/> Download
                        </a>
                        <button 
                            onClick={() => { 
                                setShowVideoPlayer(false); 
                                if(videoUrl) URL.revokeObjectURL(videoUrl); 
                                setVideoUrl(null); 
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-md font-semibold"
                        >
                            <XIcon className="w-5 h-5"/> Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
};