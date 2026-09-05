package com.getvariapp

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    showOverLockScreen()
  }

  /**
   * Called when a full-screen intent reuses the already-running activity —
   * `launchMode` is `singleTask`, so a reminder arriving while the app is
   * merely backgrounded lands here rather than in [onCreate].
   */
  override fun onNewIntent(intent: android.content.Intent?) {
    super.onNewIntent(intent)
    showOverLockScreen()
  }

  /**
   * Let the hydration reminder wake and unlock past the keyguard.
   *
   * A full-screen intent only reaches the user if the activity it launches is
   * allowed to draw over the lock screen; without this the notification
   * silently degrades to an ordinary heads-up banner on a locked phone, which
   * is exactly the case the reminder exists for. The manifest carries the
   * declarative half of this for API 27+; the runtime calls are what apply on
   * older releases and after `onNewIntent`.
   *
   * `requestDismissKeyguard` only dismisses a *non-secure* keyguard. On a
   * phone with a PIN or biometric the reminder is shown on top of the lock
   * screen and the user authenticates before they can act on it, which is the
   * correct trade — the app must not be a way around the device lock.
   */
  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      keyguard?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "GetVariApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
