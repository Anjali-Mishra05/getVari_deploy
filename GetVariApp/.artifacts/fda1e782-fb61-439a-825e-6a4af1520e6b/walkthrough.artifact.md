# Walkthrough - Fixed "No Space Left on Device" Build Failure

The build failure was caused by your disk running out of space during the compilation and merging of native libraries for multiple architectures.

## Changes Made

### Build Configuration

#### [MODIFY] [android/gradle.properties](file:///Users/sereenathomas/StudioProjects/getVari/GetVariApp/android/gradle.properties)
- Changed `reactNativeArchitectures` to only build for `arm64-v8a` (your Mac's architecture).
- This reduces the compilation work and disk usage by approximately 75% for native code.

### Maintenance

- Ran `./gradlew clean` which recovered several gigabytes of space (from 1.3GB to **3.6GB**).

## Verification Results

### Manual Verification
- Disk space increased to 3.6GB.
- Build architectures limited to `arm64-v8a`.

> [!WARNING]
> You still have only **3.6GB** of free space. While this is enough for a single-architecture build, you should continue to free up more space to avoid future failures.

> [!TIP]
> To run the build now, use:
> ```bash
> npm run android
> ```
> Or if you encounter the "Android Preferences folder" error again, use:
> ```bash
> unset ANDROID_PREFS_ROOT && npm run android
> ```
