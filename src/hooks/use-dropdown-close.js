import { useEffect, useRef } from 'react';

/**
 * Fecha um dropdown quando:
 * - usuário clica fora do container
 * - usuário pressiona Escape
 *
 * @param {boolean} open
 * @param {() => void} onClose
 */
export function useDropdownClose(open, onClose) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return containerRef;
}
