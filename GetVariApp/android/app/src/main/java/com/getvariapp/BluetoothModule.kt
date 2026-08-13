package com.getvariapp

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import com.facebook.react.bridge.*

class BluetoothModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var mPickerPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "BluetoothModule"
    }

    @ReactMethod
    fun enableBluetooth(promise: Promise) {
        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
        if (bluetoothAdapter == null) {
            promise.reject("E_NO_BLUETOOTH", "Bluetooth not supported on this device")
            return
        }

        if (bluetoothAdapter.isEnabled) {
            promise.resolve(true)
            return
        }

        mPickerPromise = promise

        val enableBtIntent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
        val currentActivity = reactApplicationContext.currentActivity

        if (currentActivity == null) {
            promise.reject("E_NO_ACTIVITY", "Activity doesn't exist")
            return
        }

        try {
            currentActivity.startActivityForResult(enableBtIntent, 1)
        } catch (e: Exception) {
            mPickerPromise?.reject("E_FAILED_TO_SHOW_PICKER", e)
            mPickerPromise = null
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 1) {
            if (mPickerPromise != null) {
                if (resultCode == Activity.RESULT_OK) {
                    mPickerPromise?.resolve(true)
                } else {
                    mPickerPromise?.resolve(false)
                }
                mPickerPromise = null
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }
}
