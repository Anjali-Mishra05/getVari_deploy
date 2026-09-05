package com.getvariapp

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Whether this app may raise a hydration reminder as a full-screen intent, and
 * a way to send the user to the setting that grants it.
 *
 * ## Why a native module is needed at all
 *
 * Notifee will happily attach a `fullScreenAction` to a notification, and
 * Android will silently ignore it when the app lacks the grant — the reminder
 * degrades to a heads-up banner with no error and no callback. That silence is
 * the problem: without a way to read the state, the app cannot tell the user
 * why the reminder they asked for is still just a banner, and cannot offer to
 * fix it.
 *
 * `NotificationManager.canUseFullScreenIntent()` is the only honest answer and
 * it exists solely on the Java side, so it is bridged here.
 *
 * ## What changed in Android 14
 *
 * Up to API 33, declaring `USE_FULL_SCREEN_INTENT` in the manifest was enough.
 * From API 34 the permission is auto-granted only to apps the Play Store
 * classifies as calling or alarm-clock apps; every other app starts revoked
 * and must ask the user through
 * `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`. A hydration reminder is not a
 * phone call, so it is firmly in the second group — which is why the app has
 * to treat the full-screen reminder as an opt-in that may never be granted,
 * rather than as the behaviour it can count on.
 */
class FullScreenReminderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FullScreenReminderModule"

    /**
     * True when a reminder posted right now would actually take over the
     * screen.
     *
     * Below API 34 the manifest permission is the whole story, so this reports
     * true — the notification still has to clear the channel's importance for
     * the OS to honour it, but that is the user's own setting and is checked
     * on the JS side.
     */
    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            promise.resolve(true)
            return
        }

        val manager =
            reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
                as? NotificationManager

        if (manager == null) {
            // Nothing to read. Reporting true keeps the app from nagging about
            // a permission it cannot verify — the reminder still degrades to a
            // banner on its own if the grant is in fact missing.
            promise.resolve(true)
            return
        }

        promise.resolve(manager.canUseFullScreenIntent())
    }

    /**
     * Opens the system screen where the grant is toggled.
     *
     * On API 34+ this is the dedicated per-app full-screen-intent screen. On
     * older releases there is no such screen and nothing to grant, so the user
     * is sent to the app's notification settings instead, which is the nearest
     * useful place and is where channel importance lives — the other setting
     * that can suppress a full-screen reminder.
     */
    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        val packageUri = Uri.parse("package:${reactApplicationContext.packageName}")
        val intent =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
            } else {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(
                    Settings.EXTRA_APP_PACKAGE,
                    reactApplicationContext.packageName
                )
            }

        // Started from a context that is not an activity when the app is in the
        // background, which Android requires a new task for.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) activity.startActivity(intent)
            else reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            // Some OEM builds ship without the settings activity. Nothing the
            // app can do about it, and it must not crash the caller.
            android.util.Log.w(TAG, "Could not open full-screen intent settings: ${e.message}")
            promise.resolve(false)
        }
    }

    companion object {
        private const val TAG = "FullScreenReminder"
    }
}
