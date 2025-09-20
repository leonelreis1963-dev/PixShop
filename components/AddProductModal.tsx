/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { MagicWandIcon, PaletteIcon, SunIcon } from './icons';

type Tab = 'retouch' | 'adjust' | 'filters' | 'crop';

interface HistoryItem {
  type: Exclude<Tab, 'crop'>;
  prompt: string;
}

interface HistoryPanelProps {
  history: HistoryItem[];
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
}

const iconMap: Record<Exclude<Tab, 'crop'>, React.FC<{ className?: string }>> = {
  retouch: MagicWandIcon,
  adjust: SunIcon,
  filters: PaletteIcon,
};

const typeLabelMap: Record<Exclude<Tab, 'crop'>, string> = {
  retouch: 'Retoque',
  adjust: 'Ajuste',
  filters: 'Filtro',
};

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onClose, onSelect }) => {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-panel-title"
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 w-full max-w-lg m-4 flex flex-col gap-4 max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="history-panel-title" className="text-2xl font-bold text-center text-gray-100">
          Histórico de Prompts
        </h2>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhuma edição baseada em prompt foi feita ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {[...history].reverse().map((item, index) => {
                const Icon = iconMap[item.type];
                const typeLabel = typeLabelMap[item.type];

                return (
                  <li key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-shrink-0 pt-1">
                         <Icon className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-grow">
                        <p className="font-semibold text-gray-300">{typeLabel}</p>
                        <p className="text-gray-400 text-sm mt-1">"{item.prompt}"</p>
                      </div>
                      <button 
                        onClick={() => onSelect(item)}
                        className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                      >
                        Usar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-center mt-4">
          <button
            onClick={onClose}
            className="w-full max-w-xs bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
