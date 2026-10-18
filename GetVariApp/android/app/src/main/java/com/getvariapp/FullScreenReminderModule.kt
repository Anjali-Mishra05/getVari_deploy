package com.getvariapp

import android.app.Activity
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.LifecycleState

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
 *
 * ## And why the full-screen intent is only half the feature
 *
 * A full-screen intent is not a general "open my app" mechanism. Android
 * launches the activity only while the screen is **off or locked**; the moment
 * the user is actually holding an unlocked phone, the platform deliberately
 * downgrades it to a heads-up banner. That is documented behaviour on
 * `Notification.Builder.setFullScreenIntent`, not a bug and not something a
 * flag can switch off.
 *
 * So the case the reminder most needs to cover — the user is awake, using
 * their phone, and has not had water in three hours — is precisely the case
 * the full-screen intent does *not* handle. [presentReminder] is that half: it
 * starts the activity itself when the device is unlocked and in use, and stays
 * out of the way when the OS is already doing it.
 */
class FullScreenReminderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FullScreenReminderModule"

    /**
     * `isDebugBuild`: Gradle's own debug/release flag. `__DEV__` cannot stand
     * in for it — the debug APK packages its JS bundle with dev off (see
     * `debuggableVariants` in app/build.gradle), so `__DEV__` is false there
     * whenever Metro is not serving.
     *
     * `internalVersion`: the 0.1.DD.MM version fixed when the APK was built
     * (see `INTERNAL_VERSION` in app/build.gradle).
     */
    override fun getConstants(): Map<String, Any> = mapOf(
        "isDebugBuild" to BuildConfig.DEBUG,
        "internalVersion" to BuildConfig.INTERNAL_VERSION,
    )

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
            // Nothing to read. `null` means "not verified" — the JS side keeps
            // the permission step up rather than treating it as granted.
            promise.resolve(null)
            return
        }

        try {
            promise.resolve(manager.canUseFullScreenIntent())
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Could not read full-screen intent state: ${e.message}")
            promise.resolve(null)
        }
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

    /* -------------------------------------------------------------- *
     * Raising the reminder while the phone is unlocked and in use
     * -------------------------------------------------------------- */

    /**
     * Whether this app may start an activity from the background.
     *
     * Since Android 10 a backgrounded app cannot simply call `startActivity` —
     * the launch is dropped, and (short of a logcat line) silently. The
     * exemption that fits a reminder is `SYSTEM_ALERT_WINDOW`, "Display over
     * other apps", which the user grants in Settings; it is the same shape of
     * opt-in as the full-screen-intent grant above, and it is what the alarm
     * and timer apps this reminder is modelled on rely on.
     *
     * Below API 29 there is no such restriction, so there is nothing to ask
     * for and this reports true.
     */
    @ReactMethod
    fun canLaunchOverOtherApps(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.resolve(true)
            return
        }
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    }

    /** Opens the "Display over other apps" screen for this app. */
    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactApplicationContext.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) activity.startActivity(intent) else reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Could not open overlay settings: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Bring the app's reminder screen up over whatever the user is doing.
     *
     * Resolves with the reason it did or did not act, so the JS side can say
     * something true about why a reminder stayed a banner instead of guessing:
     *
     *  - `launched` — the activity was started.
     *  - `os-full-screen-intent` — the screen is off or locked, so the
     *    notification's own full-screen intent is the path that fires. Doing it
     *    again here would be a duplicate launch, and on `singleTask` that means
     *    a redundant `onNewIntent` on an activity already coming up.
     *  - `already-foreground` — the app is on screen; `ReminderFullScreen` is
     *    driven by the outstanding reminder and comes up without any of this.
     *  - `not-permitted` — no "Display over other apps" grant, so Android would
     *    drop the launch. Reported rather than attempted, because a silently
     *    swallowed `startActivity` is indistinguishable from a working one.
     *  - `failed` — the launch threw.
     */
    @ReactMethod
    fun presentReminder(promise: Promise) {
        val context = reactApplicationContext

        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager

        // A missing service is read as "screen on, unlocked": that is the state
        // this method exists for, and the checks below still stop anything
        // unwanted from happening.
        val interactive = power?.isInteractive ?: true
        val locked = keyguard?.isKeyguardLocked ?: false

        if (!interactive || locked) {
            promise.resolve(RESULT_OS_HANDLES_IT)
            return
        }

        if (context.lifecycleState == LifecycleState.RESUMED) {
            promise.resolve(RESULT_ALREADY_FOREGROUND)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(context)) {
            promise.resolve(RESULT_NOT_PERMITTED)
            return
        }

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (intent == null) {
            promise.resolve(RESULT_FAILED)
            return
        }

        // `MainActivity` is `singleTask`, so this brings the existing task
        // forward and arrives at `onNewIntent` rather than building a second
        // copy of the app. No `CLEAR_TOP`: a reminder must not throw away the
        // screen the user was on inside the app.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        intent.putExtra(EXTRA_FROM_REMINDER, true)

        try {
            context.startActivity(intent)
            promise.resolve(RESULT_LAUNCHED)
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Could not raise the reminder screen: ${e.message}")
            promise.resolve(RESULT_FAILED)
        }
    }

    /**
     * Turns showing over the lock screen on or off for the running activity.
     *
     * JS turns it off once no reminder is outstanding, so the lock screen
     * comes back and the rest of the app needs an unlock. Resolves false when
     * there is no activity to change.
     */
    @ReactMethod
    fun setShowOverLockScreen(enabled: Boolean, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                applyShowOverLockScreen(activity, enabled)
                promise.resolve(true)
            } catch (e: Exception) {
                android.util.Log.w(TAG, "Could not change lock-screen display: ${e.message}")
                promise.resolve(false)
            }
        }
    }

    /* -------------------------------------------------------------- *
     * Appearance of the native window
     * -------------------------------------------------------------- */

    /**
     * Remembers the app's dark/light mode for the native side and repaints
     * the running window in it.
     *
     * The mode is chosen and kept in JS. It is copied here only because the
     * window is drawn before JS has loaded: on a launch from a reminder's
     * full-screen intent there is nothing else on screen at that point, and
     * the window must already be in the mode the user chose.
     */
    @ReactMethod
    fun setAppearance(mode: String) {
        try {
            reactApplicationContext
                .getSharedPreferences(APPEARANCE_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(APPEARANCE_KEY, if (mode == "light") "light" else "dark")
                .apply()
            val activity = reactApplicationContext.currentActivity ?: return
            activity.runOnUiThread { applySavedAppearance(activity) }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Could not store the appearance: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "FullScreenReminder"

        private const val APPEARANCE_PREFS = "getvari_appearance"
        private const val APPEARANCE_KEY = "theme_mode"

        /** The page colours of the two modes, as `theme.ts` draws them. */
        private const val DARK_WINDOW = 0xFF02050E.toInt()
        private const val LIGHT_WINDOW = 0xFFF5F5F3.toInt()

        /**
         * Paints the window in the saved mode. Called by `MainActivity` before
         * anything is drawn, so no launch — a reminder's included — shows the
         * other mode while JS loads. Does nothing until a mode has been saved.
         */
        @JvmStatic
        fun applySavedAppearance(activity: Activity) {
            try {
                val mode =
                    activity
                        .getSharedPreferences(APPEARANCE_PREFS, Context.MODE_PRIVATE)
                        .getString(APPEARANCE_KEY, null) ?: return
                activity.window.setBackgroundDrawable(
                    ColorDrawable(if (mode == "light") LIGHT_WINDOW else DARK_WINDOW)
                )
            } catch (e: Exception) {
                android.util.Log.w(TAG, "Could not apply the saved appearance: ${e.message}")
            }
        }

        /**
         * Called by `MainActivity` on every launch (`onCreate`) and relaunch
         * (`onNewIntent`). When the phone is locked or its screen is off at
         * that moment, the launch is a hydration reminder's full-screen intent
         * — the only thing that starts this activity without an unlock — so
         * the activity is allowed to wake the screen and show over the
         * keyguard.
         *
         * Deliberately runtime rather than `android:showWhenLocked` in the
         * manifest: a static flag would put the whole app over the lock screen
         * every time. The keyguard is not dismissed either; a PIN-protected
         * phone still needs its PIN to leave the reminder for the rest of the
         * app, and JS turns this off again once the reminder is answered.
         */
        @JvmStatic
        fun showOverLockScreenIfLocked(activity: Activity) {
            val power = activity.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val keyguard = activity.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            val locked = keyguard?.isKeyguardLocked ?: false
            val screenOff = !(power?.isInteractive ?: true)
            if (locked || screenOff) applyShowOverLockScreen(activity, true)
        }

        @JvmStatic
        fun applyShowOverLockScreen(activity: Activity, enabled: Boolean) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(enabled)
                activity.setTurnScreenOn(enabled)
            } else {
                @Suppress("DEPRECATION")
                val flags =
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                if (enabled) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
            }
        }

        /** Marks the launch as a reminder's, for anything that inspects the intent. */
        const val EXTRA_FROM_REMINDER = "getvari.fromReminder"

        const val RESULT_LAUNCHED = "launched"
        const val RESULT_OS_HANDLES_IT = "os-full-screen-intent"
        const val RESULT_ALREADY_FOREGROUND = "already-foreground"
        const val RESULT_NOT_PERMITTED = "not-permitted"
        const val RESULT_FAILED = "failed"
    }
}
