package com.getvariapp

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // The window in the app's saved dark/light mode, before JS has loaded.
    FullScreenReminderModule.applySavedAppearance(this)
    // A hydration reminder's full-screen intent is the only launch that can
    // arrive with the phone locked; let it wake the screen and show over the
    // keyguard. JS turns this off again once the reminder is answered.
    FullScreenReminderModule.showOverLockScreenIfLocked(this)
  }

  /**
   * `launchMode` is `singleTask`, so a reminder arriving while the app is
   * merely backgrounded lands here rather than in [onCreate].
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    FullScreenReminderModule.showOverLockScreenIfLocked(this)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "GetVariApp"

  /**
   * We use [DefaultReactActivityDelegate] which allows enabling the New Architecture with one flag.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
