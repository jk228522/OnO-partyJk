import React, { useEffect, useRef } from 'react';
import { MasterGuestSyncEngine, SyncPayload } from './src/services/MasterGuestSyncEngine';
import { MediaExtractorBrowser } from './src/components/MediaExtractorBrowser';

export default function App() {
  const syncEngineRef = useRef<MasterGuestSyncEngine>(new MasterGuestSyncEngine());

  useEffect(() => {
    const syncEngine = syncEngineRef.current;

    // Connect custom transport layer (WebSocket / Local Hotspot Socket)
    syncEngine.registerTransport((payload: SyncPayload) => {
      // Send JSON payload to socket connection
      // socket.send(JSON.stringify(payload));
    });

    return () => {
      syncEngine.destroy();
    };
  }, []);

  return <MediaExtractorBrowser syncEngine={syncEngineRef.current} />;
}
