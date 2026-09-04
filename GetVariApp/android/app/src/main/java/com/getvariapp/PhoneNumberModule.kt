package com.getvariapp

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity

/**
 * Reads the numbers on the device's SIMs, so the user does not type theirs.
 *
 * ## Why the Phone Number Hint API and not TelephonyManager
 *
 * The obvious approach — `TelephonyManager.getLine1Number()` — is the wrong
 * one twice over. It needs READ_PHONE_NUMBERS (READ_PHONE_STATE before API 33),
 * a runtime permission users refuse and Play reviews; and it reads the MSISDN
 * off the SIM, which most Indian carriers never write, so on the phones this
 * app is for it usually returns an empty string anyway.
 *
 * The Phone Number Hint API asks Play Services instead. It shows a system
 * sheet listing every number on the device, the user taps one, and the app
 * receives it — **no runtime permission at all**, because the user's tap *is*
 * the consent. On a dual-SIM phone they choose which line, which is not
 * something the SIM read can offer.
 *
 * The failure modes are ordinary and are all reported as a resolved `null`
 * rather than as errors: a device with no Play Services, a device with no
 * SIM, or a user who dismisses the sheet. The caller falls back to the text
 * field it already has.
 */
class PhoneNumberModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pendingPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "PhoneNumberModule"

    /**
     * Shows the number picker.
     *
     * Resolves with `{ phoneNumber, dismissed }`. `phoneNumber` is E.164 as
     * Play Services reports it (e.g. "+919876543210"); `dismissed` is true
     * when the user closed the sheet without choosing, which is a normal
     * outcome and not a failure.
     */
    @ReactMethod
    fun requestPhoneNumberHint(promise: Promise) {
        // `reactApplicationContext.currentActivity`, not the bare
        // `currentActivity`: the base class's accessor is not visible to Kotlin
        // here, and the context's is what `BluetoothModule` already uses.
        //
        // Bound as a non-null local so the two callbacks below capture an
        // `Activity` rather than an `Activity?` they would each have to
        // re-check.
        val activity: Activity =
            reactApplicationContext.currentActivity
                ?: run {
                    promise.reject("E_NO_ACTIVITY", "No activity is attached to show the picker.")
                    return
                }

        // A second call while one sheet is open would strand the first
        // promise, so the earlier caller is settled before it is replaced.
        pendingPromise?.let { settle(it, null, dismissed = true) }
        pendingPromise = promise

        val request = GetPhoneNumberHintIntentRequest.builder().build()
        Identity.getSignInClient(activity)
            .getPhoneNumberHintIntent(request)
            .addOnSuccessListener { result ->
                try {
                    activity.startIntentSenderForResult(
                        result.intentSender,
                        REQUEST_CODE,
                        null,
                        0,
                        0,
                        0,
                        null
                    )
                } catch (e: IntentSender.SendIntentException) {
                    resolvePending(null, dismissed = true)
                }
            }
            .addOnFailureListener { error ->
                // No Play Services, no SIM, or the API is unavailable on this
                // build. All of these mean "we cannot offer this", which the
                // caller handles by showing the manual field.
                android.util.Log.i(TAG, "Phone number hint unavailable: ${error.message}")
                resolvePending(null, dismissed = false)
            }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode != REQUEST_CODE) return

        val promise = pendingPromise ?: return

        if (resultCode != Activity.RESULT_OK || data == null) {
            settle(promise, null, dismissed = true)
            pendingPromise = null
            return
        }

        val number = try {
            Identity.getSignInClient(activity).getPhoneNumberFromIntent(data)
        } catch (e: Exception) {
            android.util.Log.i(TAG, "Could not read the chosen number: ${e.message}")
            null
        }

        settle(promise, number, dismissed = number == null)
        pendingPromise = null
    }

    override fun onNewIntent(intent: Intent) {
        // No-op: the picker returns through onActivityResult.
    }

    private fun resolvePending(number: String?, dismissed: Boolean) {
        pendingPromise?.let { settle(it, number, dismissed) }
        pendingPromise = null
    }

    private fun settle(promise: Promise, number: String?, dismissed: Boolean) {
        val payload = Arguments.createMap().apply {
            if (number == null) putNull("phoneNumber") else putString("phoneNumber", number)
            putBoolean("dismissed", dismissed)
        }
        promise.resolve(payload)
    }

    companion object {
        private const val TAG = "PhoneNumberModule"
        private const val REQUEST_CODE = 4721
    }
}
