package com.maazym.customer;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(LaunchExternalAppPlugin.class);
    super.onCreate(savedInstanceState);
    applyWebViewNoOverscroll();
  }

  @Override
  public void onResume() {
    super.onResume();
    applyWebViewNoOverscroll();
  }

  /** Capacitor creates the WebView during BridgeActivity.onCreate; re-apply after resume for safety. */
  private void applyWebViewNoOverscroll() {
    if (getBridge() == null || getBridge().getWebView() == null) {
      return;
    }
    final View wv = getBridge().getWebView();
    wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
    wv.post(
        () -> {
          if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
          }
        });
  }
}
