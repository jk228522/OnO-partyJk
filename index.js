import { AppRegistry } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// TrackPlayer सर्विस रजिस्ट्रेशन (बैकग्राउंड ऑडियो के लिए आवश्यक)
TrackPlayer.registerPlaybackService(() => async () => {
  // आवश्यक होने पर बैकग्राउंड इवेंट्स (Play/Pause/Skip) यहाँ हैंडल कर सकते हैं
});
