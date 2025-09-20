/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';

interface DownloadModalProps {
  onClose: () => void;
  onDownload: (options: { format: 'png' | 'jpeg', quality: number }) => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({ onClose, onDownload }) => {
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(92);

  const handleDownloadClick = () => {
    onDownload({ format, quality });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-modal-title"
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 w-full max-w-md m-4 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="download-modal-title" className="text-2xl font-bold text-center text-gray-100">
          Opções de Exportação
        </h2>

        <div className="flex flex-col gap-3">
          <label className="text-md font-semibold text-gray-300">Formato</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFormat('png')}
              className={`w-full font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                format === 'png'
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40'
                  : 'text-gray-300 bg-white/10 hover:text-white hover:bg-white/20'
              }`}
            >
              PNG
            </button>
            <button
              onClick={() => setFormat('jpeg')}
              className={`w-full font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                format === 'jpeg'
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40'
                  : 'text-gray-300 bg-white/10 hover:text-white hover:bg-white/20'
              }`}
            >
              JPEG
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">
            {format === 'png' ? 'Ideal para alta qualidade e transparência.' : 'Ideal para tamanhos de arquivo menores.'}
          </p>
        </div>

        {format === 'jpeg' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="flex justify-between items-center">
                <label htmlFor="quality-slider" className="text-md font-semibold text-gray-300">Qualidade</label>
                <span className="text-lg font-bold text-blue-400 bg-gray-900/50 px-3 py-1 rounded-md">{quality}</span>
            </div>
            <input
              id="quality-slider"
              type="range"
              min="1"
              max="100"
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={onClose}
            className="w-full bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
          >
            Cancelar
          </button>
          <button
            onClick={handleDownloadClick}
            className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
          >
            Baixar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;
