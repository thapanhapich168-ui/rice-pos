import { useEffect } from 'react';

/**
 * A custom hook that runs a specific function whenever the user 
 * clicks or tabs back into this browser window.
 */
export function useFocusRefresh(refreshFunction: () => void) {
  useEffect(() => {
    const onFocus = () => {
      refreshFunction();
    };

    // Listen for the window gaining focus
    window.addEventListener('focus', onFocus);

    // Cleanup the listener when the component unmounts
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshFunction]);
}