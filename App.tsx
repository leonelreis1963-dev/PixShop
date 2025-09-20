/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage, generateObjectMask } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon, HistoryIcon, InfoIcon, WarningIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import DownloadModal from './components/DownloadModal';
import ImageSizeWarningModal from './components/ImageSizeWarningModal';
import HistoryPanel from './components/AddProductModal';
import MaskingTools from './components/MaskingTools';

// Helper to get image dimensions from a File object
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (typeof e.target?.result !== 'string') {
                return reject(new Error("File could not be read as a data URL."));
            }
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = (err) => reject(err);
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
};

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): Promise<File> => {
    return fetch(dataurl)
        .then(res => res.blob())
        .then(blob => new File([blob], filename, { type: blob.type }));
};

// Helper to resize an image file while maintaining aspect ratio
const resizeImageFile = (file: File, maxSize: number): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (typeof e.target?.result !== 'string') {
                return reject(new Error("File could not be read as a data URL."));
            }
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const aspectRatio = width / height;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        width = maxSize;
                        height = width / aspectRatio;
                    } else {
                        height = maxSize;
                        width = height * aspectRatio;
                    }
                }
                
                width = Math.round(width);
                height = Math.round(height);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error("Could not get canvas context."));
                }
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        return reject(new Error("Canvas to Blob conversion failed."));
                    }
                    const newFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now(),
                    });
                    resolve(newFile);
                }, file.type, 0.95);
            };
            img.onerror = (err) => reject(err);
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
};

const ErrorModal: React.FC<{ title: string; children: React.ReactNode; onClose: () => void; }> = ({ title, children, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 w-full max-w-lg m-4 flex flex-col gap-4 text-center items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-900/50 border border-gray-700/50">
          <WarningIcon className="w-8 h-8 text-red-400" />
        </div>
        <h2 id="error-modal-title" className="text-2xl font-bold text-gray-100">
          {title}
        </h2>
        <div className="text-left">{children}</div>
        <button
            onClick={onClose}
            className="w-full mt-4 bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
        >
            Tentar Novamente
        </button>
      </div>
    </div>
  );
};

type Tab = 'retouch' | 'adjust' | 'filters' | 'crop';
type MaskTool = 'brush' | 'magic-preserve' | 'eraser';
type HistoryItem = { type: Exclude<Tab, 'crop'>; prompt: string };

const MAX_IMAGE_DIMENSION = 2048;

