import { useEffect, useState } from 'react';
import { ADMIN_CHANGED_EVENT, hasAdminKey } from '../services/artistsApi';

export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(hasAdminKey());
  useEffect(() => {
    const update = () => setAdmin(hasAdminKey());
    window.addEventListener(ADMIN_CHANGED_EVENT, update);
    return () => window.removeEventListener(ADMIN_CHANGED_EVENT, update);
  }, []);
  return admin;
}
