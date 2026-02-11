import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

const OfflineContext = createContext(null);

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within OfflineProvider');
  return context;
};

// Initialize localforage stores
const actionQueue = localforage.createInstance({ name: 'inventory', storeName: 'actionQueue' });
const objectsCache = localforage.createInstance({ name: 'inventory', storeName: 'objectsCache' });
const referencesCache = localforage.createInstance({ name: 'inventory', storeName: 'referencesCache' });

export const OfflineProvider = ({ children, api }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load pending actions count
  useEffect(() => {
    loadPendingActions();
  }, []);

  const loadPendingActions = async () => {
    try {
      const keys = await actionQueue.keys();
      const actions = await Promise.all(keys.map(k => actionQueue.getItem(k)));
      setPendingActions(actions.filter(Boolean));
    } catch (e) {
      console.error('Error loading pending actions:', e);
    }
  };

  // Queue an action for sync
  const queueAction = async (actionType, objectId, data) => {
    const action = {
      local_id: uuidv4(),
      action_type: actionType,
      object_id: objectId,
      data,
      timestamp: new Date().toISOString()
    };

    await actionQueue.setItem(action.local_id, action);
    await loadPendingActions();
    
    // Try to sync immediately if online
    if (isOnline) {
      syncActions();
    }

    return action;
  };

  // Sync all pending actions
  const syncActions = useCallback(async () => {
    if (syncing || !isOnline) return;

    setSyncing(true);
    try {
      const keys = await actionQueue.keys();
      if (keys.length === 0) {
        setSyncing(false);
        return;
      }

      const actions = await Promise.all(keys.map(k => actionQueue.getItem(k)));
      const validActions = actions.filter(Boolean);

      if (validActions.length === 0) {
        setSyncing(false);
        return;
      }

      const deviceId = localStorage.getItem('deviceId') || uuidv4();
      localStorage.setItem('deviceId', deviceId);

      const res = await api.post('/sync', {
        actions: validActions,
        device_id: deviceId
      });

      // Remove synced actions
      for (const result of res.data.results) {
        if (result.status !== 'error') {
          await actionQueue.removeItem(result.local_id);
        }
      }

      setLastSync(new Date().toISOString());
      await loadPendingActions();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  }, [api, isOnline, syncing]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingActions.length > 0) {
      syncActions();
    }
  }, [isOnline, pendingActions.length, syncActions]);

  // Cache objects locally
  const cacheObject = async (obj) => {
    await objectsCache.setItem(obj.id, obj);
  };

  const getCachedObject = async (id) => {
    return await objectsCache.getItem(id);
  };

  const getCachedObjectByQR = async (qrCode) => {
    const keys = await objectsCache.keys();
    for (const key of keys) {
      const obj = await objectsCache.getItem(key);
      if (obj?.qr_code === qrCode) return obj;
    }
    return null;
  };

  // Cache references
  const cacheReferences = async (type, data) => {
    await referencesCache.setItem(type, data);
  };

  const getCachedReferences = async (type) => {
    return await referencesCache.getItem(type) || [];
  };

  // Clear all cached data
  const clearCache = async () => {
    await actionQueue.clear();
    await objectsCache.clear();
    await referencesCache.clear();
    setPendingActions([]);
  };

  // Field session storage - saves common fields between objects
  const SESSION_KEY = 'fieldSession';
  
  const getFieldSession = () => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      return session ? JSON.parse(session) : {
        floor: '',
        department: '',
        mol: '',
        category: '',
        room: ''
      };
    } catch {
      return { floor: '', department: '', mol: '', category: '', room: '' };
    }
  };
  
  const saveFieldSession = (fields) => {
    try {
      const current = getFieldSession();
      const updated = { ...current, ...fields };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving field session:', e);
    }
  };
  
  const clearFieldSession = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <OfflineContext.Provider value={{
      isOnline,
      pendingActions,
      syncing,
      lastSync,
      queueAction,
      syncActions,
      cacheObject,
      getCachedObject,
      getCachedObjectByQR,
      cacheReferences,
      getCachedReferences,
      clearCache,
      pendingCount: pendingActions.length,
      // Field session
      getFieldSession,
      saveFieldSession,
      clearFieldSession
    }}>
      {children}
    </OfflineContext.Provider>
  );
};
