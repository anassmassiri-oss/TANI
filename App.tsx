
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateImage, editImage } from './services/geminiService';
import { ASPECT_RATIOS } from './constants';
import type { AspectRatio, EditMode } from './types';
import { Spinner } from './components/Spinner';
import { BrushIcon, ClearIcon, DownloadIcon, SparklesIcon, UploadIcon, WandIcon } from './components/Icons';

const ImageComparator: React.FC<{ before: string; after: string }> = ({ before, after }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSliderPosition(Number(e.target.value));
    };
    
    const handleMove = (clientX: number) => {
         if (!containerRef.current) return;
         const rect = containerRef.current.getBoundingClientRect();
         const x = clientX - rect.left;
         let percentage = (x / rect.width) * 100;
         if (percentage < 0) percentage = 0;
         if (percentage > 100) percentage = 100;
         setSliderPosition(percentage);
    };

    const handleMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);

    return (
        <div className="w-full h-full flex flex-col gap-4">
            <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden group flex-grow select-none" onMouseMove={handleMouseMove} onTouchMove={handleTouchMove}>
                <img
                    src={before}
                    alt="Before edit"
                    className="absolute inset-0 w-full h-full object-contain"
                />
                <img
                    src={after}
                    alt="After edit"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                />
                 <div className="absolute inset-0 w-full h-full cursor-ew-resize">
                    <div
                        className="absolute top-0 bottom-0 w-1 bg-white/50 backdrop-blur-sm shadow-lg"
                        style={{ left: `calc(${sliderPosition}% - 2px)` }}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 -left-4 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-lg">
                            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
                        </div>
                    </div>
                 </div>
            </div>
             <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium text-slate-400">Before</span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderPosition}
                    onChange={handleSliderChange}
                    className="w-48"
                    aria-label="Image comparison slider"
                />
                <span className="text-sm font-medium text-slate-400">After</span>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [mode, setMode] = useState<EditMode>('generate');
  const [prompt, setPrompt] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [comparisonImage, setComparisonImage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Canvas refs
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{x: number, y: number} | null>(null);


  const clearState = () => {
    setError(null);
    setGeneratedImage(null);
    setComparisonImage(null);
  }

  const handleApiResponse = (imageBase64: string) => {
    const imageUrl = `data:image/jpeg;base64,${imageBase64}`;
    setGeneratedImage(imageUrl);
    if (mode === 'edit' && uploadedImage) {
        setComparisonImage(uploadedImage.dataUrl);
    }
    setHistory(prev => [imageUrl, ...prev].slice(0, 6));
  };

  const handleApiError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    setError(`Failed to generate image: ${errorMessage}`);
    console.error(err);
  };

  // Setup canvases when an image is uploaded
  useEffect(() => {
    const imageCanvas = imageCanvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!imageCanvas || !drawingCanvas || !uploadedImage) return;

    const img = new Image();
    img.src = uploadedImage.dataUrl;
    img.onload = () => {
        const ctx = imageCanvas.getContext('2d');
        const drawCtx = drawingCanvas.getContext('2d');
        if (!ctx || !drawCtx) return;

        // Set canvas dimensions to match image
        imageCanvas.width = drawingCanvas.width = img.naturalWidth;
        imageCanvas.height = drawingCanvas.height = img.naturalHeight;

        // Clear previous state
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

        // Draw the uploaded image on the bottom canvas
        ctx.drawImage(img, 0, 0);
    };
  }, [uploadedImage]);


  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Calculate scale factor
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    isDrawing.current = true;
    lastPos.current = coords;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const coords = getCanvasCoords(e);
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx || !coords || !lastPos.current) return;
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.lineWidth = brushSize * 2; // Diameter
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw a line from last position to current
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    // Draw a circle at the new position to fill gaps
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, brushSize, 0, 2 * Math.PI);
    ctx.fill();

    lastPos.current = coords;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  const clearMask = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const getMaskAsBase64 = (): string | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;

    // Check if the canvas is empty (all transparent)
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const pixelBuffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const isCanvasEmpty = !pixelBuffer.some(color => color !== 0);

    if (isCanvasEmpty) return null;
    
    // Create a temporary canvas to draw the black and white mask
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // White background (unchanged area)
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw the user's drawing in black (area to edit)
    tempCtx.drawImage(canvas, 0, 0);

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }


  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }

    setIsLoading(true);
    clearState();

    try {
      const imageBase64 = await generateImage(prompt, aspectRatio);
      handleApiResponse(imageBase64);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, aspectRatio]);
  
  const handleEdit = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter an edit instruction.');
      return;
    }
    if (!uploadedImage) {
      setError('Please upload an image to edit.');
      return;
    }
    
    setIsLoading(true);
    clearState();

    try {
      const base64Data = uploadedImage.dataUrl.split(',')[1];
      const maskBase64Data = getMaskAsBase64();
      const imageBase64 = await editImage(prompt, base64Data, uploadedImage.mimeType, maskBase64Data ?? undefined);
      handleApiResponse(imageBase64);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, uploadedImage]);


  const processFile = (file: File) => {
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload a PNG, JPG, or WEBP image.');
      return;
    }
    const maxSizeInBytes = 8 * 1024 * 1024; // 8MB
    if (file.size > maxSizeInBytes) {
      setError('File is too large. Maximum size is 8MB.');
      return;
    }
    
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setUploadedImage({ dataUrl, mimeType: file.type });
    };
    reader.onerror = () => {
        setError('Failed to read the file.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isEntering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };


  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    const sanitizedPrompt = prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `ai-image-${sanitizedPrompt || 'edited'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleReEdit = () => {
    if (!generatedImage) return;

    const mimeTypeMatch = generatedImage.match(/data:(image\/\w+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

    setMode('edit');
    setUploadedImage({ dataUrl: generatedImage, mimeType });
    setPrompt('');
    setGeneratedImage(null);
    setComparisonImage(null);
    setError(null);
    
    controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isGenerateDisabled = isLoading || !prompt.trim();
  const isEditDisabled = isLoading || !prompt.trim() || !uploadedImage;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
            AI Image Editor
          </h1>
          <p className="text-slate-400 mt-2">Powered by Gemini API</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Section */}
          <div ref={controlsRef} className="bg-slate-800/50 p-6 rounded-2xl shadow-lg border border-slate-700">
             {/* Mode Tabs */}
            <div className="flex border-b border-slate-700 mb-6">
              <button 
                onClick={() => setMode('generate')}
                className={`flex-1 py-2 font-medium transition-colors duration-200 ${mode === 'generate' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-white'}`}
              >Generate</button>
              <button 
                onClick={() => setMode('edit')}
                className={`flex-1 py-2 font-medium transition-colors duration-200 ${mode === 'edit' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-white'}`}
              >Edit</button>
            </div>

            <div className="space-y-6">
              {mode === 'edit' && (
                <div>
                   <label className="block text-lg font-medium text-slate-300 mb-2">
                      Upload & Mask
                    </label>
                  {uploadedImage ? (
                     <div className="space-y-4">
                        <div className="relative group w-full aspect-square bg-slate-900/50 rounded-lg overflow-hidden">
                            <canvas ref={imageCanvasRef} className="absolute inset-0 w-full h-full object-contain"></canvas>
                            <canvas 
                                ref={drawingCanvasRef}
                                className="absolute inset-0 w-full h-full object-contain opacity-70 cursor-crosshair"
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                            ></canvas>
                        </div>
                        <div className="bg-slate-700/50 p-3 rounded-lg flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <BrushIcon />
                                <input 
                                    type="range"
                                    min="5"
                                    max="50"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(Number(e.target.value))}
                                    className="w-32"
                                    aria-label="Brush size"
                                />
                            </div>
                            <button onClick={clearMask} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"><ClearIcon /> Clear Mask</button>
                            <button onClick={() => { setUploadedImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-sm bg-red-600 text-white py-1 px-3 rounded-md hover:bg-red-700 transition-colors">
                                Remove
                            </button>
                        </div>
                     </div>
                  ) : (
                    <div 
                      onDrop={handleDrop}
                      onDragOver={(e) => handleDragEvents(e, true)}
                      onDragLeave={(e) => handleDragEvents(e, false)}
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-500 bg-slate-800' : 'border-slate-600 hover:border-slate-500'}`}
                    >
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
                        <UploadIcon className="mx-auto h-10 w-10 text-slate-500 mb-2" />
                        <p className="text-slate-400">Drag & drop or <span className="font-semibold text-indigo-400" onClick={() => fileInputRef.current?.click()}>click to upload</span></p>
                        <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP (Max 8MB)</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="prompt" className="block text-lg font-medium text-slate-300 mb-2">
                  {mode === 'generate' ? 'Your Prompt' : 'Edit Instruction'}
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={mode === 'generate' ? 'e.g., A majestic lion wearing a crown, cinematic lighting' : 'e.g., Add sunglasses to the person'}
                  className="w-full h-28 p-3 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none"
                  disabled={isLoading}
                />
              </div>

             {mode === 'generate' && (
               <div>
                  <label className="block text-lg font-medium text-slate-300 mb-3">
                    Aspect Ratio
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {Object.keys(ASPECT_RATIOS).map((key) => (
                      <button
                        key={key}
                        onClick={() => setAspectRatio(key as AspectRatio)}
                        className={`py-2 px-4 rounded-lg font-semibold transition duration-200 text-sm ${
                          aspectRatio === key
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                        disabled={isLoading}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={mode === 'generate' ? handleGenerate : handleEdit}
                disabled={mode === 'generate' ? isGenerateDisabled : isEditDisabled}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-transform transform active:scale-95 duration-200"
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    {mode === 'generate' ? 'Generating...' : 'Applying Edit...'}
                  </>
                ) : (
                  <>
                    {mode === 'generate' ? <SparklesIcon /> : <WandIcon />}
                    {mode === 'generate' ? 'Generate Image' : 'Apply Edit'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Output Section */}
          <div className="bg-slate-800/50 p-6 rounded-2xl shadow-lg border border-slate-700 flex flex-col items-center justify-center min-h-[400px]">
            {isLoading && (
              <div className="text-center">
                <Spinner size="lg" />
                <p className="mt-4 text-slate-400">The AI is painting your vision...</p>
              </div>
            )}
            {error && (
              <div className="text-center text-red-400 bg-red-900/50 border border-red-700 p-4 rounded-lg w-full">
                <p className="font-semibold">Error</p>
                <p>{error}</p>
              </div>
            )}
            {!isLoading && !error && generatedImage && (
                <>
                    {comparisonImage ? (
                        <ImageComparator before={comparisonImage} after={generatedImage} />
                    ) : (
                        <div className="w-full h-full flex flex-col gap-4">
                            <div className="relative w-full rounded-lg overflow-hidden group flex-grow">
                                <img
                                    src={generatedImage}
                                    alt="AI generated"
                                    className="w-full h-full object-contain"
                                />
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4">
                                    <button 
                                        onClick={handleDownload}
                                        className="flex items-center gap-2 bg-slate-100/90 text-slate-900 font-bold py-2 px-5 rounded-lg hover:bg-white transition-all transform hover:scale-105"
                                    >
                                        <DownloadIcon />
                                        Download
                                    </button>
                                    <button 
                                        onClick={handleReEdit}
                                        className="flex items-center gap-2 bg-indigo-600/90 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-all transform hover:scale-105"
                                    >
                                        <WandIcon />
                                        Edit This Image
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                     {history.length > 0 && (
                     <div className="pt-4 w-full">
                         <h3 className="text-sm font-medium text-slate-400 mb-2">History</h3>
                         <div className="grid grid-cols-6 gap-2">
                             {history.map((imgSrc, index) => (
                                <img
                                    key={index}
                                    src={imgSrc}
                                    alt={`History item ${index + 1}`}
                                    className="w-full h-full object-cover rounded-md cursor-pointer hover:ring-2 ring-indigo-500 transition-all"
                                    onClick={() => {
                                        setGeneratedImage(imgSrc);
                                        setComparisonImage(null); // Clear comparator when clicking history
                                    }}
                                />
                             ))}
                         </div>
                     </div>
                 )}
                </>
            )}
            {!isLoading && !error && !generatedImage && (
              <div className="text-center text-slate-500">
                <SparklesIcon className="mx-auto h-16 w-16 mb-4" />
                <h3 className="text-xl font-semibold text-slate-400">Your masterpiece awaits</h3>
                <p>{mode === 'generate' ? 'Enter a prompt to create an image.' : 'Upload an image and tell me how to edit it.'}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;