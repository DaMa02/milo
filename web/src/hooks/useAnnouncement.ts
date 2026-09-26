import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep the live region mounted; a cleared frame makes repeated results announce. */
export function useAnnouncement() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage('');
    timer.current = setTimeout(() => setMessage(text), 80);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, announce };
}
