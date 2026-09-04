# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ---------------------------------------------------------------------------
# Keep rules for this app's native modules.
#
# `enableProguardInReleaseBuilds` is false today, so none of this is load
# bearing yet. It is here because the day someone turns minification on is
# exactly the day these break, and they break *silently*: a stripped native
# module surfaces as `NativeModules.PhoneNumberModule` being undefined at
# runtime, which this app treats as "the device cannot offer the SIM picker"
# and quietly falls back to the manual field. No crash, no log, just a feature
# that is gone from the release build and present in debug.
# ---------------------------------------------------------------------------

# React Native bridges to these by name from JavaScript, so the class name and
# every @ReactMethod has to survive.
-keep class com.getvariapp.PhoneNumberModule { *; }
-keep class com.getvariapp.PhoneNumberPackage { *; }
-keep class com.getvariapp.BluetoothModule { *; }
-keep class com.getvariapp.BluetoothPackage { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }

# Play Services Phone Number Hint API — see PhoneNumberModule.kt.
-keep class com.google.android.gms.auth.api.identity.** { *; }
-dontwarn com.google.android.gms.auth.api.identity.**
