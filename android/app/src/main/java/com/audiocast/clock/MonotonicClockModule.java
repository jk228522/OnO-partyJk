package com.audiocast.clock;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.os.SystemClock;

public class MonotonicClockModule extends ReactContextBaseJavaModule {
    public MonotonicClockModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "MonotonicClock";
    }

    @ReactMethod
    public void getMonotonicTimeMs(Promise promise) {
        // Monotonic system clock unaffected by NTP time changes
        double timeMs = SystemClock.elapsedRealtimeNanos() / 1000000.0;
        promise.resolve(timeMs);
    }
}
