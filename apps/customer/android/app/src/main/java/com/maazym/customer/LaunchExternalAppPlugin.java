package com.maazym.customer;

import android.content.Intent;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaunchExternalApp")
public class LaunchExternalAppPlugin extends Plugin {

  @PluginMethod
  public void openPackage(PluginCall call) {
    String packageId = call.getString("packageId");
    if (packageId == null || packageId.isEmpty()) {
      call.reject("packageId is required");
      return;
    }
    PackageManager pm = getContext().getPackageManager();
    Intent launchIntent = pm.getLaunchIntentForPackage(packageId);
    if (launchIntent == null) {
      call.reject("App not installed: " + packageId);
      return;
    }
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (getActivity() != null) {
      getActivity().startActivity(launchIntent);
    } else {
      getContext().startActivity(launchIntent);
    }
    call.resolve();
  }
}
