import React, { useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { MasterGuestSyncEngine } from '../services/MasterGuestSyncEngine';

interface MediaExtractorProps {
  syncEngine: MasterGuestSyncEngine;
}

const INJECTED_MEDIA_EXTRACTOR_SCRIPT = `
(function() {
  if (window.__mediaExtractorInjected) return;
  window.__mediaExtractorInjected = true;

  function extractAndBroadcast(element, eventType) {
    var src = element.currentSrc || element.src;
    if (!src && element.getElementsByTagName('source').length > 0) {
      src = element.getElementsByTagName('source')[0].src;
    }

    if (src && src.indexOf('blob:') !== 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MEDIA_EXTRACTED',
        eventType: eventType,
        mediaUrl: src,
        currentTime: element.currentTime || 0
      }));
    }
  }

  function attachListeners(el) {
    if (el.__hasMediaSync) return;
    el.__hasMediaSync = true;

    ['play', 'seeking'].forEach(function(evt) {
      el.addEventListener(evt, function() {
        extractAndBroadcast(el, evt);
      });
    });
  }

  document.querySelectorAll('video, audio').forEach(attachListeners);

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            attachListeners(node);
          }
          node.querySelectorAll && node.querySelectorAll('video, audio').forEach(attachListeners);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
true;
`;

export const MediaExtractorBrowser: React.FC<MediaExtractorProps> = ({ syncEngine }) => {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('https://soundcloud.com');
  const [inputUrl, setInputUrl] = useState<string>('https://soundcloud.com');
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [extractedMediaSrc, setExtractedMediaSrc] = useState<string | null>(null);

  const handleNavigate = () => {
    let formattedUrl = inputUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }
    setCurrentUrl(formattedUrl);
  };

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (payload.type === 'MEDIA_EXTRACTED' && payload.mediaUrl) {
          setExtractedMediaSrc(payload.mediaUrl);
          const startOffsetMs = Math.floor((payload.currentTime || 0) * 1000);
          syncEngine.hostTriggerPlay(payload.mediaUrl, startOffsetMs);
        }
      } catch (err) {
        // Non-JSON message from webview
      }
    },
    [syncEngine]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.webViewWrapper}>
        <View style={styles.navBar}>
          <TouchableOpacity
            disabled={!canGoBack}
            onPress={() => webViewRef.current?.goBack()}
            style={[styles.navBtn, !canGoBack && styles.disabledBtn]}
          >
            <Text style={styles.btnText}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!canGoForward}
            onPress={() => webViewRef.current?.goForward()}
            style={[styles.navBtn, !canGoForward && styles.disabledBtn]}
          >
            <Text style={styles.btnText}>›</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.addressBar}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleNavigate}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />

          <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.navBtn}>
            <Text style={styles.btnText}>↻</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            injectedJavaScript={INJECTED_MEDIA_EXTRACTOR_SCRIPT}
            onMessage={handleWebViewMessage}
            onNavigationStateChange={(navState) => {
              setCanGoBack(navState.canGoBack);
              setCanGoForward(navState.canGoForward);
              setInputUrl(navState.url);
              setIsLoading(navState.loading);
            }}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            style={{ flex: 1 }}
          />
          {isLoading && (
            <ActivityIndicator
              size="small"
              color="#0000ff"
              style={styles.loadingIndicator}
            />
          )}
        </View>
      </View>

      <View style={styles.controlPanel}>
        <Text style={styles.panelTitle}>Sync Engine Diagnostics</Text>
        <Text style={styles.statusText} numberOfLines={1}>
          Active Stream: {extractedMediaSrc ? extractedMediaSrc : 'No media detected'}
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.hostBtn}
            onPress={() => syncEngine.setHostMode(true)}
          >
            <Text style={styles.hostBtnText}>Set as Host</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.guestBtn}
            onPress={() => syncEngine.setHostMode(false)}
          >
            <Text style={styles.guestBtnText}>Set as Guest</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const windowHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  webViewWrapper: {
    height: windowHeight * 0.65,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  navBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#1E1E1E',
  },
  navBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  disabledBtn: {
    opacity: 0.3,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  addressBar: {
    flex: 1,
    height: 32,
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 13,
    marginHorizontal: 4,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  loadingIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  controlPanel: {
    flex: 1,
    padding: 16,
    backgroundColor: '#181818',
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusText: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hostBtn: {
    flex: 0.48,
    backgroundColor: '#1DB954',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  guestBtn: {
    flex: 0.48,
    backgroundColor: '#333333',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  hostBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  guestBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
