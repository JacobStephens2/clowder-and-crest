package page.stephens.clowder;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Android 15+ (targetSdk 35+) enforces edge-to-edge: the WebView draws
    // under the status bar and the gesture/navigation bar. The Android WebView
    // does NOT feed those insets to CSS env(safe-area-inset-*) (that's an iOS
    // WKWebView feature), so the game's top bar and bottom nav ended up under
    // the system UI. Pad the content root by the system-bar + cutout insets so
    // the WebView sits in the safe region; the padded strips show the window
    // background, which the theme already paints the brand dark color. Bottom
    // padding also grows to clear the IME so login inputs stay visible when the
    // keyboard is open.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
