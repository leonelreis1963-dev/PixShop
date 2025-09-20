/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

interface ImageSizeWarningModalProps {
  onClose: () => void;
  onConfirm: () => void;
  onContinue: () => void;
}

const ImageSizeWarningModal: React.FC<ImageSizeWarningModalProps> = ({ onClose, onConfirm, onContinue }) => {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="size-warning-modal-title"
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 w-full max-w-lg m-4 flex flex-col gap-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="size-warning-modal-title" className="text-2xl font-bold text-yellow-300">
          Imagem Grande Detectada
        </h2>
        <p className="text-gray-300">
          Sua imagem é bastante grande. Para garantir um desempenho mais rápido e estável, recomendamos redimensioná-la.
        </p>
        <p className="text-sm text-gray-400">
          Continuar com a imagem original pode resultar em tempos de processamento mais longos e possíveis problemas de desempenho.
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={onContinue}
            className="w-full bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
          >
            Continuar Mesmo Assim
          </button>
          <button
            onClick={onConfirm}
            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
          >
            Redimensionar e Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSizeWarningModal;
