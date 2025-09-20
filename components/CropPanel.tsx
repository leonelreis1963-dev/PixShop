/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface CropPanelProps {
  onApplyCrop: () => void;
  onSetAspect: (aspect: number | undefined) => void;
  isLoading: boolean;
  isCropping: boolean;
  outputSize: { width: number; height: number } | null;
  setOutputSize: (size: { width: number; height: number }) => void;
}

type AspectRatio = 'livre' | '1:1' | '16:9';

const CropPanel: React.FC<CropPanelProps> = ({ onApplyCrop, onSetAspect, isLoading, isCropping, outputSize, setOutputSize }) => {
  const [activeAspect, setActiveAspect] = useState<AspectRatio>('livre');
  
  const handleAspectChange = (aspect: AspectRatio, value: number | undefined) => {
    setActiveAspect(aspect);
    onSetAspect(value);
  }

  const aspects: { name: AspectRatio, value: number | undefined }[] = [
    { name: 'livre', value: undefined },
    { name: '1:1', value: 1 / 1 },
    { name: '16:9', value: 16 / 9 },
  ];
  
  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (outputSize) {
      const newWidth = parseInt(e.target.value, 10) || 0;
      setOutputSize({ ...outputSize, width: newWidth });
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (outputSize) {
      const newHeight = parseInt(e.target.value, 10) || 0;
      setOutputSize({ ...outputSize, height: newHeight });
    }
  };


  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <div className="w-full flex flex-col items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-300">Cortar Imagem</h3>
        <p className="text-sm text-gray-400 -mt-2">Clique e arraste na imagem para selecionar uma área para cortar.</p>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-400">Proporção:</span>
          {aspects.map(({ name, value }) => (
            <button
              key={name}
              onClick={() => handleAspectChange(name, value)}
              disabled={isLoading}
              className={`px-4 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 ${
                activeAspect === name 
                ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20' 
                : 'bg-white/10 hover:bg-white/20 text-gray-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <button
          onClick={onApplyCrop}
          disabled={isLoading || !isCropping}
          className="w-full max-w-xs mt-2 bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        >
          Aplicar Corte
        </button>
      </div>

      <div className="w-full border-t border-gray-600 mt-4 pt-4 flex flex-col items-center gap-3">
        <h4 className="text-md font-semibold text-gray-300">Dimensões de Saída</h4>
        <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
                <label htmlFor="width-input" className="text-xs font-medium text-gray-400">Largura (px)</label>
                <input
                    id="width-input"
                    type="number"
                    value={outputSize?.width || ''}
                    onChange={handleWidthChange}
                    className="w-28 bg-gray-900 border border-gray-600 text-gray-200 rounded-md p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    disabled={isLoading || !outputSize}
                />
            </div>
            <span className="text-gray-500 pt-5">x</span>
            <div className="flex flex-col items-center gap-1">
                <label htmlFor="height-input" className="text-xs font-medium text-gray-400">Altura (px)</label>
                <input
                    id="height-input"
                    type="number"
                    value={outputSize?.height || ''}
                    onChange={handleHeightChange}
                    className="w-28 bg-gray-900 border border-gray-600 text-gray-200 rounded-md p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    disabled={isLoading || !outputSize}
                />
            </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Define o tamanho da imagem para todas as edições geradas por IA.</p>
    </div>

    </div>
  );
};

export default CropPanel;