package be.syntaxya.lodica

import android.app.Application

/**
 * Gecko spawns child processes that also run Application.onCreate, so no
 * engine work happens here. The runtime is created lazily from MainActivity.
 */
class LodicaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
    }
}