const App: React.FC = () => {
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('A IA está fazendo sua mágica...');
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [outputSize, setOutputSize] = useState<{ width: number; height: number } | null>(null);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [isSizeWarningModalOpen, setIsSizeWarningModalOpen] = useState<boolean>(false);
  const [fileToProcess, setFileToProcess] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const editMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const preserveMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{ x: number, y: number } | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [maskTool, setMaskTool] = useState<MaskTool>('brush');
  const [hasEditMask, setHasEditMask] = useState(false);
  const [hasPreserveMask, setHasPreserveMask] = useState(false);
  
  const [promptHistory, setPromptHistory] = useState<HistoryItem[]>([]);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState<boolean>(false);
  const [customAdjustmentPrompt, setCustomAdjustmentPrompt] = useState('');
  const [customFilterPrompt, setCustomFilterPrompt] = useState('');

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  const clearMasks = useCallback(() => {
    const canvases = [editMaskCanvasRef.current, preserveMaskCanvasRef.current];
    canvases.forEach(canvas => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
    setHasEditMask(false);
    setHasPreserveMask(false);
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    if (imgRef.current) {
        const { width, height } = imgRef.current.getBoundingClientRect();
        [editMaskCanvasRef, preserveMaskCanvasRef].forEach(ref => {
            if (ref.current) {
                ref.current.width = width;
                ref.current.height = height;
            }
        });
    }
  }, []);

  // Sync canvas size when image loads or window resizes
  useEffect(() => {
      syncCanvasDimensions();
      const handleResize = () => syncCanvasDimensions();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [currentImageUrl, syncCanvasDimensions]);
  
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, [history, historyIndex]);

  const addPromptToHistory = useCallback((type: HistoryItem['type'], prompt: string) => {
      setPromptHistory(prev => [...prev, { type, prompt }]);
  }, []);

  const proceedWithImageUpload = useCallback(async (file: File) => {
    try {
        const { width, height } = await getImageDimensions(file);
        setOutputSize({ width, height });
        setHistory([file]);
        setHistoryIndex(0);
        setActiveTab('retouch');
        setCrop(undefined);
        setCompletedCrop(undefined);
        setPromptHistory([]);
        setCustomAdjustmentPrompt('');
        setCustomFilterPrompt('');
        clearMasks();
    } catch (err) {
        setError('Não foi possível carregar as dimensões da imagem.');
        console.error(err);
    }
  }, [clearMasks]);

  const handleImageUpload = useCallback(async (file: File) => {
    setError(null);
    try {
        const { width, height } = await getImageDimensions(file);
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            setFileToProcess(file);
            setIsSizeWarningModalOpen(true);
        } else {
            await proceedWithImageUpload(file);
        }
    } catch (err) {
        setError('Não foi possível carregar as dimensões da imagem.');
        console.error(err);
    }
  }, [proceedWithImageUpload]);

  const handleConfirmResize = useCallback(async () => {
      if (!fileToProcess) return;
      setIsSizeWarningModalOpen(false);
      try {
          const resizedFile = await resizeImageFile(fileToProcess, MAX_IMAGE_DIMENSION);
          await proceedWithImageUpload(resizedFile);
      } catch (err) {
          setError('Falha ao redimensionar a imagem.');
          console.error(err);
      } finally {
          setFileToProcess(null);
      }
  }, [fileToProcess, proceedWithImageUpload]);
  
  const handleContinueAnyway = useCallback(async () => {
      if (!fileToProcess) return;
      setIsSizeWarningModalOpen(false);
      await proceedWithImageUpload(fileToProcess);
      setFileToProcess(null);
  }, [fileToProcess, proceedWithImageUpload]);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) {
      setError('Nenhuma imagem carregada para editar.');
      return;
    }
    
    if (!prompt.trim()) {
        setError('Por favor, insira uma descrição para sua edição.');
        return;
    }

    if (!hasEditMask) {
        setError('Por favor, pinte sobre a área da imagem que você deseja editar.');
        return;
    }

    if (!outputSize) {
        setError('As dimensões da imagem de saída não foram definidas.');
        return;
    }

    setIsLoading(true);
    setLoadingMessage('A IA está fazendo sua mágica...');
    setError(null);
    
    try {
        const img = imgRef.current;
        if (!img) throw new Error("Image element not found");

        const scaleAndExportMask = async (sourceCanvas: HTMLCanvasElement | null): Promise<File | null> => {
            if (!sourceCanvas) return null;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.naturalWidth;
            tempCanvas.height = img.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) throw new Error("Could not create temp canvas context");
            tempCtx.drawImage(sourceCanvas, 0, 0, img.naturalWidth, img.naturalHeight);
            const dataUrl = tempCanvas.toDataURL('image/png');
            // Don't convert if it's empty
            if (dataUrl === 'data:,' || tempCanvas.getContext('2d')?.getImageData(0,0,1,1).data[3] === 0) {
                 const blankData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
                 let isTrulyEmpty = true;
                 for (let i = 3; i < blankData.length; i+= 4) {
                     if (blankData[i] > 0) {
                         isTrulyEmpty = false;
                         break;
                     }
                 }
                 if (isTrulyEmpty) return null;
            }
            return await dataURLtoFile(dataUrl, 'mask.png');
        };

        const editMaskFile = await scaleAndExportMask(editMaskCanvasRef.current);
        const preserveMaskFile = hasPreserveMask ? await scaleAndExportMask(preserveMaskCanvasRef.current) : null;
        
        if (!editMaskFile) {
            setError('A máscara de edição parece estar vazia.');
            setIsLoading(false);
            return;
        }

        const editedImageUrl = await generateEditedImage(currentImage, editMaskFile, preserveMaskFile, prompt, outputSize);
        const newImageFile = await dataURLtoFile(editedImageUrl, `editada-${Date.now()}.png`);
        
        addImageToHistory(newImageFile);
        addPromptToHistory('retouch', prompt);
        clearMasks();

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        setError(`Falha ao gerar a imagem. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, addImageToHistory, outputSize, addPromptToHistory, hasEditMask, hasPreserveMask, clearMasks]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) {
      setError('Nenhuma imagem carregada para aplicar um filtro.');
      return;
    }
    
    if (!outputSize) {
        setError('As dimensões da imagem de saída não foram definidas.');
        return;
    }
    
    setIsLoading(true);
    setLoadingMessage('A IA está fazendo sua mágica...');
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt, outputSize);
        const newImageFile = await dataURLtoFile(filteredImageUrl, `filtrada-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        addPromptToHistory('filters', filterPrompt);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        setError(`Falha ao aplicar o filtro. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, outputSize, addPromptToHistory]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) {
      setError('Nenhuma imagem carregada para aplicar um ajuste.');
      return;
    }

    if (!outputSize) {
        setError('As dimensões da imagem de saída não foram definidas.');
        return;
    }
    
    setIsLoading(true);
    setLoadingMessage('A IA está fazendo sua mágica...');
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt, outputSize);
        const newImageFile = await dataURLtoFile(adjustedImageUrl, `ajustada-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        addPromptToHistory('adjust', adjustmentPrompt);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        setError(`Falha ao aplicar o ajuste. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, outputSize, addPromptToHistory]);

  const handleApplyCrop = useCallback(async () => {
    if (!completedCrop || !imgRef.current) {
        setError('Por favor, selecione uma área para cortar.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError('Não foi possível processar o corte.');
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = await dataURLtoFile(croppedImageUrl, `cortada-${Date.now()}.png`);
    addImageToHistory(newImageFile);

  }, [completedCrop, addImageToHistory]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      clearMasks();
    }
  }, [canUndo, historyIndex, clearMasks]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      clearMasks();
    }
  }, [canRedo, historyIndex, clearMasks]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      clearMasks();
    }
  }, [history, clearMasks]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setOutputSize(null);
      setPromptHistory([]);
      setCustomAdjustmentPrompt('');
      setCustomFilterPrompt('');
      clearMasks();
  }, [clearMasks]);

  const handleDownload = useCallback(() => {
      if (currentImage) {
          setIsDownloadModalOpen(true);
      }
  }, [currentImage]);
  
  const handleConfirmDownload = useCallback(({ format, quality }: { format: 'png' | 'jpeg', quality: number }) => {
    if (!currentImageUrl || !currentImage) {
        setError('Não há imagem para baixar.');
        return;
    }

    setError(null);

    const mimeType = `image/${format}`;
    const fileExtension = format === 'jpeg' ? 'jpg' : 'png';
    const baseName = currentImage.name.replace(/\.[^/.]+$/, "");
    const downloadFileName = `editada-${baseName || 'imagem'}.${fileExtension}`;

    const img = new Image();
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Não foi possível criar a imagem para download.');
            }
            ctx.drawImage(img, 0, 0);

            const qualityValue = format === 'jpeg' ? quality / 100 : undefined;
            const dataUrl = canvas.toDataURL(mimeType, qualityValue);

            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = downloadFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsDownloadModalOpen(false);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
            setError(`Falha ao exportar a imagem. ${errorMessage}`);
            setIsDownloadModalOpen(false);
        }
    };
    img.onerror = () => {
        setError('Falha ao carregar a imagem para exportação.');
        setIsDownloadModalOpen(false);
    }
    img.src = currentImageUrl;

  }, [currentImage, currentImageUrl]);

  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  };

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = editMaskCanvasRef.current; // Use any canvas for bounds
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const drawLine = (ctx: CanvasRenderingContext2D, start: {x: number, y: number}, end: {x: number, y: number}) => {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeTab !== 'retouch' || maskTool === 'magic-preserve') return;
    setIsDrawing(true);
    lastPos.current = getPointerPos(e);
  };
  
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || activeTab !== 'retouch') return;
    e.preventDefault(); // Prevent scrolling on touch devices
    
    const pos = getPointerPos(e);
    if (pos && lastPos.current) {
        const setupContext = (ctx: CanvasRenderingContext2D) => {
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        };

        if (maskTool === 'brush') {
            const ctx = editMaskCanvasRef.current?.getContext('2d');
            if (ctx) {
                setupContext(ctx);
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = 'rgba(75, 128, 255, 0.7)';
                drawLine(ctx, lastPos.current, pos);
            }
        } else { // eraser
            [editMaskCanvasRef.current, preserveMaskCanvasRef.current].forEach(canvas => {
                const ctx = canvas?.getContext('2d');
                if (ctx) {
                    setupContext(ctx);
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                    drawLine(ctx, lastPos.current!, pos);
                }
            });
        }
        lastPos.current = pos;
    }
  };
  
  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPos.current = null;
    
    const checkCanvasContent = (canvas: HTMLCanvasElement | null): boolean => {
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return true;
        }
        return false;
    };
    
    setHasEditMask(checkCanvasContent(editMaskCanvasRef.current));
    setHasPreserveMask(checkCanvasContent(preserveMaskCanvasRef.current));
  };
  
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (maskTool !== 'magic-preserve' || isLoading || !currentImage) return;

    const pos = getPointerPos(e);
    const img = imgRef.current;

    if (!pos || !img) return;

    // Scale click coordinates to natural image size
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const clickPoint = {
        x: Math.round(pos.x * scaleX),
        y: Math.round(pos.y * scaleY),
    };

    setIsLoading(true);
    setLoadingMessage('A IA está analisando o objeto...');
    setError(null);

    try {
        const maskDataUrl = await generateObjectMask(currentImage, clickPoint);
        
        const maskImage = new Image();
        maskImage.onload = () => {
            const canvas = preserveMaskCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Use composite operation to color the white parts of the mask green
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous mask
            ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = 'rgba(75, 255, 128, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore(); // Restore composite operation

            setHasPreserveMask(true);
        };
        maskImage.onerror = () => {
            setError("Falha ao carregar a máscara de objeto gerada.");
        };
        maskImage.src = maskDataUrl;

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        setError(`Falha ao gerar a máscara de objeto. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage('A IA está fazendo sua mágica...');
    }
  };

  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
      setActiveTab(item.type);
      if (item.type === 'retouch') {
          setPrompt(item.prompt);
      } else if (item.type === 'adjust') {
          setCustomAdjustmentPrompt(item.prompt);
      } else if (item.type === 'filters') {
          setCustomFilterPrompt(item.prompt);
      }
      setIsHistoryPanelOpen(false);
  }, []);

  const renderContent = () => {
    if (error) {
       return (
           <ErrorModal title="Ocorreu um Erro" onClose={() => setError(null)}>
               <p className="text-md text-red-400">{error}</p>
           </ErrorModal>
        );
    }
    
    if (!currentImageUrl) {
      return <StartScreen onFileSelect={handleFileSelect} />;
    }

    const imageDisplay = (
      <div className="relative" style={{ touchAction: activeTab === 'retouch' ? 'none' : 'auto' }}>
        {/* Base image is the original, always at the bottom */}
        {originalImageUrl && (
            <img
                key={originalImageUrl}
                src={originalImageUrl}
                alt="Original"
                className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
            />
        )}
        {/* The current image is an overlay that fades in/out for comparison */}
        <img
            ref={imgRef}
            key={currentImageUrl}
            src={currentImageUrl}
            alt="Current"
            onLoad={syncCanvasDimensions} // Sync canvas on image load
            className={`absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing ? 'opacity-0' : 'opacity-100'}`}
        />
        {/* The mask canvases, interactive only on retouch tab */}
        {activeTab === 'retouch' && (
          <>
            <canvas
              ref={preserveMaskCanvasRef}
              className="absolute top-0 left-0 w-full h-full object-contain rounded-xl pointer-events-none opacity-90"
            />
            <canvas
              ref={editMaskCanvasRef}
              className={`absolute top-0 left-0 w-full h-full object-contain rounded-xl ${
                maskTool === 'magic-preserve' ? 'cursor-crosshair' : (isDrawing ? 'cursor-none' : 'cursor-crosshair')
              }`}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp} // End drawing if pointer leaves canvas
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              onClick={handleCanvasClick}
            />
          </>
        )}
      </div>
    );
    
    // For ReactCrop, we need a single image element. We'll use the current one.
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={`crop-${currentImageUrl}`}
        src={currentImageUrl} 
        alt="Crop this image"
        className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
      />
    );

    const tabLabels: Record<Tab, string> = {
        retouch: 'Retocar',
        adjust: 'Ajustar',
        filters: 'Filtros',
        crop: 'Cortar'
    };


    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20">
            {isLoading && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">{loadingMessage}</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                {cropImageElement}
              </ReactCrop>
            ) : imageDisplay }
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'crop', 'adjust', 'filters'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tabLabels[tab]}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4 w-full">
                    <div className="w-full text-center p-4 bg-gray-900/50 border border-gray-700/50 rounded-lg">
                        <h3 className="text-xl font-bold text-gray-100">
                            <span className="text-blue-400">Passo 1:</span> Pinte a Imagem
                        </h3>
                        <p className="text-gray-400 mt-1">Use o <span className="text-blue-300 font-semibold">Pincel de Edição</span> para cobrir o que quer mudar e a <span className="text-green-300 font-semibold">Seleção Mágica</span> para escolher o que quer manter.</p>
                    </div>
                    <MaskingTools
                      brushSize={brushSize}
                      onBrushSizeChange={setBrushSize}
                      tool={maskTool}
                      onToolChange={setMaskTool}
                      onClearMask={clearMasks}
                    />
            
                    <div className={`w-full flex flex-col items-center gap-4 transition-all duration-500 ease-in-out ${hasEditMask ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        <div className="w-full text-center p-4 bg-gray-900/50 border border-gray-700/50 rounded-lg mt-4">
                            <h3 className="text-xl font-bold text-gray-100">
                                <span className="text-blue-400">Passo 2:</span> Descreva sua Edição
                            </h3>
                            <p className="text-gray-400 mt-1">Agora, diga à IA o que fazer na área azul que você pintou.</p>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="ex: 'remova este objeto' ou 'mude a cor para vermelho'"
                                className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isLoading || !hasEditMask}
                            />
                            <button 
                                type="submit"
                                className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                                disabled={isLoading || !prompt.trim() || !hasEditMask}
                            >
                                Gerar
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {activeTab === 'crop' && <CropPanel 
              onApplyCrop={handleApplyCrop} 
              onSetAspect={setAspect} 
              isLoading={isLoading} 
              isCropping={!!completedCrop?.width && completedCrop.width > 0} 
              outputSize={outputSize}
              setOutputSize={setOutputSize}
            />}
            {activeTab === 'adjust' && <AdjustmentPanel 
                onApplyAdjustment={handleApplyAdjustment} 
                isLoading={isLoading}
                customPrompt={customAdjustmentPrompt}
                onCustomPromptChange={setCustomAdjustmentPrompt}
            />}
            {activeTab === 'filters' && <FilterPanel 
                onApplyFilter={handleApplyFilter} 
                isLoading={isLoading} 
                customPrompt={customFilterPrompt}
                onCustomPromptChange={setCustomFilterPrompt}
            />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Desfazer
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Refazer
            </button>
             <button 
                onClick={() => setIsHistoryPanelOpen(true)}
                disabled={promptHistory.length === 0}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="View prompt history"
            >
                <HistoryIcon className="w-5 h-5 mr-2" />
                Histórico
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label="Press and hold to see original image"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Comparar
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Resetar
            </button>
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Enviar Nova
            </button>

            <button 
                onClick={handleDownload}
                disabled={!currentImage}
                className="flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none"
            >
                Baixar Imagem
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentImage ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
      {isHistoryPanelOpen && (
        <HistoryPanel
            history={promptHistory}
            onClose={() => setIsHistoryPanelOpen(false)}
            onSelect={handleSelectHistoryItem}
        />
      )}
      {isDownloadModalOpen && (
        <DownloadModal
            onClose={() => setIsDownloadModalOpen(false)}
            onDownload={handleConfirmDownload}
        />
      )}
      {isSizeWarningModalOpen && (
        <ImageSizeWarningModal
            onClose={() => {
                setIsSizeWarningModalOpen(false);
                setFileToProcess(null);
            }}
            onConfirm={handleConfirmResize}
            onContinue={handleContinueAnyway}
        />
      )}
    </div>
  );
};

export default App;