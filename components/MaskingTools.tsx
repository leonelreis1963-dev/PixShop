/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { BrushIcon, EraserIcon, MagicWandIcon } from './icons';

type MaskTool = 'brush' | 'magic-preserve' | 'eraser';

interface MaskingToolsProps {
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  tool: MaskTool;
  onToolChange: (tool: MaskTool) => void;
  onClearMask: () => void;
}

const MaskingTools: React.FC<MaskingToolsProps> = ({
  brushSize,
  onBrushSizeChange,
  tool,
  onToolChange,
  onClearMask,
}) => {
  return (
    <div className="w-full flex flex-col items-center gap-4 bg-gray-800/50 border border-gray-700 rounded-lg p-3">
        <div className="w-full flex items-center justify-center gap-4">
             <button 
                onClick={() => onToolChange('brush')}
                className={`flex items-center gap-2 py-2 px-4 rounded-md transition-colors ${tool === 'brush' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10'}`}
            >
                <BrushIcon className="w-5 h-5" />
                Pincel de Edição
            </button>
            <button 
                onClick={() => onToolChange('magic-preserve')}
                className={`flex items-center gap-2 py-2 px-4 rounded-md transition-colors ${tool === 'magic-preserve' ? 'bg-green-500/20 text-green-300' : 'text-gray-400 hover:bg-white/10'}`}
            >
                <MagicWandIcon className="w-5 h-5" />
                Seleção Mágica
            </button>
            <button 
                onClick={() => onToolChange('eraser')}
                className={`flex items-center gap-2 py-2 px-4 rounded-md transition-colors ${tool === 'eraser' ? 'bg-pink-500/20 text-pink-300' : 'text-gray-400 hover:bg-white/10'}`}
            >
                <EraserIcon className="w-5 h-5" />
                Borracha
            </button>
             <button 
                onClick={onClearMask}
                className="text-gray-400 hover:bg-white/10 py-2 px-4 rounded-md transition-colors"
            >
                Limpar Máscaras
            </button>
        </div>
        <div className="w-full max-w-sm flex items-center gap-3">
            <span className="text-sm text-gray-400">Tamanho:</span>
            <input
              type="range"
              min="5"
              max="100"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
            />
            <span className="text-sm font-semibold text-gray-300 w-8 text-center">{brushSize}</span>
        </div>
    </div>
  );
};

export default MaskingTools;