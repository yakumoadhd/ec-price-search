import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = '826846133648-7rg02uiu9v3n05v97055ljm2j7cg6j1h.apps.googleusercontent.com';

interface Props {
  onSuccess: (accessToken: string) => void;
  onExpired: () => void;
  isLoggedIn: boolean;
}

export default function GoogleLoginButton({ onSuccess, onExpired, isLoggedIn }: Props) {
  const clientRef = useRef<any>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if ((window as any).google) {
        clearInterval(interval);
        clientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/generative-language.retriever',
          callback: (tokenResponse: any) => {
            if (tokenResponse.access_token) {
              onSuccess(tokenResponse.access_token);
            } else {
              onExpired();
            }
          },
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = () => clientRef.current?.requestAccessToken();
  const handleLogout = () => { onExpired(); };

  return isLoggedIn ? (
    <button onClick={handleLogout} className="text-xs px-3 py-1 rounded-md bg-green-600 text-white shrink-0">
      ✓ Google連携中
    </button>
  ) : (
    <button onClick={handleLogin} className="text-xs px-3 py-1 rounded-md bg-white border border-gray-300 text-gray-700 shrink-0">
      Googleでログイン
    </button>
  );
}
