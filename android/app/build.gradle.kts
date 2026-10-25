import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "be.syntaxya.lodica"
    compileSdk {
        version = release(37) { minorApiLevel = 1 }
    }

    defaultConfig {
        applicationId = "be.syntaxya.lodica"
        minSdk = 26
        targetSdk = 36
        versionCode = 107
        versionName = "1.13.6"
        ndk { abiFilters += "arm64-v8a" }

        // Shared secret for the Lodica VPS relay (proxy, mail, tabs). Lives in the gitignored keystore/
        // dir; an empty value disables the VPS features at runtime.
        val relayToken = rootDir.resolve("keystore/relay-token").takeIf { it.isFile }?.readText()?.trim().orEmpty()
        buildConfigField("String", "RELAY_TOKEN", "\"$relayToken\"")

        // Firebase client config for instant support alerts (FCM). keystore/fcm.properties holds app_id,
        // api_key, project_id and sender_id; without it push stays off and the app keeps polling.
        val fcm = Properties().apply { rootDir.resolve("keystore/fcm.properties").takeIf { it.isFile }?.reader()?.use { load(it) } }
        for (k in listOf("app_id", "api_key", "project_id", "sender_id"))
            buildConfigField("String", "FCM_" + k.uppercase(), "\"${fcm.getProperty(k, "").trim()}\"")
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("LODICA_KEYSTORE") ?: "${rootDir}/keystore/lodica.jks")
            storePassword = System.getenv("LODICA_KEYSTORE_PASS") ?: ""
            keyAlias = "lodica"
            keyPassword = System.getenv("LODICA_KEYSTORE_PASS") ?: ""
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        jniLibs { useLegacyPackaging = false }
    }
    androidResources {
        // uBlock Origin ships many small list files; keep them uncompressed for fast startup reads.
        noCompress += listOf("txt", "json")
    }
}

dependencies {
    implementation("org.mozilla.geckoview:geckoview-arm64-v8a:157.0.20260924084938")
    // QR decoding for importing an authenticator export from a screenshot
    implementation("com.google.zxing:core:3.5.3")

    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-process:2.11.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    // Instant support alerts. Initialised by hand from BuildConfig, no google-services plugin.
    implementation("com.google.firebase:firebase-messaging:25.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("net.zetetic:sqlcipher-android:4.19.1@aar")
    implementation("androidx.sqlite:sqlite:2.7.1")
    // Signs the per-site web-app wrapper APKs (#27) on the phone.
    implementation("com.android.tools.build:apksig:9.4.1")
    implementation("com.caverock:androidsvg-aar:1.4")
    // Silent web-app installs through Shizuku (#34).
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
}

/** Copies the unsigned :webapp release APK into the app's assets as `webapp/template.apk`. */
abstract class WebAppTemplate : DefaultTask() {
    @get:InputFiles abstract val apks: ConfigurableFileCollection
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val apk = apks.asFileTree.files.single { it.name.endsWith(".apk") }
        val out = outputDir.get().asFile.resolve("webapp").apply { deleteRecursively(); mkdirs() }
        apk.copyTo(out.resolve("template.apk"), overwrite = true)
    }
}

val webAppTemplate = tasks.register<WebAppTemplate>("webAppTemplate") {
    apks.from(project(":webapp").layout.buildDirectory.dir("outputs/apk/release"))
    dependsOn(":webapp:assembleRelease")
}

/** Bundles the repo's PATCH_NOTES.md so the app can show it under Settings > About. */
abstract class PatchNotes : DefaultTask() {
    @get:InputFile abstract val notes: RegularFileProperty
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile.apply { deleteRecursively(); mkdirs() }
        notes.get().asFile.copyTo(out.resolve("PATCH_NOTES.md"), overwrite = true)
    }
}

val patchNotes = tasks.register<PatchNotes>("patchNotes") {
    notes.set(rootProject.layout.projectDirectory.file("PATCH_NOTES.md"))
}

androidComponents {
    onVariants { v ->
        v.sources.assets?.addGeneratedSourceDirectory(webAppTemplate, WebAppTemplate::outputDir)
        v.sources.assets?.addGeneratedSourceDirectory(patchNotes, PatchNotes::outputDir)
    }
}
