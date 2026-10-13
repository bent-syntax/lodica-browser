// Template for "Install as app" (#27). The unsigned release APK is bundled in Lodica's assets; Lodica patches
// the package name, label, URL and icon on the phone and signs the result with a key that never leaves it.
plugins {
    id("com.android.application")
}

android {
    namespace = "be.syntaxya.lodica.wrap"
    compileSdk {
        version = release(37) { minorApiLevel = 1 }
    }

    defaultConfig {
        // Replaced on the phone with be.syntaxya.lodica.app.w<12 hex of sha256(origin)>; keep the length.
        applicationId = "be.syntaxya.lodica.app.w000000000000"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1"
    }

    buildTypes {
        release {
            // R8 drops the Kotlin stdlib that AGP adds by default; Launch is kept through the manifest.
            isMinifyEnabled = true
        }
    }

    packaging {
        resources {
            excludes += listOf("kotlin/**", "META-INF/**")
        }
    }
}
